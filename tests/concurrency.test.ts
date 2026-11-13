import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createRouterClient } from "@orpc/server";
import type { Context } from "@sibol-cse/api/context";
import { appRouter } from "@sibol-cse/api/routers/index";
import { exportAccount, purgePersonalData } from "@sibol-cse/api/services/account-data";
import { createDb } from "@sibol-cse/db";
import {
  account,
  attempt,
  attemptItem,
  privateNote,
  questionVersion,
  reviewEvent,
  reviewState,
  session,
  studyPreferences,
  user,
  userProfile,
} from "@sibol-cse/db/schema";
import { hashPassword } from "better-auth/crypto";
import { and, eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { seedLearning } from "./fixtures/learning";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("Dedicated *_test database required");
const db = createDb({ DATABASE_URL: url });
const password = "concurrency-fixture-passphrase";
let hashed = "",
  profileId = "";
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "packages/db/src/migrations" });
  const tables = await db.$client.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname='public'",
  );
  for (const { tablename } of tables.rows)
    await db.execute(sql.raw(`TRUNCATE TABLE "${tablename.replaceAll('"', '""')}" CASCADE`));
  hashed = await hashPassword(password);
  const admin = crypto.randomUUID();
  await db.insert(user).values({
    id: admin,
    name: "Concurrency editor",
    email: `${admin}@example.test`,
    emailVerified: true,
  });
  await db.insert(userProfile).values({ userId: admin, role: "admin" });
  profileId = (await seedLearning(db, admin)).profileId;
}, 60000);
afterAll(async () => {
  await db.$client.end();
});
async function fixture() {
  const id = crypto.randomUUID(),
    now = new Date();
  const identity = {
    id,
    email: `${id}@example.test`,
    name: "Concurrency learner",
    emailVerified: true,
    image: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(user).values(identity);
  await db.insert(userProfile).values({ userId: id, onboardedAt: now });
  await db
    .insert(studyPreferences)
    .values({ userId: id, level: "professional", days: [1, 3, 5], dailyMinutes: 25 });
  await db.insert(account).values({
    id: crypto.randomUUID(),
    userId: id,
    accountId: id,
    providerId: "credential",
    password: hashed,
  });
  const signed = {
    id: crypto.randomUUID(),
    userId: id,
    token: crypto.randomUUID(),
    expiresAt: new Date(Date.now() + 3600000),
    createdAt: now,
    updatedAt: now,
    ipAddress: null,
    userAgent: null,
  };
  await db.insert(session).values(signed);
  const [version] = await db
    .select()
    .from(questionVersion)
    .where(and(eq(questionVersion.status, "published"), eq(questionVersion.level, "professional")))
    .limit(1);
  if (!version) throw new Error("Missing synthetic question");
  await db.insert(reviewEvent).values({
    userId: id,
    questionId: version.questionId,
    versionId: version.id,
    eventKey: crypto.randomUUID(),
    outcome: "incorrect",
    studyDate: "2026-11-12",
    fromStep: 0,
    toStep: 0,
    selectedChoiceId: "a",
  });
  await db.insert(reviewState).values({
    userId: id,
    questionId: version.questionId,
    dueAt: new Date(0),
    lastVersionId: version.id,
  });
  await db
    .insert(privateNote)
    .values({ userId: id, questionId: version.questionId, body: "Original snapshot note" });
  const context: Context = {
    db,
    sendInvitation: async () => {},
    session: { user: identity, session: signed },
  };
  return { id, version, rpc: createRouterClient(appRouter, { context }) };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function observe<T>(promise: Promise<T>) {
  let done = false;
  const result = promise.then(
    (value) => {
      done = true;
      return { ok: true as const, value };
    },
    (error) => {
      done = true;
      return { ok: false as const, error };
    },
  );
  return {
    result,
    get done() {
      return done;
    },
  };
}
async function until(check: () => Promise<boolean> | boolean) {
  for (let n = 0; n < 300; n++) {
    if (await check()) return;
    await Bun.sleep(10);
  }
  throw new Error("Expected database blocking point was not reached");
}
async function blockedBy(pid: number, fragment: string) {
  const result = await db.$client.query<{ pid: number }>(
    "select pid from pg_stat_activity where datname=current_database() and state='active' and $1=any(pg_blocking_pids(pid)) and query ilike $2",
    [pid, `%${fragment}%`],
  );
  return result.rows[0]?.pid ?? null;
}
async function blocker(statement: string, values: string[] = []) {
  const connection = await db.$client.connect();
  await connection.query("BEGIN");
  const result = await connection.query<{ pid: number }>("select pg_backend_pid() pid");
  try {
    await connection.query(statement, values);
  } catch (error) {
    await connection.query("ROLLBACK");
    connection.release();
    throw error;
  }
  return {
    pid: result.rows[0]?.pid ?? 0,
    async release() {
      await connection.query("ROLLBACK");
      connection.release();
    },
  };
}
function createAssessment(
  f: Fixture,
  mode: "strict_mock" | "diagnostic",
  hold?: { ready: () => void; release: Promise<void> },
) {
  return db.transaction(async (tx) => {
    await tx.select().from(userProfile).where(eq(userProfile.userId, f.id)).for("update");
    const id = crypto.randomUUID();
    await tx.insert(attempt).values({
      id,
      userId: f.id,
      mode,
      profileVersionId: profileId,
      creationKey: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 300000),
    });
    await tx.insert(attemptItem).values({
      attemptId: id,
      position: 0,
      questionVersionId: f.version.id,
      choiceOrder: ["a", "b", "c"],
      firstExposure: false,
    });
    if (hold) {
      hold.ready();
      await hold.release;
    }
    return id;
  });
}
async function heldAssessment(f: Fixture, mode: "strict_mock" | "diagnostic") {
  const ready = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>();
  const creating = createAssessment(f, mode, { ready: ready.resolve, release: release.promise });
  await ready.promise;
  const result = await db.$client.query<{ pid: number }>(
    "select pid from pg_stat_activity where datname=current_database() and state='idle in transaction' and query ilike '%insert into \"attempt_item\"%' order by xact_start desc limit 1",
  );
  const pid = result.rows[0]?.pid;
  if (!pid) {
    release.resolve();
    await creating;
    throw new Error("Missing held assessment transaction");
  }
  return {
    pid,
    async finish() {
      release.resolve();
      return creating;
    },
  };
}

describe("review and account lifecycle serialization", () => {
  test("deletion waits for an already-started manual review and leaves no resurrected records", async () => {
    const f = await fixture();
    const held = await blocker("select pg_advisory_xact_lock(hashtext($1))", [`review:${f.id}`]);
    const scheduling = observe(
      f.rpc.review.tomorrow({ questionId: f.version.questionId, requestId: crypto.randomUUID() }),
    );
    let deletedBeforeRelease = false;
    let deleting:
      | ReturnType<typeof observe<Awaited<ReturnType<typeof f.rpc.account.requestDeletion>>>>
      | undefined;
    try {
      await until(async () => !!(await blockedBy(held.pid, "pg_advisory_xact_lock")));
      deleting = observe(f.rpc.account.requestDeletion({ password, confirmation: "DELETE" }));
      await until(
        async () =>
          deleting?.done ||
          !!(await blockedBy(
            (await blockedBy(held.pid, "pg_advisory_xact_lock")) ?? 0,
            'from "user_profile"',
          )),
      );
      deletedBeforeRelease = deleting.done;
    } finally {
      await held.release();
    }
    const scheduled = await scheduling.result,
      deleted = await deleting?.result;
    expect(deletedBeforeRelease).toBe(false);
    expect(scheduled.ok).toBe(true);
    expect(deleted?.ok).toBe(true);
    expect(await db.select().from(userProfile).where(eq(userProfile.userId, f.id))).toHaveLength(0);
    expect(await db.select().from(reviewState).where(eq(reviewState.userId, f.id))).toHaveLength(0);
    expect(await db.select().from(reviewEvent).where(eq(reviewEvent.userId, f.id))).toHaveLength(0);
  });
  test("a manual review queued behind deletion fails without recreating personal rows", async () => {
    const f = await fixture(),
      ready = Promise.withResolvers<void>(),
      release = Promise.withResolvers<void>();
    let pid = 0;
    const deleting = db.transaction(async (tx) => {
      await tx.select().from(userProfile).where(eq(userProfile.userId, f.id)).for("update");
      pid = (await tx.execute<{ pid: number }>(sql`select pg_backend_pid() pid`)).rows[0]?.pid ?? 0;
      await purgePersonalData(tx, f.id, crypto.randomUUID());
      ready.resolve();
      await release.promise;
    });
    await ready.promise;
    const scheduling = observe(
      f.rpc.review.tomorrow({ questionId: f.version.questionId, requestId: crypto.randomUUID() }),
    );
    try {
      await until(async () => scheduling.done || !!(await blockedBy(pid, 'from "user_profile"')));
    } finally {
      release.resolve();
      await deleting;
    }
    const result = await scheduling.result;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ code: "NOT_FOUND" });
    expect(await db.select().from(reviewState).where(eq(reviewState.userId, f.id))).toHaveLength(0);
    expect(await db.select().from(reviewEvent).where(eq(reviewEvent.userId, f.id))).toHaveLength(0);
  });
  test("notebook feedback finishes before a concurrently starting strict mock can commit", async () => {
    const f = await fixture(),
      held = await blocker("LOCK TABLE review_event IN ACCESS EXCLUSIVE MODE");
    const reading = observe(f.rpc.review.listDue());
    let creating: ReturnType<typeof observe<string>> | undefined,
      startedBeforeRelease = false;
    try {
      let readerPid: number | null = null;
      await until(async () => {
        readerPid = await blockedBy(held.pid, 'from "review_event"');
        return !!readerPid;
      });
      creating = observe(createAssessment(f, "strict_mock"));
      await until(
        async () => creating?.done || !!(await blockedBy(readerPid ?? 0, 'from "user_profile"')),
      );
      startedBeforeRelease = creating.done;
    } finally {
      await held.release();
    }
    const result = await reading.result;
    await creating?.result;
    expect(startedBeforeRelease).toBe(false);
    expect(result.ok && result.value.history[0]?.key).toBeTruthy();
    const fresh = await f.rpc.review.listDue();
    expect(fresh.history).toHaveLength(0);
    expect(fresh.blockedCount).toBe(1);
  });
  for (const mode of ["strict_mock", "diagnostic"] as const) {
    test(`notebook waits for ${mode} creation and returns no blocked feedback`, async () => {
      const f = await fixture(),
        held = await heldAssessment(f, mode);
      const reading = observe(f.rpc.review.listDue());
      try {
        await until(
          async () => reading.done || !!(await blockedBy(held.pid, 'from "user_profile"')),
        );
      } finally {
        await held.finish();
      }
      const result = await reading.result;
      expect(result.ok).toBe(true);
      if (!result.ok) throw result.error;
      expect(result.value.history).toHaveLength(0);
      expect(result.value.blockedCount).toBe(1);
    });
    test(`export retries a snapshot taken before ${mode} commits and emits no private bytes`, async () => {
      const f = await fixture();
      await f.rpc.account.export();
      const held = await heldAssessment(f, mode),
        chunks: string[] = [];
      const exporting = observe(
        exportAccount(db, f.id, async (chunk) => {
          chunks.push(chunk);
        }),
      );
      try {
        await until(
          async () => exporting.done || !!(await blockedBy(held.pid, 'from "user_profile"')),
        );
      } finally {
        await held.finish();
      }
      const result = await exporting.result;
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatchObject({ code: "FORBIDDEN" });
      expect(chunks).toHaveLength(0);
    });
  }
  test("successful export preserves its snapshot and fences assessment start until streaming finishes", async () => {
    const f = await fixture(),
      entered = Promise.withResolvers<void>(),
      release = Promise.withResolvers<void>();
    const chunks: string[] = [];
    const exporting = observe(
      exportAccount(db, f.id, async (chunk) => {
        chunks.push(chunk);
        if (chunks.length === 1) {
          entered.resolve();
          await release.promise;
        }
      }),
    );
    await entered.promise;
    const creating = observe(createAssessment(f, "strict_mock"));
    try {
      await db
        .update(privateNote)
        .set({ body: "Changed after export snapshot", revision: 2 })
        .where(eq(privateNote.userId, f.id));
      await until(
        async () =>
          creating.done ||
          !!(
            await db.$client.query(
              "select pid from pg_stat_activity where datname=current_database() and state='active' and wait_event_type='Lock' and query ilike '%from \"user_profile\"%for update%' ",
            )
          ).rows.length,
      );
      expect(creating.done).toBe(false);
    } finally {
      release.resolve();
    }
    expect((await exporting.result).ok).toBe(true);
    expect((await creating.result).ok).toBe(true);
    const data = JSON.parse(chunks.join(""));
    expect(data.notes[0].body).toBe("Original snapshot note");
    expect((await db.select().from(privateNote).where(eq(privateNote.userId, f.id)))[0]?.body).toBe(
      "Changed after export snapshot",
    );
  });
  test("parallel exports use one connection each and failed streams release their owner locks", async () => {
    const f = await fixture(),
      limited = createDb({ DATABASE_URL: url, DB_POOL_MAX: 2 });
    try {
      const entered = Promise.withResolvers<void>(),
        release = Promise.withResolvers<void>();
      let count = 0;
      const jobs = [0, 1].map(() =>
        observe(
          exportAccount(limited, f.id, async () => {
            if (++count <= 2) {
              if (count === 2) entered.resolve();
              await release.promise;
            }
          }),
        ),
      );
      try {
        await Promise.race([
          entered.promise,
          Bun.sleep(3000).then(() => {
            throw new Error("Parallel exports exhausted the pool");
          }),
        ]);
      } finally {
        release.resolve();
      }
      for (const job of jobs) expect((await job.result).ok).toBe(true);
      const failed = await observe(
        exportAccount(limited, f.id, async () => {
          throw new Error("Fixture stream disconnected");
        }),
      ).result;
      expect(failed.ok).toBe(false);
      expect(await createAssessment(f, "strict_mock")).toBeString();
    } finally {
      await limited.$client.end();
    }
  });
});
