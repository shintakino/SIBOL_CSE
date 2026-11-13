import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createRouterClient } from "@orpc/server";
import type { Context } from "@sibol-cse/api/context";
import { appRouter } from "@sibol-cse/api/routers/index";
import { createDb } from "@sibol-cse/db";
import {
  attempt,
  attemptItem,
  attemptResult,
  question,
  questionVersion,
  reviewEvent,
  reviewState,
  studyPlan,
  studyPreferences,
  studyTask,
  user,
  userProfile,
} from "@sibol-cse/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { checklist, questionDraft, seedLearning } from "./fixtures/learning";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("A dedicated *_test database is required.");
const db = createDb({ DATABASE_URL: url });
const adminId = crypto.randomUUID(),
  learnerId = crypto.randomUUID(),
  otherId = crypto.randomUUID();
function client(id: string) {
  const now = new Date();
  const context: Context = {
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
        expiresAt: new Date(Date.now() + 3600000),
        createdAt: now,
        updatedAt: now,
        ipAddress: null,
        userAgent: null,
      },
    },
  };
  return createRouterClient(appRouter, { context });
}
const admin = client(adminId),
  learner = client(learnerId),
  other = client(otherId);
let fixture: Awaited<ReturnType<typeof seedLearning>>;
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "packages/db/src/migrations" });
  const tables = await db.$client.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname='public'",
  );
  for (const { tablename } of tables.rows)
    await db.execute(sql.raw(`TRUNCATE TABLE "${tablename.replaceAll('"', '""')}" CASCADE`));
  for (const id of [adminId, learnerId, otherId]) {
    await db
      .insert(user)
      .values({ id, name: "Fixture", email: `${id}@example.test`, emailVerified: true });
    await db
      .insert(userProfile)
      .values({ userId: id, role: id === adminId ? "admin" : "learner", onboardedAt: new Date() });
    await db
      .insert(studyPreferences)
      .values({ userId: id, level: "professional", days: [0, 1, 2, 3, 4, 5, 6], dailyMinutes: 25 });
    await db.insert(studyPlan).values({
      userId: id,
      level: "professional",
      preferencesRevision: 1,
      reason: "Test starter",
    });
  }
  fixture = await seedLearning(db, adminId);
}, 60000);
afterAll(async () => {
  await db.$client.end();
});
const practice = () =>
  learner.practice.create({
    topicId: "numerical-arithmetic",
    difficulty: "any",
    count: 5,
    unseenFirst: true,
    requestId: crypto.randomUUID(),
  });
const timed = (overrides: Partial<Parameters<typeof learner.mocks.start>[0]> = {}) =>
  learner.mocks.start({
    kind: "short",
    mode: "strict_mock",
    count: 10,
    multiplier: 100,
    requestId: crypto.randomUUID(),
    ...overrides,
  });
