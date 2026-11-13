import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createRouterClient } from "@orpc/server";
import type { Context } from "@sibol-cse/api/context";
import { appRouter } from "@sibol-cse/api/routers/index";
import {
  acceptInvitation,
  createInvitation,
  savePreferences,
  tokenHash,
} from "@sibol-cse/api/services/accounts";
import { createAuth } from "@sibol-cse/auth";
import { createDb } from "@sibol-cse/db";
import {
  account,
  attempt,
  attemptAnswer,
  attemptItem,
  attemptResult,
  auditEvent,
  choice,
  contentSource,
  examProfileVersion,
  invitation,
  mockBlueprintVersion,
  question,
  questionVersion,
  rateLimit,
  studyPlan,
  studyPreferences,
  studyTask,
  topic,
  user,
} from "@sibol-cse/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

function present<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Required test fixture missing");
  return value;
}

const databaseURL = process.env.TEST_DATABASE_URL;
if (!databaseURL || !new URL(databaseURL).pathname.endsWith("_test"))
  throw new Error(
    "TEST_DATABASE_URL must name a dedicated database ending in _test. Tests clear its public tables.",
  );
const db = createDb({ DATABASE_URL: databaseURL });
const authConfig = {
  NODE_ENV: "test",
  DATABASE_URL: databaseURL,
  BETTER_AUTH_URL: "http://localhost:3001",
  CORS_ORIGIN: "http://localhost:3001",
  BETTER_AUTH_SECRET: "integration-only-secret-at-least-32-characters",
  SMTP_URL: "smtp://localhost:1025",
  EMAIL_FROM: "Sibol <test@example.test>",
};
const auth = createAuth(authConfig, db);
const password = "a-long-integration-passphrase";
let adminId = "";
let learnerId = "";
let learnerCookie = "";
let adminCookie = "";
const stamp = crypto.randomUUID().slice(0, 8);
const adminEmail = `admin-${stamp}@example.test`;
const learnerEmail = `learner-${stamp}@example.test`;
const prefs = {
  level: "professional" as const,
  days: [1, 3, 5],
  dailyMinutes: 25,
  targetDate: null,
  language: "filipino" as const,
  revision: 0,
};
const headers = (cookie = "") =>
  new Headers({ origin: authConfig.CORS_ORIGIN, cookie, "content-type": "application/json" });
async function signIn(email: string, pass = password) {
  return auth.handler(
    new Request("http://localhost:3001/api/auth/sign-in/email", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ email, password: pass }),
    }),
  );
}
async function api(cookie = "") {
  const session = await auth.api.getSession({ headers: headers(cookie) });
  const context: Context = { db, session, sendInvitation: async () => {} };
  return createRouterClient(appRouter, { context });
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "packages/db/src/migrations" });
  const tables = await db.$client.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname='public'",
  );
  for (const { tablename } of tables.rows)
    await db.execute(sql.raw(`TRUNCATE TABLE "${tablename.replaceAll('"', '""')}" CASCADE`));
  const result = Bun.spawn(
    [process.execPath, "run", "scripts/bootstrap-admin.ts", adminEmail, "Test administrator"],
    {
      env: { ...process.env, DATABASE_URL: databaseURL },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  result.stdin.write(`${password}\n`);
  result.stdin.end();
  expect(await result.exited).toBe(0);
  const [admin] = await db.select().from(user).where(eq(user.email, adminEmail));
  adminId = present(admin).id;
  const invite = await createInvitation(db, adminId, learnerEmail);
  await acceptInvitation(db, { token: invite.token, name: "Test learner", password });
  const [learner] = await db.select().from(user).where(eq(user.email, learnerEmail));
  learnerId = present(learner).id;
  const learnerSignIn = await signIn(learnerEmail);
  expect(learnerSignIn.status).toBe(200);
  learnerCookie = learnerSignIn.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const adminSignIn = await signIn(adminEmail);
  expect(adminSignIn.status).toBe(200);
  adminCookie = adminSignIn.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}, 30000);

afterAll(async () => {
  await db.$client.end();
});

