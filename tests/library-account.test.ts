import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createRouterClient } from "@orpc/server";
import type { Context } from "@sibol-cse/api/context";
import { appRouter } from "@sibol-cse/api/routers/index";
import { exportAccount } from "@sibol-cse/api/services/account-data";
import { createDb } from "@sibol-cse/db";
import {
  account,
  attempt,
  auditEvent,
  bookmark,
  deletionReceipt,
  displayPreferences,
  invitation,
  lesson,
  lessonProgress,
  privateNote,
  reviewEvent,
  reviewState,
  session,
  studyPlan,
  studyPreferences,
  user,
  userProfile,
  verification,
} from "@sibol-cse/db/schema";
import { hashPassword } from "better-auth/crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { checklist, lessonDraft, questionDraft, seedLearning } from "./fixtures/learning";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("Dedicated *_test database required.");
const db = createDb({ DATABASE_URL: url });
const password = "private-library-passphrase";
const config = {
  NODE_ENV: "test",
  DATABASE_URL: url,
  BETTER_AUTH_URL: "http://localhost:3001",
  CORS_ORIGIN: "http://localhost:3001",
  BETTER_AUTH_SECRET: "library-test-secret-at-least-32-characters",
  SMTP_URL: "smtp://localhost:1025",
  EMAIL_FROM: "Sibol <test@example.test>",
};
const adminId = crypto.randomUUID(),
  learnerId = crypto.randomUUID(),
  otherId = crypto.randomUUID();
const sessions = new Map<string, string>();
let hashed = "",
  lessonId = "",
  versionId = "",
  questionId = "",
  oldVersionId = "";
let app: typeof import("../apps/server/src/index").app,
  serverDb: ReturnType<typeof createDb>,
  auth: typeof import("../apps/server/src/services").auth;