async function answer(owner: typeof learner, id: string, index: number, choice = "b") {
  const d = await owner.attempts.get({ attemptId: id }),
    item = d.items[index];
  if (!item) throw new Error("Missing item");
  await owner.attempts.saveAnswer({
    attemptId: id,
    itemId: item.id,
    selectedChoiceId: choice,
    expectedRevision: item.revision,
    mutationId: crypto.randomUUID(),
  });
  return item;
}
describe("spaced review", () => {
  test("mistakes queue tomorrow; scheduled success advances once across concurrent sessions and retries", async () => {
    const p = await practice();
    const d = await learner.attempts.get({ attemptId: p.id }),
      item = d.items[0];
    if (!item) throw new Error("Missing item");
    await learner.attempts.commit({ attemptId: p.id, itemId: item.id, revision: 0 });
    let [state] = await db
      .select()
      .from(reviewState)
      .where(and(eq(reviewState.userId, learnerId), eq(reviewState.questionId, item.questionId)));
    expect(state?.intervalStep).toBe(0);
    expect(state?.dueAt.getTime()).toBeGreaterThan(Date.now());
    await db
      .update(reviewState)
      .set({ dueAt: sql`now()-interval '1 day'`, lastReviewedOn: null })
      .where(eq(reviewState.id, state?.id ?? ""));
    const [r1, r2] = await Promise.all([
      learner.review.start({ requestId: crypto.randomUUID(), count: 1 }),
      learner.review.start({ requestId: crypto.randomUUID(), count: 1 }),
    ]);
    const one = await answer(learner, r1.id, 0),
      two = await answer(learner, r2.id, 0);
    await Promise.all([
      learner.attempts.commit({ attemptId: r1.id, itemId: one.id, revision: 1 }),
      learner.attempts.commit({ attemptId: r2.id, itemId: two.id, revision: 1 }),
    ]);
    await learner.attempts.commit({ attemptId: r1.id, itemId: one.id, revision: 1 });
    [state] = await db
      .select()
      .from(reviewState)
      .where(eq(reviewState.id, state?.id ?? ""));
    expect(state?.intervalStep).toBe(1);
    expect(state?.lastReviewedOn).not.toBeNull();
    expect(
      await db
        .select()
        .from(reviewEvent)
        .where(eq(reviewEvent.eventKey, `review:${one.id}`)),
    ).toHaveLength(1);
    const notebook = await learner.review.listDue();
    expect(
      notebook.history.some((e) => e.questionId === item.questionId && e.outcome === "skipped"),
    ).toBe(true);
    expect((await other.review.listDue()).history).toHaveLength(0);
    await learner.attempts.submit({ attemptId: r1.id });
    await learner.attempts.submit({ attemptId: r2.id });
    await learner.attempts.submit({ attemptId: p.id });
    await learner.attempts.delete({ attemptId: p.id });
    expect(
      (await learner.review.listDue()).history.some(
        (e) => e.questionId === item.questionId && e.outcome === "skipped",
      ),
    ).toBe(true);
  });
  test("manual tomorrow is idempotent and later mistakes reset the interval", async () => {
    const [state] = await db.select().from(reviewState).where(eq(reviewState.userId, learnerId));
    if (!state) throw new Error("Missing state");
    const requestId = crypto.randomUUID();
    await Promise.all([
      learner.review.tomorrow({ questionId: state.questionId, requestId }),
      learner.review.tomorrow({ questionId: state.questionId, requestId }),
    ]);
    expect(
      await db
        .select()
        .from(reviewEvent)
        .where(eq(reviewEvent.eventKey, `tomorrow:${learnerId}:${requestId}`)),
    ).toHaveLength(1);
    const [updated] = await db.select().from(reviewState).where(eq(reviewState.id, state.id));
    expect(updated?.intervalStep).toBe(0);
    await expect(
      other.review.tomorrow({ questionId: state.questionId, requestId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await db
      .update(reviewState)
      .set({ dueAt: sql`now()-interval '1 day'`, intervalStep: 3, lastReviewedOn: null })
      .where(eq(reviewState.id, state.id));
    const r = await learner.review.start({ requestId: crypto.randomUUID(), count: 1 });
    const i = await answer(learner, r.id, 0, "a");
    await learner.attempts.commit({ attemptId: r.id, itemId: i.id, revision: 1 });
    const [reset] = await db.select().from(reviewState).where(eq(reviewState.id, state.id));
    expect(reset?.intervalStep).toBe(0);
    expect(reset?.dueAt.getTime()).toBeGreaterThan(Date.now());
    await learner.attempts.submit({ attemptId: r.id });
  });
});
test("review commits and content corrections share a deadlock-free lock order", async () => {
  const [state] = await db
    .select()
    .from(reviewState)
    .where(eq(reviewState.userId, learnerId))
    .limit(1);
  if (!state?.lastVersionId) throw new Error("Missing queue fixture");
  await db
    .update(reviewState)
    .set({ dueAt: sql`now()-interval '1 day'`, lastReviewedOn: null })
    .where(eq(reviewState.id, state.id));
  const old = await admin.content.question({ id: state.lastVersionId });
  const draft = await admin.content.createQuestion({
    question: questionDraft(old.externalId ?? "missing", old.primaryTopicId),
    correctionId: old.questionId,
  });
  await admin.content.review({ kind: "question", versionId: draft.id, checklist });
  const session = await learner.review.start({ requestId: crypto.randomUUID(), count: 1 });
  const item = await answer(learner, session.id, 0);
  await Promise.all([
    learner.attempts.commit({ attemptId: session.id, itemId: item.id, revision: 1 }),
    admin.content.publish({
      kind: "question",
      versionId: draft.id,
      erratum: "Clarified after editorial review.",
    }),
  ]);
  const [next] = await db.select().from(reviewState).where(eq(reviewState.id, state.id));
  expect(next?.lastVersionId).toBe(draft.id);
  await learner.attempts.submit({ attemptId: session.id });
});
describe("weekly planning and dashboard", () => {
  test("generation fits budgets, retries preserve IDs and completed tasks survive rebuilds", async () => {
    const requestId = crypto.randomUUID();
    const plan = await learner.plan.generate({
      requestId,
      allocation: { review: 0, priority: 80, mixed: 20 },
    });
    expect(plan.tasks.length).toBeGreaterThan(0);
    for (const day of new Set(plan.tasks.map((t) => t.scheduledOn)))
      expect(
        plan.tasks.filter((t) => t.scheduledOn === day).reduce((n, t) => n + t.minutes, 0),
      ).toBeLessThanOrEqual(25);
    const retried = await learner.plan.generate({ requestId });
    expect(retried.tasks.map((t) => t.id)).toEqual(plan.tasks.map((t) => t.id));
    const today = plan.tasks.find((t) => t.scheduledOn === plan.today);
    if (!today) throw new Error("Missing today task");
    await learner.plan.completeTask({ id: today.id });
    await expect(other.plan.completeTask({ id: today.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const rebuilt = await learner.plan.generate({ requestId: crypto.randomUUID() });
    expect(rebuilt.tasks.find((t) => t.id === today.id)?.completedAt).not.toBeNull();
    expect(
      rebuilt.tasks.filter((t) => t.scheduledOn === plan.today).reduce((n, t) => n + t.minutes, 0),
    ).toBeLessThanOrEqual(25);
    expect(rebuilt.plan?.reason).toContain("evidence");
  });
  test("missed work carries at most two tasks within 20 percent without multiplying", async () => {
    const plan = await learner.plan.get();
    if (!plan.plan) throw new Error("Missing plan");
    const pending = plan.tasks.filter((t) => !t.completedAt).slice(0, 8);
    for (const t of pending)
      await db
        .update(studyTask)
        .set({ scheduledOn: sql`current_date - 1` })
        .where(eq(studyTask.id, t.id));
    const next = await learner.plan.generate({ requestId: crypto.randomUUID() });
    const carried = next.tasks.filter((t) => t.carriedFromOn);
    expect(carried.length).toBeLessThanOrEqual(2);
    expect(carried.every((t) => pending.some((p) => p.id === t.id))).toBe(true);
    const again = await learner.plan.generate({ requestId: crypto.randomUUID() });
    expect(again.tasks.filter((t) => t.carriedFromOn).length).toBeLessThanOrEqual(2);
  });
  test("target dates and preference changes preserve history and dashboard is private", async () => {
    const before = await learner.plan.get();
    const completed = before.tasks.find((t) => t.completedAt);
    await learner.profile.update({
      level: "professional",
      days: [0, 1, 2, 3, 4, 5, 6],
      dailyMinutes: 10,
      targetDate: before.today,
      language: "english",
      revision: 1,
    });
    const next = await learner.plan.generate({ requestId: crypto.randomUUID() });
    expect(next.tasks.every((t) => t.scheduledOn <= before.today)).toBe(true);
    expect(next.plan?.allocation).toEqual(before.plan?.allocation);
    const replaced = before.tasks.find((t) => !t.completedAt);
    if (replaced)
      await expect(learner.plan.completeTask({ id: replaced.id })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    if (completed)
      expect(next.tasks.some((t) => t.id === completed.id && !!t.completedAt)).toBe(true);
    await learner.dashboard.setDedication({ dedication: "For my future self." });
    expect((await learner.dashboard.get()).dedication).toBe("For my future self.");
    expect((await other.dashboard.get()).dedication).toBeNull();
    await expect(
      learner.dashboard.setDedication({ dedication: "<script>bad</script>" }),
    ).rejects.toThrow();
    expect((await learner.dashboard.get()).daysRemaining).toBe(0);
  });
});
describe("server-owned timed sets", () => {
  test("start retries pin one deadline, choices and safe editable strict payloads", async () => {
    const requestId = crypto.randomUUID();
    const [a, b] = await Promise.all([timed({ requestId }), timed({ requestId })]);
    expect(a.id).toBe(b.id);
    const d = await learner.attempts.get({ attemptId: a.id });
    expect(d.items).toHaveLength(10);
    expect(d.expiresAt).toBeInstanceOf(Date);
    expect(d.items.every((i) => i.feedback === null)).toBe(true);
    const first = await answer(learner, a.id, 0, "a");
    await learner.attempts.saveAnswer({
      attemptId: a.id,
      itemId: first.id,
      selectedChoiceId: "b",
      expectedRevision: 1,
      mutationId: crypto.randomUUID(),
    });
    const restored = await learner.attempts.get({ attemptId: a.id });
    expect(restored.expiresAt).toEqual(d.expiresAt);
    expect(restored.items[0]?.selectedChoiceId).toBe("b");
    await expect(learner.progress.summary()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(learner.plan.generate({ requestId: crypto.randomUUID() })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect((await learner.dashboard.get()).recentPracticeAccuracy).toBeNull();
    await expect(other.attempts.clock({ attemptId: a.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(admin.attempts.results({ attemptId: a.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await learner.attempts.setFlag({ attemptId: a.id, itemId: first.id, flagged: true });
    const results = await Promise.all([
      learner.attempts.submit({ attemptId: a.id }),
      learner.attempts.submit({ attemptId: a.id }),
    ]);
    expect(results[0]).toEqual(results[1]);
    const r = await learner.attempts.results({ attemptId: a.id });
    expect(r.correct).toBe(1);
    expect(r.unanswered).toBe(9);
    expect(r.accuracy).toBe(0.1);
  });
  test("full mocks enforce the content gate and immutable profile quotas; extended time is distinct", async () => {
    await expect(timed({ kind: "full" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const quotas = Object.fromEntries(
      fixture.topics.map((t, i) => [t.id, Math.floor(150 / 16) + (i < 150 % 16 ? 1 : 0)]),
    );
    const blueprint = await admin.blueprints.create({ profileId: fixture.profileId, quotas });
    await admin.blueprints.buildForms({ id: blueprint.id });
    const alternative = { ...quotas };
    const firstTopic = fixture.topics[0]?.id,
      lastTopic = fixture.topics.at(-1)?.id;
    if (!firstTopic || !lastTopic) throw new Error("Missing quota topics");
    alternative[firstTopic] = (alternative[firstTopic] ?? 0) + 1;
    alternative[lastTopic] = (alternative[lastTopic] ?? 0) - 1;
    await admin.blueprints.create({ profileId: fixture.profileId, quotas: alternative });
    const a = await timed({ kind: "full" });
    const d = await learner.attempts.get({ attemptId: a.id });
    expect(d.items).toHaveLength(150);
    expect(new Set(d.items.map((i) => i.questionId)).size).toBe(150);
    expect(d.blueprintVersionId).toBe(blueprint.id);
    expect((d.expiresAt?.getTime() ?? 0) - d.startedAt.getTime()).toBe(190 * 60 * 1000);
    for (const [id, count] of Object.entries(quotas))
      expect(d.items.filter((i) => i.topicId === id)).toHaveLength(count);
    await learner.attempts.submit({ attemptId: a.id });
    const extended = await timed({ mode: "timed_practice", multiplier: 150 });
    const e = await learner.attempts.get({ attemptId: extended.id });
    expect(e.mode).toBe("timed_practice");
    expect(e.timeMultiplier).toBe(150);
    await learner.attempts.submit({ attemptId: extended.id });
    await expect(timed({ multiplier: 200 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  test("Subprofessional full mocks pin 145 scored questions and 160 minutes", async () => {
    const sub = await seedLearning(db, adminId, 24, "subprofessional");
    await other.profile.update({
      level: "subprofessional",
      days: [0, 1, 2, 3, 4, 5, 6],
      dailyMinutes: 25,
      targetDate: null,
      language: "english",
      revision: 1,
    });
    const quotas = Object.fromEntries(
      sub.topics.map((t, i) => [
        t.id,
        Math.floor(145 / sub.topics.length) + (i < 145 % sub.topics.length ? 1 : 0),
      ]),
    );
    const b = await admin.blueprints.create({ profileId: sub.profileId, quotas });
    await admin.blueprints.buildForms({ id: b.id });
    const a = await other.mocks.start({
      kind: "full",
      mode: "strict_mock",
      count: 10,
      multiplier: 100,
      requestId: crypto.randomUUID(),
    });
    const d = await other.attempts.get({ attemptId: a.id });
    expect(d.items).toHaveLength(145);
    expect(d.items.some((i) => i.topicId.startsWith("clerical-"))).toBe(true);
    expect(d.items.some((i) => i.topicId.startsWith("analytical-"))).toBe(false);
    expect((d.expiresAt?.getTime() ?? 0) - d.startedAt.getTime()).toBe(160 * 60 * 1000);
    await other.attempts.submit({ attemptId: a.id });
    await other.profile.update({
      level: "professional",
      days: [0, 1, 2, 3, 4, 5, 6],
      dailyMinutes: 25,
      targetDate: null,
      language: "english",
      revision: 2,
    });
  });
  test("server expiry races finalize accepted answers once and reject delayed saves", async () => {
    const [q] = await db
      .select()
      .from(questionVersion)
      .where(eq(questionVersion.status, "published"))
      .limit(1);
    if (!q) throw new Error("Missing version");
    const [a] = await db
      .insert(attempt)
      .values({
        userId: otherId,
        mode: "strict_mock",
        setKind: "short",
        profileVersionId: fixture.profileId,
        expiresAt: new Date(Date.now() + 350),
      })
      .returning();
    if (!a) throw new Error("Missing fixture");
    const [i] = await db
      .insert(attemptItem)
      .values({
        attemptId: a.id,
        position: 0,
        questionVersionId: q.id,
        choiceOrder: ["a", "b", "c"],
      })
      .returning();
    if (!i) throw new Error("Missing item");
    await answer(other, a.id, 0);
    await Bun.sleep(375);
    await Promise.all([
      other.attempts.clock({ attemptId: a.id }),
      other.attempts.submit({ attemptId: a.id }),
    ]);
    await expect(
      other.attempts.saveAnswer({
        attemptId: a.id,
        itemId: i.id,
        selectedChoiceId: "a",
        expectedRevision: 1,
        mutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      await db.select().from(attemptResult).where(eq(attemptResult.attemptId, a.id)),
    ).toHaveLength(1);
    expect((await other.attempts.results({ attemptId: a.id })).correct).toBe(1);
  });
});
describe("derived analytics", () => {
  test("unique coverage, first exposures, separate trends and deletion recalculate", async () => {
    const before = await learner.progress.summary();
    expect(before.total.presented).toBe(before.firstExposure.presented + before.repeated.presented);
    expect(before.uniquePresented).toBeLessThanOrEqual(before.total.presented);
    expect(before.fullMockTrend).toHaveLength(1);
    expect(before.timedSetTrend).toHaveLength(1);
    expect(before.extendedTrend).toHaveLength(1);
    expect(before.indicator).toBe("needs more evidence");
    const full = before.fullMockTrend[0];
    if (!full) throw new Error("Missing full mock");
    await expect(other.attempts.delete({ attemptId: full.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await learner.attempts.delete({ attemptId: full.id });
    const after = await learner.progress.summary();
    expect(after.fullMockTrend).toHaveLength(0);
    expect(after.total.presented).toBe(before.total.presented - 150);
    expect((await admin.progress.summary()).total.presented).toBe(0);
  });
  test("quarantine and retirement exclude future review queues while retaining history", async () => {
    const notebook = await learner.review.listDue();
    const last = notebook.history.find((e) => e.outcome === "incorrect");
    if (!last) throw new Error("Missing mistake");
    await db.update(question).set({ blocked: true }).where(eq(question.id, last.questionId));
    await db
      .update(reviewState)
      .set({ dueAt: sql`now()-interval '1 day'` })
      .where(eq(reviewState.questionId, last.questionId));
    const q = await learner.review.listDue();
    expect(q.history.some((e) => e.questionId === last.questionId)).toBe(true);
    const [v] = await db
      .select()
      .from(questionVersion)
      .where(
        and(
          eq(questionVersion.questionId, last.questionId),
          eq(questionVersion.status, "published"),
        ),
      );
    if (!v) throw new Error("Missing version");
    await admin.content.retire({ kind: "question", versionId: v.id, reason: "Test retirement." });
    expect(
      await db.select().from(reviewState).where(eq(reviewState.questionId, last.questionId)),
    ).toHaveLength(0);
  });
});
