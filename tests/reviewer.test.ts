import { afterAll, beforeAll, expect, test } from "bun:test";
import { createRouterClient } from "@orpc/server";
import type { Context } from "@sibol-cse/api/context";
import { appRouter } from "@sibol-cse/api/routers/index";
import { dailyStreak } from "@sibol-cse/api/services/reviewer";
import { createDb } from "@sibol-cse/db";
import { attempt, studyPreferences, user, userProfile } from "@sibol-cse/db/schema";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { seedLearning } from "./fixtures/learning";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("A dedicated TEST_DATABASE_URL is required");
const db = createDb({ DATABASE_URL: url }),
  adminId = crypto.randomUUID(),
  learnerId = crypto.randomUUID(),
  otherId = crypto.randomUUID();
function client(id: string) {
  const now = new Date();
  return createRouterClient(appRouter, {
    context: {
      db,
      sendInvitation: async () => {},
      session: {
        user: {
          id,
          name: "Fixture",
          email: `${id}@example.test`,
          emailVerified: true,
          image: null,
          createdAt: now,
          updatedAt: now,
        },
        session: {
          id: crypto.randomUUID(),
          token: "fixture",
          userId: id,
          createdAt: now,
          updatedAt: now,
          expiresAt: new Date(Date.now() + 3600000),
          ipAddress: null,
          userAgent: null,
        },
      },
    } satisfies Context,
  });
}
const learner = client(learnerId),
  other = client(otherId);
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "packages/db/src/migrations" });
  const tables = await db.$client.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname='public'",
  );
  for (const { tablename } of tables.rows)
    await db.execute(sql.raw(`TRUNCATE TABLE "${tablename.replaceAll('"', '""')}" CASCADE`));
  for (const [id, role] of [
    [adminId, "admin"],
    [learnerId, "learner"],
    [otherId, "learner"],
  ] as const) {
    await db
      .insert(user)
      .values({ id, name: role, email: `${id}@example.test`, emailVerified: true });
    await db.insert(userProfile).values({ userId: id, role, onboardedAt: new Date() });
    await db
      .insert(studyPreferences)
      .values({ userId: id, level: "professional", days: [1, 3, 5], dailyMinutes: 25 });
  }
  await seedLearning(db, adminId, 6);
}, 60000);
afterAll(async () => {
  await db.$client.end();
});
const start = (
  mode: "daily" | "quick10" | "topic" | "missed" | "bookmarks",
  requestId = crypto.randomUUID(),
) => learner.reviewer.start({ mode, requestId });
test("daily streak is based on unique actual local completion dates", () => {
  expect(dailyStreak([], "2026-11-19")).toBe(0);
  expect(dailyStreak(["2026-11-19", "2026-11-19", "2026-11-18"], "2026-11-19")).toBe(2);
  expect(dailyStreak(["2026-11-18", "2026-11-17"], "2026-11-19")).toBe(2);
  expect(dailyStreak(["2026-11-17"], "2026-11-19")).toBe(0);
  expect(dailyStreak(["2026-03-01", "2026-02-28"], "2026-03-01")).toBe(2);
});
test("daily 25 creation is concurrent-retry safe and preserves the server deadline", async () => {
  const requestId = crypto.randomUUID();
  const [a, b] = await Promise.all([start("daily", requestId), start("daily", requestId)]);
  expect(a.id).toBe(b.id);
  const detail = await learner.attempts.get({ attemptId: a.id });
  expect(detail.items).toHaveLength(25);
  expect(new Set(detail.items.map((i) => i.questionId)).size).toBe(25);
  expect((detail.expiresAt?.getTime() ?? 0) - detail.startedAt.getTime()).toBe(32 * 60000);
  expect(detail.items.every((i) => i.feedback === null)).toBe(true);
  await expect(learner.reviewer.start({ mode: "quick10", requestId })).rejects.toThrow(
    "different quiz",
  );
  await learner.attempts.submit({ attemptId: a.id });
  const repeated = await learner.attempts.submit({ attemptId: a.id });
  expect(repeated.attemptId).toBe(a.id);
  expect((await learner.reviewer.summary()).streak).toBe(1);
  const next = await start("daily");
  await learner.attempts.submit({ attemptId: next.id });
  expect((await learner.reviewer.summary()).streak).toBe(1);
});
test("topic drill stays within the category and rejects a wrong-track category", async () => {
  const created = await learner.reviewer.start({
    mode: "topic",
    area: "numerical",
    requestId: crypto.randomUUID(),
  });
  const detail = await learner.attempts.get({ attemptId: created.id });
  expect(detail.items.length).toBe(18);
  expect(detail.items.every((i) => i.area === "numerical")).toBe(true);
  await expect(
    learner.reviewer.start({ mode: "topic", area: "clerical", requestId: crypto.randomUUID() }),
  ).rejects.toThrow("track");
});
test("bookmarks select only the owner's eligible questions and never fall back", async () => {
  await expect(start("bookmarks")).rejects.toThrow("No bookmarked");
  const quiz = await start("quick10");
  const item = (await learner.attempts.get({ attemptId: quiz.id })).items[0];
  if (!item) throw new Error("Missing fixture item");
  await learner.reviewer.bookmark({ attemptId: quiz.id, itemId: item.id, saved: true });
  const saved = await start("bookmarks");
  const detail = await learner.attempts.get({ attemptId: saved.id });
  expect(detail.items).toHaveLength(1);
  expect(detail.items[0]?.questionId).toBe(item.questionId);
  await expect(
    other.reviewer.bookmark({ attemptId: quiz.id, itemId: item.id, saved: false }),
  ).rejects.toThrow();
  expect((await other.reviewer.summary()).bookmarkCount).toBe(0);
  await expect(
    other.reviewer.start({ mode: "bookmarks", requestId: crypto.randomUUID() }),
  ).rejects.toThrow("No bookmarked");
});
test("missed pool uses the latest acknowledged answer and drops corrected mistakes", async () => {
  const quiz = await start("quick10");
  const item = (await learner.attempts.get({ attemptId: quiz.id })).items[0];
  if (!item) throw new Error("Missing fixture item");
  const saved = await learner.attempts.saveAnswer({
    attemptId: quiz.id,
    itemId: item.id,
    selectedChoiceId: "a",
    expectedRevision: 0,
    mutationId: crypto.randomUUID(),
  });
  await learner.attempts.commit({ attemptId: quiz.id, itemId: item.id, revision: saved.revision });
  const before = (await learner.reviewer.summary()).missedCount ?? 0;
  const drill = await learner.reviewer.start({
    mode: "missed",
    topicId: item.topicId,
    requestId: crypto.randomUUID(),
  });
  const detail = await learner.attempts.get({ attemptId: drill.id });
  const target = detail.items.find((i) => i.questionId === item.questionId);
  if (!target) throw new Error("Missing missed-question fixture");
  expect(target).toBeDefined();
  const answer = await learner.attempts.saveAnswer({
    attemptId: drill.id,
    itemId: target.id,
    selectedChoiceId: "b",
    expectedRevision: 0,
    mutationId: crypto.randomUUID(),
  });
  expect(
    (
      await learner.attempts.commit({
        attemptId: drill.id,
        itemId: target.id,
        revision: answer.revision,
      })
    ).correct,
  ).toBe(true);
  expect((await learner.reviewer.summary()).missedCount).toBe(before - 1);
  expect((await other.reviewer.summary()).missedCount).toBe(0);
});
test("25/50/75 mock presets have exact lengths, strict feedback and original deadlines", async () => {
  for (const count of [25, 50, 75] as const) {
    const created = await learner.mocks.start({
      requestId: crypto.randomUUID(),
      kind: "short",
      mode: "strict_mock",
      count,
      multiplier: 100,
    });
    const detail = await learner.attempts.get({ attemptId: created.id });
    expect(detail.items).toHaveLength(count);
    expect(new Set(detail.items.map((i) => i.questionId)).size).toBe(count);
    expect(detail.items.every((i) => i.feedback === null)).toBe(true);
    expect((detail.expiresAt?.getTime() ?? 0) - detail.startedAt.getTime()).toBe(
      Math.ceil((190 * count) / 150) * 60000,
    );
    await expect(start("quick10")).rejects.toThrow();
    expect((await learner.reviewer.summary()).missedCount).toBeNull();
    const item = detail.items[0];
    if (!item) throw new Error("Missing fixture item");
    expect(
      await learner.reviewer.bookmark({ attemptId: created.id, itemId: item.id, saved: true }),
    ).toEqual({ saved: true });
    await expect(
      learner.attempts.commit({ attemptId: created.id, itemId: item.id, revision: 0 }),
    ).rejects.toThrow();
    await learner.attempts.submit({ attemptId: created.id });
  }
});
test("summary exposes no private questions or keys and no other user's results", async () => {
  const summary = await learner.reviewer.summary(),
    isolated = await other.reviewer.summary();
  expect(summary.examsTaken).toBeGreaterThan(0);
  expect(isolated.examsTaken).toBe(0);
  expect(isolated.averageScore).toBeNull();
  const text = JSON.stringify(summary);
  expect(text).not.toContain("answerChoiceId");
  expect(text).not.toContain("explanation");
  expect(text).not.toContain("creationKey");
  const all = await db.select().from(attempt).where(eq(attempt.userId, learnerId));
  expect(all.filter((a) => a.creationKey?.startsWith("cse:daily:")).length).toBe(2);
});
test("retake preserves the original question identities and length without leaking feedback", async () => {
  const original = await learner.reviewer.start({
    mode: "bookmarks",
    requestId: crypto.randomUUID(),
  });
  const first = await learner.attempts.get({ attemptId: original.id });
  await learner.attempts.submit({ attemptId: original.id });
  const requestId = crypto.randomUUID();
  const retake = await learner.reviewer.start({
    mode: "retake",
    attemptId: original.id,
    requestId,
  });
  expect(
    await learner.reviewer.start({ mode: "retake", attemptId: original.id, requestId }),
  ).toEqual(retake);
  const fresh = await learner.attempts.get({ attemptId: retake.id });
  expect(fresh.items.map((i) => i.questionId).sort()).toEqual(
    first.items.map((i) => i.questionId).sort(),
  );
  expect(fresh.items.every((i) => i.feedback === null && i.revision === 0)).toBe(true);
  await expect(
    other.reviewer.start({
      mode: "retake",
      attemptId: original.id,
      requestId: crypto.randomUUID(),
    }),
  ).rejects.toThrow();
});