function client(id: string) {
  const now = new Date();
  const context: Context = {
    db,
    sendInvitation: async () => {},
    session: {
      user: {
        id,
        email: `${id}@example.test`,
        name: "Library learner",
        emailVerified: true,
        image: null,
        createdAt: now,
        updatedAt: now,
      },
      session: {
        id: sessions.get(id) ?? "missing",
        token: "fixture",
        userId: id,
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(Date.now() + 3600000),
        ipAddress: null,
        userAgent: null,
      },
    },
  };
  return createRouterClient(appRouter, { context });
}
async function makeUser(id: string, role: "learner" | "admin" = "learner") {
  await db
    .insert(user)
    .values({ id, name: "Library learner", email: `${id}@example.test`, emailVerified: true });
  await db.insert(userProfile).values({ userId: id, role, onboardedAt: new Date() });
  await db
    .insert(studyPreferences)
    .values({ userId: id, level: "professional", days: [0, 1, 2, 3, 4, 5, 6], dailyMinutes: 25 });
  await db
    .insert(studyPlan)
    .values({ userId: id, level: "professional", preferencesRevision: 1, reason: "Fixture" });
  await db.insert(account).values({
    id: crypto.randomUUID(),
    userId: id,
    accountId: id,
    providerId: "credential",
    password: hashed,
  });
  const sid = crypto.randomUUID();
  sessions.set(id, sid);
  await db.insert(session).values({
    id: sid,
    userId: id,
    token: crypto.randomUUID(),
    expiresAt: new Date(Date.now() + 3600000),
    updatedAt: new Date(),
  });
}
const learner = () => client(learnerId),
  other = () => client(otherId),
  admin = () => client(adminId);
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "packages/db/src/migrations" });
  const tables = await db.$client.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname='public'",
  );
  for (const { tablename } of tables.rows)
    await db.execute(sql.raw(`TRUNCATE TABLE "${tablename.replaceAll('"', '""')}" CASCADE`));
  hashed = await hashPassword(password);
  for (const [id, role] of [
    [adminId, "admin"],
    [learnerId, "learner"],
    [otherId, "learner"],
  ] as const)
    await makeUser(id, role);
  await seedLearning(db, adminId);
  const published = await learner().lessons.get({ slug: "fixture-numerical-arithmetic" });
  lessonId = published.id;
  Object.assign(process.env, config);
  ({ app } = await import("../apps/server/src/index"));
  ({ db: serverDb, auth } = await import("../apps/server/src/services"));
}, 60000);
afterAll(async () => {
  await db.$client.end();
  await serverDb.$client.end();
});
async function cookie(id: string) {
  const result = await auth.handler(
    new Request(`${config.CORS_ORIGIN}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { origin: config.CORS_ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ email: `${id}@example.test`, password }),
    }),
  );
  if (!result.ok) throw new Error("Fixture sign-in failed");
  return result.headers.get("set-cookie")?.split(";")[0] ?? "";
}

describe("private library and search", () => {
  test("search contains published lessons and no uncommitted or other-owner question solutions", async () => {
    const p = await learner().practice.create({
      topicId: "numerical-arithmetic",
      difficulty: "any",
      count: 5,
      unseenFirst: true,
      requestId: crypto.randomUUID(),
    });
    const d = await learner().attempts.get({ attemptId: p.id });
    const item = d.items[0];
    if (!item) throw new Error("Missing question");
    questionId = item.questionId;
    oldVersionId = item.versionId;
    expect(
      (await learner().search.query({ query: "fixture", kind: "question" })).questions,
    ).toHaveLength(0);
    await learner().attempts.saveAnswer({
      attemptId: p.id,
      itemId: item.id,
      selectedChoiceId: "b",
      expectedRevision: 0,
      mutationId: crypto.randomUUID(),
    });
    expect(
      (await learner().search.query({ query: "fixture", kind: "question" })).questions,
    ).toHaveLength(0);
    await learner().attempts.commit({ attemptId: p.id, itemId: item.id, revision: 1 });
    const rows = await learner().search.query({ kind: "all", query: "Arithmetic" });
    expect(rows.lessons.length).toBeGreaterThan(0);
    expect(rows.questions).toHaveLength(1);
    expect((await other().search.query({ kind: "question" })).questions).toHaveLength(0);
    await expect(other().search.question({ versionId: item.versionId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(admin().search.question({ versionId: item.versionId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const draft = await admin().content.createLesson({
      ...lessonDraft("secret-unpublished"),
      title: "Unpublished needle secret",
    });
    expect((await learner().search.query({ query: "Unpublished needle" })).lessons).toHaveLength(0);
    await expect(
      learner().bookmarks.set({ target: { kind: "lesson", id: draft.id }, saved: true }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(learner().search.query({ query: "x".repeat(121) })).rejects.toThrow();
    expect((await learner().search.query({ query: "%" })).lessons).toHaveLength(0);
    await learner().attempts.submit({ attemptId: p.id });
  });
  test("corrections expose only the original permitted version, with historical errata", async () => {
    const old = await admin().content.question({ id: oldVersionId });
    const draft = await admin().content.createQuestion({
      question: {
        ...questionDraft(old.externalId ?? "missing"),
        answerChoiceId: "a",
        explanation: "A deliberately different new key for verification.",
      },
      correctionId: questionId,
    });
    versionId = draft.id;
    await admin().content.review({ kind: "question", versionId, checklist });
    await admin().content.publish({
      kind: "question",
      versionId,
      erratum: "Corrected after publication; original scoring retained.",
    });
    const review = await learner().search.question({ versionId: oldVersionId });
    expect(review.answerChoiceId).toBe("b");
    expect(review.erratum).toContain("Corrected");
    await expect(learner().search.question({ versionId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const rows = await learner().search.query({ kind: "question" });
    expect(rows.questions.some((r) => r.versionId === oldVersionId)).toBe(true);
    expect(rows.questions.some((r) => r.versionId === versionId)).toBe(false);
  });
  test("lesson and question bookmarks are owner-scoped and set retries do not toggle them off", async () => {
    const target = { kind: "lesson" as const, id: lessonId };
    await Promise.all([
      learner().bookmarks.set({ target, saved: true }),
      learner().bookmarks.set({ target, saved: true }),
    ]);
    await learner().bookmarks.set({ target: { kind: "question", id: questionId }, saved: true });
    expect((await learner().bookmarks.list()).items).toHaveLength(2);
    expect((await other().bookmarks.list()).items).toHaveLength(0);
    await other().bookmarks.set({ target, saved: false });
    expect((await learner().bookmarks.list()).items).toHaveLength(2);
    expect((await learner().search.query({ savedOnly: true })).lessons).toHaveLength(1);
  });
  test("notes reject stale races, replay one action and prevent deleted-note ABA overwrites", async () => {
    const target = { kind: "lesson" as const, id: lessonId };
    const action = {
      target,
      body: "My private learning note.",
      revision: 0,
      mutationId: crypto.randomUUID(),
    };
    const first = await learner().notes.save(action);
    expect(first.revision).toBe(1);
    expect((await learner().notes.save(action)).revision).toBe(1);
    const writes = await Promise.allSettled(
      ["Revision A", "Revision B"].map((body) =>
        learner().notes.save({ target, body, revision: 1, mutationId: crypto.randomUUID() }),
      ),
    );
    expect(writes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const saved = await learner().notes.get({ target });
    expect(saved.revision).toBe(2);
    expect((await other().notes.get({ target })).body).toBe("");
    await other().notes.delete({ target, revision: 2, mutationId: crypto.randomUUID() });
    expect((await learner().notes.get({ target })).body).toBe(saved.body);
    await learner().notes.delete({ target, revision: 2, mutationId: crypto.randomUUID() });
    expect((await learner().notes.get({ target })).body).toBe("");
    await learner().notes.save({
      target,
      body: "Restored with a fresh revision.",
      revision: 3,
      mutationId: crypto.randomUUID(),
    });
    await expect(
      learner().notes.save({
        target,
        body: "Stale resurrection",
        revision: 1,
        mutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      learner().notes.save({
        target,
        body: "<script>bad</script>",
        revision: 4,
        mutationId: crypto.randomUUID(),
      }),
    ).rejects.toThrow();
    expect((await learner().notes.list({ query: "fresh revision" })).items).toHaveLength(1);
    expect((await other().notes.list()).items).toHaveLength(0);
  });
  test("collection caps preserve existing edits and removal, with bounded disjoint pages", async () => {
    const ids = Array.from({ length: 1000 }, () => crypto.randomUUID());
    await db.insert(lesson).values(ids.map((id) => ({ id, slug: `bounds-${id}` })));
    await db.insert(bookmark).values(ids.map((id) => ({ userId: otherId, lessonId: id })));
    await db
      .insert(privateNote)
      .values(ids.map((id) => ({ userId: otherId, lessonId: id, body: "Bounds fixture" })));
    const target = { kind: "lesson" as const, id: lessonId };
    await expect(other().bookmarks.set({ target, saved: true })).rejects.toThrow("1,000");
    await expect(
      other().notes.save({
        target,
        body: "Overflow",
        revision: 0,
        mutationId: crypto.randomUUID(),
      }),
    ).rejects.toThrow("1,000");
    const first = await other().notes.list({ page: 0 }),
      second = await other().notes.list({ page: 1 });
    expect(first.items).toHaveLength(20);
    expect(first.hasMore).toBe(true);
    expect(second.items).toHaveLength(20);
    expect(second.items.some((row) => first.items.some((a) => a.id === row.id))).toBe(false);
    expect((await learner().notes.list()).items).toHaveLength(1);
    await other().notes.save({
      target: { kind: "lesson", id: ids[0] ?? "" },
      body: "Existing edits still work",
      revision: 1,
      mutationId: crypto.randomUUID(),
    });
    await other().bookmarks.set({ target: { kind: "lesson", id: ids[0] ?? "" }, saved: false });
    await other().bookmarks.set({ target, saved: true });
    await db.delete(bookmark).where(eq(bookmark.userId, otherId));
    await db.delete(privateNote).where(eq(privateNote.userId, otherId));
    await db.delete(lesson).where(inArray(lesson.id, ids));
  });
  test("active strict assessment blocks library snippets, private notes and both export entry points", async () => {
    const a = await learner().mocks.start({
      kind: "short",
      mode: "strict_mock",
      count: 10,
      multiplier: 100,
      requestId: crypto.randomUUID(),
    });
    await expect(learner().search.query({ query: "Arithmetic" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      learner().notes.get({ target: { kind: "lesson", id: lessonId } }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(learner().bookmarks.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(learner().account.export()).rejects.toMatchObject({ code: "FORBIDDEN" });
    const response = await app.request("/api/account/export", {
      method: "POST",
      headers: {
        origin: config.CORS_ORIGIN,
        "content-type": "application/json",
        cookie: await cookie(learnerId),
      },
      body: "{}",
    });
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("Restored with a fresh revision");
    await learner().attempts.submit({ attemptId: a.id });
  });
  test("library authorization waits for a concurrently starting strict assessment", async () => {
    const [prior] = await db.select().from(attempt).where(eq(attempt.userId, learnerId)).limit(1);
    if (!prior) throw new Error("Missing prior profile");
    const held = Promise.withResolvers<void>(),
      release = Promise.withResolvers<void>();
    const id = crypto.randomUUID();
    const starting = db.transaction(async (tx) => {
      await tx.select().from(userProfile).where(eq(userProfile.userId, learnerId)).for("update");
      await tx.insert(attempt).values({
        id,
        userId: learnerId,
        mode: "strict_mock",
        profileVersionId: prior.profileVersionId,
        creationKey: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 60000),
      });
      held.resolve();
      await release.promise;
    });
    await held.promise;
    let completed = false;
    const reading = learner()
      .search.query({ query: "worked example" })
      .then(
        (result) => {
          completed = true;
          return result;
        },
        (error) => {
          completed = true;
          return error;
        },
      );
    try {
      await Bun.sleep(50);
      expect(completed).toBe(false);
    } finally {
      release.resolve();
    }
    await starting;
    expect(await reading).toMatchObject({ code: "FORBIDDEN" });
    await db.delete(attempt).where(eq(attempt.id, id));
  });
});
describe("settings and complete private export", () => {
  test("checked settings change reminders without changing historical attempts", async () => {
    const before = await learner().attempts.list();
    const settings = await learner().account.settings();
    expect(settings.theme).toBe("light");
    await learner().account.updateSettings({
      theme: "dark",
      motion: "reduce",
      inAppReminders: false,
      futureEmailOptIn: true,
      revision: 0,
    });
    expect((await learner().account.settings()).motion).toBe("reduce");
    expect((await other().account.settings()).theme).toBe("light");
    await expect(
      learner().account.updateSettings({
        theme: "light",
        motion: "system",
        inAppReminders: true,
        futureEmailOptIn: false,
        revision: 0,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await learner().dashboard.get()).inAppReminders).toBe(false);
    expect((await learner().attempts.list()).map((a) => a.id)).toEqual(before.map((a) => a.id));
  });
  test("streamed export includes every page of owned records without bank text, keys, tokens or other users", async () => {
    await other().notes.save({
      target: { kind: "lesson", id: lessonId },
      body: "Other owner's secret text.",
      revision: 0,
      mutationId: crypto.randomUUID(),
    });
    const ids = Array.from({ length: 510 }, () => crypto.randomUUID());
    await db.insert(lesson).values(ids.map((id, i) => ({ id, slug: `export-only-${i}` })));
    await db.insert(bookmark).values(ids.map((lessonId) => ({ userId: learnerId, lessonId })));
    const chunks: string[] = [];
    await exportAccount(db, learnerId, async (chunk) => {
      chunks.push(chunk);
    });
    const raw = chunks.join(""),
      data = JSON.parse(raw);
    expect(data.bookmarks.length).toBe(512);
    expect(data.notes[0]?.body).toBe("Restored with a fresh revision.");
    expect(data.displayPreferences[0]?.theme).toBe("dark");
    for (const forbidden of [
      "Other owner's secret text.",
      '"answerChoiceId":',
      '"explanation":',
      '"password":',
      '"token":',
      "What is 2 + 2?",
    ])
      expect(raw).not.toContain(forbidden);
    expect(
      (
        await app.request("/api/account/export", {
          method: "POST",
          headers: { origin: config.CORS_ORIGIN, "content-type": "application/json" },
          body: "{}",
        })
      ).status,
    ).toBe(401);
    const headers = {
      origin: config.CORS_ORIGIN,
      "content-type": "application/json",
      cookie: await cookie(learnerId),
    };
    expect(
      (
        await app.request("/api/account/export", {
          method: "POST",
          headers,
          body: JSON.stringify({ userId: otherId }),
        })
      ).status,
    ).toBe(400);
    const response = await app.request("/api/account/export", {
      method: "POST",
      headers,
      body: "{}",
    });
    expect(response.status).toBe(200);
    expect((await response.json()).bookmarks).toHaveLength(512);
    await db
      .delete(bookmark)
      .where(and(eq(bookmark.userId, learnerId), inArray(bookmark.lessonId, ids)));
    await db.delete(lesson).where(inArray(lesson.id, ids));
  });
});
describe("confirmed account deletion", () => {
  test("bad confirmation/password and the last administrator cannot delete live records", async () => {
    await expect(
      learner().account.requestDeletion({ password, confirmation: "wrong" as "DELETE" }),
    ).rejects.toThrow();
    await expect(
      learner().account.requestDeletion({ password: "incorrect", confirmation: "DELETE" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      admin().account.requestDeletion({ password, confirmation: "DELETE" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await learner().notes.list()).items.length).toBeGreaterThan(0);
  });
  test("deletion clears related learning data, reset tokens and sessions, and prevents credential resurrection", async () => {
    const signedCookie = await cookie(learnerId);
    await db.insert(verification).values({
      id: crypto.randomUUID(),
      identifier: "reset-password:pending-delete",
      value: learnerId,
      expiresAt: new Date(Date.now() + 100000),
    });
    await db.insert(invitation).values({
      email: `${learnerId}@example.test`,
      tokenHash: "a".repeat(64),
      invitedBy: adminId,
      expiresAt: new Date(Date.now() + 100000),
    });
    const result = await learner().account.requestDeletion({ password, confirmation: "DELETE" });
    expect(result.deleted).toBe(true);
    for (const table of [
      account,
      session,
      userProfile,
      studyPreferences,
      displayPreferences,
      privateNote,
      bookmark,
      lessonProgress,
      studyPlan,
      reviewState,
      reviewEvent,
      attempt,
    ])
      expect(await db.select().from(table).where(eq(table.userId, learnerId))).toHaveLength(0);
    expect(
      await db.select().from(verification).where(eq(verification.value, learnerId)),
    ).toHaveLength(0);
    expect(
      await auth.api.getSession({ headers: new Headers({ cookie: signedCookie }) }),
    ).toBeNull();
    const [deleted] = await db.select().from(user).where(eq(user.id, learnerId));
    expect(deleted?.email).not.toBe(`${learnerId}@example.test`);
    expect(deleted?.name).toBe("Deleted account");
    expect(
      await db.select().from(deletionReceipt).where(eq(deletionReceipt.userId, learnerId)),
    ).toHaveLength(1);
    await expect(
      db
        .insert(session)
        .values({
          id: crypto.randomUUID(),
          userId: learnerId,
          token: crypto.randomUUID(),
          expiresAt: new Date(Date.now() + 1000),
          updatedAt: new Date(),
        })
        .execute(),
    ).rejects.toThrow();
    await expect(
      db
        .insert(account)
        .values({
          id: crypto.randomUUID(),
          userId: learnerId,
          accountId: learnerId,
          providerId: "credential",
          password: hashed,
        })
        .execute(),
    ).rejects.toThrow();
    expect((await other().notes.list()).items).toHaveLength(1);
    expect(
      await db.select().from(auditEvent).where(eq(auditEvent.action, "account.deleted")),
    ).toHaveLength(1);
  });
  test("deletion and diagnostic finalization serialize without leaving personal records", async () => {
    const id = crypto.randomUUID();
    await makeUser(id);
    const c = client(id);
    const a = await c.diagnostic.create({ requestId: crypto.randomUUID() });
    const outcomes = await Promise.allSettled([
      c.attempts.submit({ attemptId: a.id }),
      c.account.requestDeletion({ password, confirmation: "DELETE" }),
    ]);
    expect(outcomes[1]?.status).toBe("fulfilled");
    expect(await db.select().from(attempt).where(eq(attempt.userId, id))).toHaveLength(0);
  });
  test("a departing administrator retains immutable content with pseudonymized references", async () => {
    await admin().users.setRole({ userId: otherId, role: "admin" });
    const result = await admin().account.requestDeletion({ password, confirmation: "DELETE" });
    expect(result.deleted).toBe(true);
    expect(await db.select().from(userProfile).where(eq(userProfile.role, "admin"))).toHaveLength(
      1,
    );
    expect((await other().search.query({ kind: "lesson" })).lessons.length).toBeGreaterThan(0);
  });
});