describe("accounts and ownership", () => {
  test("public registration is disabled even with a requested admin role", async () => {
    const response = await auth.handler(
      new Request("http://localhost:3001/api/auth/sign-up/email", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          email: `public-${stamp}@example.test`,
          password,
          name: "Uninvited",
          role: "admin",
        }),
      }),
    );
    expect(response.ok).toBe(false);
    expect(
      await db
        .select()
        .from(user)
        .where(eq(user.email, `public-${stamp}@example.test`)),
    ).toHaveLength(0);
  });
  test("bootstrap refuses another administrator", async () => {
    const proc = Bun.spawn(
      [
        process.execPath,
        "run",
        "scripts/bootstrap-admin.ts",
        `second-${stamp}@example.test`,
        "Second",
      ],
      {
        env: { ...process.env, DATABASE_URL: databaseURL },
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    proc.stdin.write(`${password}\n`);
    proc.stdin.end();
    expect(await proc.exited).not.toBe(0);
  });
  test("anonymous and learner role management fail", async () => {
    const anonymous = await api();
    await expect(anonymous.profile.get()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const learner = await api(learnerCookie);
    await expect(learner.users.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(learner.users.setRole({ userId: learnerId, role: "admin" })).rejects.toMatchObject(
      { code: "FORBIDDEN" },
    );
  });
  test("preferences reject cross-user and client-role fields", async () => {
    const learner = await api(learnerCookie);
    await expect(
      learner.profile.update({ ...prefs, userId: adminId } as typeof prefs),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      learner.onboarding.complete({ ...prefs, role: "admin" } as typeof prefs),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(
      await db.select().from(studyPreferences).where(eq(studyPreferences.userId, adminId)),
    ).toHaveLength(0);
    const profile = await learner.profile.get();
    expect(profile.email).toBe(learnerEmail);
    expect(profile.role).toBe("learner");
    expect(Object.keys(profile)).not.toContain("password");
  });
  test("administrator profile access stays scoped to the administrator's own account", async () => {
    const admin = await api(adminCookie);
    const profile = await admin.profile.get();
    expect(profile.email).toBe(adminEmail);
    expect(profile.preferences).toBeNull();
    const accounts = await admin.users.list();
    expect(Object.keys(present(accounts.find((item) => item.id === learnerId)))).toEqual([
      "id",
      "name",
      "email",
      "role",
    ]);
  });
  test("last administrator cannot be demoted", async () => {
    const admin = await api(adminCookie);
    await expect(admin.users.setRole({ userId: adminId, role: "learner" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
  test("role changes audit and invalidate existing sessions", async () => {
    const admin = await api(adminCookie);
    await admin.users.setRole({ userId: learnerId, role: "admin" });
    expect(await auth.api.getSession({ headers: headers(learnerCookie) })).toBeNull();
    await admin.users.setRole({ userId: learnerId, role: "learner" });
    const audit = await db
      .select()
      .from(auditEvent)
      .where(and(eq(auditEvent.targetId, learnerId), eq(auditEvent.action, "user.role.admin")));
    expect(audit).toHaveLength(1);
    learnerCookie = (await signIn(learnerEmail)).headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
  });
});

describe("invitation transactions", () => {
  test("tokens are hashed, expire, and cannot be replayed", async () => {
    const invite = await createInvitation(db, adminId, `expired-${stamp}@example.test`);
    const [row] = await db.select().from(invitation).where(eq(invitation.id, invite.id));
    expect(present(row).tokenHash).toBe(tokenHash(invite.token));
    expect(present(row).tokenHash).not.toBe(invite.token);
    await db
      .update(invitation)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invitation.id, invite.id));
    await expect(
      acceptInvitation(db, { token: invite.token, name: "Expired", password }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  test("concurrent acceptance creates exactly one credential account", async () => {
    const email = `race-${stamp}@example.test`;
    const invite = await createInvitation(db, adminId, email);
    const results = await Promise.allSettled(
      [1, 2].map(() => acceptInvitation(db, { token: invite.token, name: "Race", password })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [createdUser] = await db.select().from(user).where(eq(user.email, email));
    const accounts = await db
      .select()
      .from(account)
      .where(eq(account.userId, present(createdUser).id));
    expect(accounts).toHaveLength(1);
    await expect(
      acceptInvitation(db, { token: invite.token, name: "Replay", password }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("onboarding revisions and history", () => {
  test("valid onboarding persists and stale writes fail", async () => {
    const learner = await api(learnerCookie);
    const response = await learner.onboarding.complete(prefs);
    expect(response.revision).toBe(1);
    const profile = await learner.profile.get();
    expect(profile.onboarded).toBe(true);
    expect(profile.timezone).toBe("Asia/Manila");
    expect(profile.language).toBe("filipino");
    expect(profile.preferences?.level).toBe("professional");
    await expect(learner.profile.update(prefs)).rejects.toMatchObject({ code: "CONFLICT" });
  });
  test("duplicate days, invalid dates and assumed budgets are rejected", async () => {
    const learner = await api(learnerCookie);
    await expect(
      learner.profile.update({ ...prefs, revision: 1, days: [1, 1] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      learner.profile.update({ ...prefs, revision: 1, targetDate: "2026-02-30" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      learner.profile.update({ ...prefs, revision: 1, dailyMinutes: 0 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  test("changing level supersedes the plan while retaining completed tasks and attempt profile", async () => {
    const [original] = await db
      .select()
      .from(studyPlan)
      .where(and(eq(studyPlan.userId, learnerId), eq(studyPlan.status, "active")));
    const [oldProfile] = await db
      .insert(examProfileVersion)
      .values({ level: "professional", version: 1, itemCount: 150, durationMinutes: 190 })
      .returning();
    const [oldAttempt] = await db
      .insert(attempt)
      .values({ userId: learnerId, mode: "practice", profileVersionId: present(oldProfile).id })
      .returning();
    const [task] = await db
      .insert(studyTask)
      .values({
        planId: present(original).id,
        scheduledOn: "2026-11-12",
        minutes: 10,
        completedAt: new Date(),
      })
      .returning();
    await savePreferences(db, learnerId, { ...prefs, revision: 1, level: "subprofessional" });
    const plans = await db.select().from(studyPlan).where(eq(studyPlan.userId, learnerId));
    expect(plans).toHaveLength(2);
    expect(plans.find((p) => p.id === present(original).id)?.status).toBe("superseded");
    expect(plans.find((p) => p.status === "active")?.level).toBe("subprofessional");
    expect(
      (
        await db
          .select()
          .from(studyTask)
          .where(eq(studyTask.id, present(task).id))
      )[0]?.completedAt,
    ).not.toBeNull();
    expect(
      (
        await db
          .select()
          .from(attempt)
          .where(eq(attempt.id, present(oldAttempt).id))
      )[0]?.profileVersionId,
    ).toBe(present(oldProfile).id);
  });
});

describe("foundation constraints", () => {
  let qVersionId = "";
  let itemId = "";
  let attemptId = "";
  beforeAll(async () => {
    await db.transaction(async (tx) => {
      const [t] = await tx
        .insert(topic)
        .values({ slug: `sample-${stamp}`, title: "Sample", levels: ["professional"] })
        .returning();
      const [source] = await tx
        .insert(contentSource)
        .values({ title: "Original test item", rights: "Original" })
        .returning();
      const [q] = await tx.insert(question).values({}).returning();
      const [v] = await tx
        .insert(questionVersion)
        .values({
          questionId: present(q).id,
          version: 1,
          level: "professional",
          language: "english",
          difficulty: "easy",
          prompt: "Sample",
          answerChoiceId: "a",
          explanation: "Original test explanation",
          primaryTopicId: present(t).id,
          sourceId: present(source).id,
        })
        .returning();
      qVersionId = present(v).id;
      await tx.insert(choice).values([
        { questionVersionId: qVersionId, id: "a", text: "A" },
        { questionVersionId: qVersionId, id: "b", text: "B" },
      ]);
      await tx
        .update(questionVersion)
        .set({ status: "published", reviewedBy: adminId, reviewedAt: new Date() })
        .where(eq(questionVersion.id, qVersionId));
      const [p] = await tx.select().from(examProfileVersion).limit(1);
      const [a] = await tx
        .insert(attempt)
        .values({ userId: learnerId, mode: "practice", profileVersionId: present(p).id })
        .returning();
      attemptId = present(a).id;
      const [item] = await tx
        .insert(attemptItem)
        .values({ attemptId, position: 0, questionVersionId: qVersionId, choiceOrder: ["b", "a"] })
        .returning();
      itemId = present(item).id;
    });
  });
  test("verified profiles and published blueprints stay immutable and attempts require a matching profile", async () => {
    const [profile] = await db
      .insert(examProfileVersion)
      .values({
        level: "subprofessional",
        version: 20,
        itemCount: 145,
        durationMinutes: 160,
        verifiedAt: new Date(),
        reviewerId: adminId,
      })
      .returning();
    const profileId = present(profile).id;
    const [blueprint] = await db
      .insert(mockBlueprintVersion)
      .values({
        profileVersionId: profileId,
        version: 1,
        quotas: {},
        durationMinutes: 160,
        published: true,
      })
      .returning();
    await expect(
      db
        .update(examProfileVersion)
        .set({ durationMinutes: 170 })
        .where(eq(examProfileVersion.id, profileId))
        .execute(),
    ).rejects.toThrow();
    await expect(
      db
        .update(mockBlueprintVersion)
        .set({ quotas: { changed: 1 } })
        .where(eq(mockBlueprintVersion.id, present(blueprint).id))
        .execute(),
    ).rejects.toThrow();
    const [other] = await db
      .select()
      .from(examProfileVersion)
      .where(eq(examProfileVersion.level, "professional"))
      .limit(1);
    await expect(
      db
        .insert(attempt)
        .values({
          userId: learnerId,
          mode: "practice",
          profileVersionId: present(other).id,
          blueprintVersionId: present(blueprint).id,
        })
        .execute(),
    ).rejects.toThrow();
  });
  test("published versions and their choices cannot be rewritten", async () => {
    await expect(
      db
        .update(questionVersion)
        .set({ explanation: "Changed" })
        .where(eq(questionVersion.id, qVersionId))
        .execute(),
    ).rejects.toThrow();
    await expect(
      db
        .update(choice)
        .set({ text: "Changed" })
        .where(and(eq(choice.questionVersionId, qVersionId), eq(choice.id, "a")))
        .execute(),
    ).rejects.toThrow();
    await expect(
      db.insert(choice).values({ questionVersionId: qVersionId, id: "c", text: "C" }).execute(),
    ).rejects.toThrow();
  });
  test("answer membership, checked revisions and original deadlines are enforced", async () => {
    await expect(
      db
        .insert(attemptAnswer)
        .values({
          attemptItemId: itemId,
          questionVersionId: qVersionId,
          selectedChoiceId: "foreign",
          revision: 1,
        })
        .execute(),
    ).rejects.toThrow();
    await db.insert(attemptAnswer).values({
      attemptItemId: itemId,
      questionVersionId: qVersionId,
      selectedChoiceId: "b",
      revision: 1,
    });
    const races = await Promise.allSettled(
      ["a", "b"].map((selectedChoiceId) =>
        db
          .update(attemptAnswer)
          .set({ selectedChoiceId, revision: 2 })
          .where(eq(attemptAnswer.attemptItemId, itemId)),
      ),
    );
    expect(races.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(
      db
        .update(attemptAnswer)
        .set({ revision: 2 })
        .where(eq(attemptAnswer.attemptItemId, itemId))
        .execute(),
    ).rejects.toThrow();
    await expect(
      db
        .update(attempt)
        .set({ expiresAt: new Date(Date.now() + 100000) })
        .where(eq(attempt.id, attemptId))
        .execute(),
    ).rejects.toThrow();
  });
  test("terminal attempts reject changes and retain one immutable result", async () => {
    await db.update(attempt).set({ status: "submitted" }).where(eq(attempt.id, attemptId));
    await expect(
      db
        .update(attemptAnswer)
        .set({ revision: 3 })
        .where(eq(attemptAnswer.attemptItemId, itemId))
        .execute(),
    ).rejects.toThrow();
    const result = {
      attemptId,
      correct: 1,
      incorrect: 0,
      unanswered: 0,
      elapsedSeconds: 10,
      scoringVersion: "test-v1",
    };
    const races = await Promise.allSettled(
      [1, 2].map(() => db.insert(attemptResult).values(result)),
    );
    expect(races.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(
      db
        .update(attemptResult)
        .set({ correct: 0 })
        .where(eq(attemptResult.attemptId, attemptId))
        .execute(),
    ).rejects.toThrow();
  });
});

describe("password recovery and sign-out", () => {
  beforeEach(async () => {
    await db.delete(rateLimit);
  });
  async function requestReset(email: string) {
    return auth.handler(
      new Request("http://localhost:3001/api/auth/request-password-reset", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ email, redirectTo: "http://localhost:3001/reset-password" }),
      }),
    );
  }
  async function latestResetToken() {
    const listing = (await (await fetch("http://localhost:8025/api/v1/messages")).json()) as {
      messages: { ID: string; To: { Address: string }[] }[];
    };
    const mail = listing.messages.find((message) =>
      message.To.some((to) => to.Address === learnerEmail),
    );
    if (!mail) throw new Error("Reset email did not arrive");
    const detail = (await (
      await fetch(`http://localhost:8025/api/v1/message/${mail.ID}`)
    ).json()) as { Text: string };
    const link = detail.Text.match(/https?:\/\/[^\s]+/)?.[0];
    if (!link) throw new Error("Reset email is missing its link");
    const response = await auth.handler(new Request(link));
    const location = response.headers.get("location");
    if (!location) throw new Error("Reset callback did not redirect");
    const token = new URL(location).searchParams.get("token");
    if (!token) throw new Error("Reset callback is missing its token");
    return token;
  }
  async function reset(token: string) {
    return auth.handler(
      new Request("http://localhost:3001/api/auth/reset-password", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ token, newPassword: `${password}-new` }),
      }),
    );
  }
  test("recovery responses do not disclose whether an account exists", async () => {
    const known = await requestReset(learnerEmail);
    const unknown = await requestReset(`unknown-${stamp}@example.test`);
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await known.json()).toEqual(await unknown.json());
  });
  test("invalid reset tokens fail", async () => {
    expect((await reset("invalid-token")).ok).toBe(false);
  });
  test("emailed reset works, revokes sessions and cannot be replayed", async () => {
    const token = await latestResetToken();
    expect((await reset(token)).status).toBe(200);
    expect((await reset(token)).ok).toBe(false);
    expect(await auth.api.getSession({ headers: headers(learnerCookie) })).toBeNull();
    // Reset the isolated rate-limit bucket before testing both passwords; production limits remain enabled.
    await db.delete(rateLimit);
    expect((await signIn(learnerEmail)).ok).toBe(false);
    const signedIn = await signIn(learnerEmail, `${password}-new`);
    expect(signedIn.ok).toBe(true);
    learnerCookie = signedIn.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
  });
  test("expired recovery tokens fail", async () => {
    await requestReset(learnerEmail);
    const token = await latestResetToken();
    const { verification } = await import("@sibol-cse/db/schema");
    await db
      .update(verification)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(verification.value, learnerId));
    expect((await reset(token)).ok).toBe(false);
  });
  test("sign-out invalidates the session", async () => {
    const response = await auth.handler(
      new Request("http://localhost:3001/api/auth/sign-out", {
        method: "POST",
        headers: headers(learnerCookie),
        body: "{}",
      }),
    );
    expect(response.ok).toBe(true);
    expect(await auth.api.getSession({ headers: headers(learnerCookie) })).toBeNull();
  });
});

describe("HTTP request guards", () => {
  let app: typeof import("../apps/server/src/index").app;
  let serverDatabase: ReturnType<typeof createDb>;
  beforeAll(async () => {
    Object.assign(process.env, authConfig);
    ({ app } = await import("../apps/server/src/index"));
    ({ db: serverDatabase } = await import("../apps/server/src/services"));
  });
  afterAll(async () => {
    await serverDatabase.$client.end();
  });
  test("untrusted origins and oversized bodies are rejected before account procedures", async () => {
    const request = (origin: string, body: string) =>
      app.request("/api/rpc/invitations/accept", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body,
      });
    expect((await request("https://untrusted.example", "{}")).status).toBe(403);
    expect((await request(authConfig.CORS_ORIGIN, "x".repeat(65537))).status).toBe(413);
  });
  test("different unknown URLs share a bounded rate-limit bucket", async () => {
    const { createHash } = await import("node:crypto");
    const { requestLimit } = await import("@sibol-cse/db/schema");
    const key = createHash("sha256").update("anonymous:unmatched").digest("hex");
    await db.delete(requestLimit).where(eq(requestLimit.key, key));
    for (let i = 0; i < 31; i++) {
      const response = await app.request(`/api/unknown-${stamp}-${i}`, {
        method: "POST",
        headers: { origin: authConfig.CORS_ORIGIN },
        body: "{}",
      });
      expect(response.status).toBe(i === 30 ? 429 : 404);
    }
    const buckets = await db.select().from(requestLimit);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.count).toBe(31);
  });
  test("authenticated navigation reads exceed thirty while creation keeps its cap", async () => {
    for (let i = 0; i < 31; i++) {
      const read = await app.request("/api/rpc/profile/get", {
        method: "POST",
        headers: headers(adminCookie),
        body: "{}",
      });
      expect(read.status).toBe(200);
      const create = await app.request("/api/rpc/practice/create", {
        method: "POST",
        headers: headers(adminCookie),
        body: "{}",
      });
      expect(create.status).toBe(i === 30 ? 429 : 400);
    }
  });
});
