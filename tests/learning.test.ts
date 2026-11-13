import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createRouterClient } from "@orpc/server";
import type { Context } from "@sibol-cse/api/context";
import { appRouter } from "@sibol-cse/api/routers/index";
import { createQuestionDraft } from "@sibol-cse/api/services/content";
import { createDb } from "@sibol-cse/db";
import {
  attempt,
  attemptItem,
  attemptResult,
  auditEvent,
  lessonProgress,
  question,
  questionVersion,
  reviewEvent,
  studyPreferences,
  user,
  userProfile,
} from "@sibol-cse/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { checklist, lessonDraft, questionDraft, seedLearning } from "./fixtures/learning";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("A dedicated TEST_DATABASE_URL ending in _test is required.");
const db = createDb({ DATABASE_URL: url });
const adminId = crypto.randomUUID(),
  learnerId = crypto.randomUUID(),
  otherId = crypto.randomUUID();
function client(id: string, role: "admin" | "learner" = "learner") {
  const now = new Date();
  const context: Context = {
    db,
    sendInvitation: async () => {},
    session: {
      user: {
        id,
        name: role,
        email: `${id}@example.test`,
        emailVerified: true,
        image: null,
        createdAt: now,
        updatedAt: now,
      },
      session: {
        id: crypto.randomUUID(),
        token: "test-only",
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
const admin = client(adminId, "admin"),
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
  fixture = await seedLearning(db, adminId);
}, 60000);
afterAll(async () => {
  await db.$client.end();
});
const start = () =>
  learner.practice.create({
    topicId: "numerical-arithmetic",
    difficulty: "any",
    count: 5,
    unseenFirst: true,
    requestId: crypto.randomUUID(),
  });
async function first() {
  const a = await start();
  const d = await learner.attempts.get({ attemptId: a.id });
  const item = d.items[0];
  if (!item) throw new Error("No fixture item");
  return { a, d, item };
}

describe("editorial publication and imports", () => {
  test("learners cannot author, review, import or activate profiles", async () => {
    await expect(
      learner.content.createQuestion({ question: questionDraft("denied") }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(learner.imports.validate({ format: "json", file: "[]" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(learner.profiles.activate({ id: fixture.profileId })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  test("review checklist is mandatory, publication is explicit, correction preserves history", async () => {
    const q = await admin.content.createQuestion({ question: questionDraft("editorial-original") });
    await expect(
      admin.content.publish({ kind: "question", versionId: q.id }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      admin.content.review({
        kind: "question",
        versionId: q.id,
        checklist: { ...checklist, accurate: false } as unknown as typeof checklist,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await admin.content.review({ kind: "question", versionId: q.id, checklist });
    await admin.content.publish({ kind: "question", versionId: q.id });
    const corrected = await admin.content.createQuestion({
      question: {
        ...questionDraft("editorial-original"),
        explanation: "A reviewed corrected explanation.",
      },
      correctionId: q.questionId,
    });
    await admin.content.review({ kind: "question", versionId: corrected.id, checklist });
    await expect(
      admin.content.publish({ kind: "question", versionId: corrected.id }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await admin.content.publish({
      kind: "question",
      versionId: corrected.id,
      erratum: "Explanation clarified; original scoring is retained.",
    });
    const [old] = await db.select().from(questionVersion).where(eq(questionVersion.id, q.id));
    expect(old?.answerChoiceId).toBe("b");
    expect(old?.status).toBe("retired");
    expect(old?.erratum).toContain("clarified");
    expect(
      (await db.select().from(auditEvent).where(eq(auditEvent.targetId, corrected.id))).length,
    ).toBe(3);
  });
  test("HTML, dangerous media, duplicate keys and unsupported topics fail validation", async () => {
    await expect(
      admin.content.createQuestion({
        question: { ...questionDraft("html"), prompt: "<script>alert(1)</script>" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      admin.content.createQuestion({
        question: {
          ...questionDraft("media"),
          media: { src: "https://tracking.example/a.png", alt: "test" },
        },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      admin.content.createQuestion({
        question: { ...questionDraft("bad-key"), answerChoiceId: "foreign" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      admin.content.createQuestion({
        question: { ...questionDraft("wrong-level"), topicId: "clerical-filing" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  test("JSON and quoted CSV imports show row errors and commit drafts once", async () => {
    const input = questionDraft("import-json");
    const invalid = await admin.imports.validate({
      format: "json",
      file: JSON.stringify([
        input,
        input,
        { ...questionDraft("invalid-key"), answerChoiceId: "none" },
      ]),
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.map((e) => e.row)).toEqual([2, 3]);
    const valid = await admin.imports.validate({ format: "json", file: JSON.stringify([input]) });
    expect(valid.valid).toBe(true);
    if (!valid.batchId) throw new Error("No batch");
    await admin.imports.commit({ id: valid.batchId });
    await admin.imports.commit({ id: valid.batchId });
    const [q] = await db.select().from(question).where(eq(question.externalId, "import-json"));
    expect(q).toBeDefined();
    const versions = await db
      .select()
      .from(questionVersion)
      .where(eq(questionVersion.questionId, q?.id ?? ""));
    expect(versions).toHaveLength(1);
    expect(versions[0]?.status).toBe("draft");
    const row = questionDraft("import-csv");
    const fields = Object.keys(row);
    const quote = (v: unknown) =>
      `"${(typeof v === "object" && v !== null ? JSON.stringify(v) : v === null ? "" : String(v)).replaceAll('"', '""')}"`;
    const csv = `${fields.join(",")}\n${fields.map((k) => quote(row[k as keyof typeof row])).join(",")}`;
    const preview = await admin.imports.validate({ format: "csv", file: csv });
    expect(preview.valid).toBe(true);
  });
  test("inventory gate demands enough content, quotas and nonoverlapping complete forms", async () => {
    let report = await admin.profiles.inventory({ level: "professional" });
    expect(report.questionCount).toBeGreaterThanOrEqual(300);
    expect(report.ready).toBe(false);
    await expect(admin.profiles.launch({ level: "professional" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    const quotas = Object.fromEntries(
      fixture.topics.map((t, i) => [
        t.id,
        Math.floor(150 / fixture.topics.length) + (i < 150 % fixture.topics.length ? 1 : 0),
      ]),
    );
    const b = await admin.blueprints.create({ profileId: fixture.profileId, quotas });
    await admin.blueprints.buildForms({ id: b.id });
    report = await admin.profiles.inventory({ level: "professional" });
    expect(report.ready).toBe(true);
    await admin.profiles.launch({ level: "professional" });
  });
});

describe("lesson privacy and reading history", () => {
  test("unpublished lessons are hidden and published reading resumes with checked revisions", async () => {
    const draft = await admin.content.createLesson(lessonDraft("reading-history"));
    await expect(learner.lessons.get({ slug: "reading-history" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await admin.content.review({ kind: "lesson", versionId: draft.id, checklist });
    await admin.content.publish({ kind: "lesson", versionId: draft.id });
    await learner.lessons.saveProgress({
      versionId: draft.id,
      location: "workedExample",
      revision: 0,
    });
    const page = await learner.lessons.get({ slug: "reading-history" });
    expect(page.progress?.location).toBe("workedExample");
    expect((await other.lessons.get({ slug: "reading-history" })).progress).toBeNull();
    await expect(
      learner.lessons.saveProgress({ versionId: draft.id, location: "technique", revision: 0 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const newer = await admin.content.createLesson({
      ...lessonDraft("reading-history"),
      title: "New version",
    });
    await admin.content.review({ kind: "lesson", versionId: newer.id, checklist });
    await admin.content.publish({
      kind: "lesson",
      versionId: newer.id,
      erratum: "Worked example clarified.",
    });
    expect((await learner.lessons.get({ slug: "reading-history" })).versionId).toBe(draft.id);
    expect((await learner.lessons.get({ slug: "reading-history", latest: true })).versionId).toBe(
      newer.id,
    );
    await learner.lessons.saveProgress({
      versionId: draft.id,
      location: "technique",
      revision: 1,
      complete: true,
    });
    expect(
      (
        await db
          .select()
          .from(lessonProgress)
          .where(and(eq(lessonProgress.userId, learnerId), eq(lessonProgress.lessonId, page.id)))
      )[0]?.completedAt,
    ).not.toBeNull();
  });
});

describe("practice and attempt invariants", () => {
  test("creation retries pin one set, choices and first-exposure labels", async () => {
    const requestId = crypto.randomUUID();
    const input = {
      topicId: "numerical-arithmetic",
      difficulty: "any" as const,
      count: 5 as const,
      unseenFirst: true,
      requestId,
    };
    const [a, b] = await Promise.all([
      learner.practice.create(input),
      learner.practice.create(input),
    ]);
    expect(a.id).toBe(b.id);
    const one = await learner.attempts.get({ attemptId: a.id });
    const two = await learner.attempts.get({ attemptId: a.id });
    expect(one.items.map((i) => i.choices)).toEqual(two.items.map((i) => i.choices));
    expect(new Set(one.items.map((i) => i.questionId)).size).toBe(5);
    expect(one.items.every((i) => i.feedback === null)).toBe(true);
  });
  test("keys are withheld until commit; revisions, choice membership and duplicate commits are checked", async () => {
    const { a, item } = await first();
    await expect(other.attempts.get({ attemptId: a.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(admin.attempts.get({ attemptId: a.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      learner.attempts.saveAnswer({
        attemptId: a.id,
        itemId: item.id,
        selectedChoiceId: "foreign",
        expectedRevision: 0,
        mutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const save = {
      attemptId: a.id,
      itemId: item.id,
      selectedChoiceId: "a",
      expectedRevision: 0,
      mutationId: crypto.randomUUID(),
    };
    const saved = await learner.attempts.saveAnswer(save);
    expect(saved.revision).toBe(1);
    expect((await learner.attempts.saveAnswer(save)).revision).toBe(1);
    expect((await learner.attempts.get({ attemptId: a.id })).items[0]?.feedback).toBeNull();
    await expect(
      learner.attempts.saveAnswer({
        ...save,
        selectedChoiceId: "b",
        mutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const [one, two] = await Promise.all([
      learner.attempts.commit({ attemptId: a.id, itemId: item.id, revision: 1 }),
      learner.attempts.commit({ attemptId: a.id, itemId: item.id, revision: 1 }),
    ]);
    expect(one).toEqual(two);
    expect(one.correct).toBe(false);
    expect(one.answerChoiceId).toBe("b");
    expect(
      await db
        .select()
        .from(reviewEvent)
        .where(eq(reviewEvent.eventKey, `practice:${item.id}`)),
    ).toHaveLength(1);
    await expect(
      learner.attempts.saveAnswer({
        ...save,
        expectedRevision: 1,
        mutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  test("simultaneous stale saves have one winner and refresh restores the acknowledgement", async () => {
    const { a, item } = await first();
    const answers = await Promise.allSettled(
      ["a", "b"].map((selectedChoiceId) =>
        learner.attempts.saveAnswer({
          attemptId: a.id,
          itemId: item.id,
          selectedChoiceId,
          expectedRevision: 0,
          mutationId: crypto.randomUUID(),
        }),
      ),
    );
    expect(answers.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const restored = await learner.attempts.get({ attemptId: a.id });
    expect(restored.items[0]?.revision).toBe(1);
    expect(restored.items[0]?.savedAt).toBeInstanceOf(Date);
    const changed = {
      attemptId: a.id,
      itemId: item.id,
      selectedChoiceId: "c",
      expectedRevision: 1,
      mutationId: crypto.randomUUID(),
    };
    expect((await learner.attempts.saveAnswer(changed)).revision).toBe(2);
    expect((await learner.attempts.saveAnswer(changed)).revision).toBe(2);
    const acknowledged = await learner.attempts.get({ attemptId: a.id });
    expect(acknowledged.items[0]?.selectedChoiceId).toBe("c");
    expect(acknowledged.items[0]?.revision).toBe(2);
  });
  test("scoring handles shuffled IDs and blanks and concurrent submission stores one result", async () => {
    const { a, d } = await first();
    const item = d.items[0];
    if (!item) throw new Error("Missing item");
    await learner.attempts.saveAnswer({
      attemptId: a.id,
      itemId: item.id,
      selectedChoiceId: "b",
      expectedRevision: 0,
      mutationId: crypto.randomUUID(),
    });
    const results = await Promise.all([
      learner.attempts.submit({ attemptId: a.id }),
      learner.attempts.submit({ attemptId: a.id }),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(
      await db.select().from(attemptResult).where(eq(attemptResult.attemptId, a.id)),
    ).toHaveLength(1);
    const summary = await learner.attempts.results({ attemptId: a.id });
    expect(summary.correct).toBe(1);
    expect(summary.unanswered).toBe(4);
    expect(summary.accuracy).toBe(0.2);
    expect(summary.attemptedAccuracy).toBe(1);
    await expect(
      learner.attempts.setFlag({ attemptId: a.id, itemId: item.id, flagged: true }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  test("notes/bookmarks are owner-private and an active strict mock blocks alternate feedback", async () => {
    const { a, item } = await first();
    await learner.studyTools.save({
      attemptId: a.id,
      itemId: item.id,
      kind: "note",
      value: "My private working",
    });
    await learner.studyTools.save({
      attemptId: a.id,
      itemId: item.id,
      kind: "bookmark",
      value: true,
    });
    expect((await learner.studyTools.get({ attemptId: a.id, itemId: item.id })).note).toBe(
      "My private working",
    );
    await expect(other.studyTools.get({ attemptId: a.id, itemId: item.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await learner.attempts.commit({ attemptId: a.id, itemId: item.id, revision: 0 });
    const [strict] = await db
      .insert(attempt)
      .values({
        userId: learnerId,
        mode: "strict_mock",
        profileVersionId: fixture.profileId,
        expiresAt: new Date(Date.now() + 60000),
      })
      .returning();
    if (!strict) throw new Error("No strict fixture");
    await db.insert(attemptItem).values({
      attemptId: strict.id,
      position: 0,
      questionVersionId: item.versionId,
      choiceOrder: item.choices.map((c) => c.id),
    });
    await expect(
      learner.studyTools.get({ attemptId: a.id, itemId: item.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await learner.attempts.get({ attemptId: a.id })).items[0]?.feedback).toBeNull();
    await learner.attempts.submit({ attemptId: strict.id });
  });
  test("quarantine excludes future selection and preserves pinned versions with warnings", async () => {
    const { a, item } = await first();
    const issue = await learner.issues.report({
      attemptId: a.id,
      itemId: item.id,
      category: "wrong_answer",
      description: "Please check the reasoning.",
    });
    if (!issue.id) throw new Error("Missing issue");
    await admin.issues.resolve({
      id: issue.id,
      resolution: "Under editorial review.",
      quarantine: true,
    });
    expect((await learner.attempts.get({ attemptId: a.id })).items[0]?.warning).toContain(
      "editorial review",
    );
    const next = await learner.practice.create({
      topicId: "numerical-arithmetic",
      difficulty: "any",
      count: 20,
      unseenFirst: true,
      requestId: crypto.randomUUID(),
    });
    expect(
      (await learner.attempts.get({ attemptId: next.id })).items.some(
        (i) => i.questionId === item.questionId,
      ),
    ).toBe(false);
  });
});

describe("balanced diagnostic", () => {
  test("default 30 covers all major areas and withholds feedback until completion", async () => {
    const a = await other.diagnostic.create({ requestId: crypto.randomUUID() });
    const d = await other.attempts.get({ attemptId: a.id });
    expect(d.items).toHaveLength(30);
    expect(d.items.every((i) => i.feedback === null)).toBe(true);
    expect(new Set(d.items.map((i) => i.questionId)).size).toBe(30);
    await expect(
      other.attempts.commit({ attemptId: a.id, itemId: d.items[0]?.id ?? "", revision: 0 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      other.practice.create({
        topicId: "numerical-arithmetic",
        difficulty: "any",
        count: 5,
        unseenFirst: true,
        requestId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const original = d.items[0];
    if (!original) throw new Error("Missing diagnostic item");
    const [alternate] = await db
      .insert(attempt)
      .values({
        userId: otherId,
        mode: "practice",
        profileVersionId: fixture.profileId,
      })
      .returning();
    if (!alternate) throw new Error("Missing alternate fixture");
    const [alternateItem] = await db
      .insert(attemptItem)
      .values({
        attemptId: alternate.id,
        position: 0,
        questionVersionId: original.versionId,
        choiceOrder: original.choices.map((c) => c.id),
      })
      .returning();
    if (!alternateItem) throw new Error("Missing alternate item");
    await expect(
      other.attempts.commit({ attemptId: alternate.id, itemId: alternateItem.id, revision: 0 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await other.attempts.get({ attemptId: alternate.id })).items[0]?.feedback).toBeNull();
    await other.attempts.submit({ attemptId: a.id });
    const r = await other.attempts.results({ attemptId: a.id });
    expect(r.unanswered).toBe(30);
    expect(r.topics.every((t) => t.provisional)).toBe(true);
    expect(r.topics.every((t) => t.firstExposureCount === 0)).toBe(true);
    expect(r.detail.items.every((i) => i.feedback !== null)).toBe(true);
    await other.attempts.submit({ attemptId: alternate.id });
  });
  test("coverage shortages do not create a shortened diagnostic; skipping has insufficient-evidence labels", async () => {
    const ids = await db
      .select({ id: question.id })
      .from(question)
      .innerJoin(questionVersion, eq(questionVersion.questionId, question.id))
      .where(eq(questionVersion.primaryTopicId, "analytical-analogies"));
    for (const { id } of ids)
      await db.update(question).set({ blocked: true }).where(eq(question.id, id));
    const before = await db
      .select({ id: attempt.id })
      .from(attempt)
      .where(eq(attempt.userId, learnerId));
    await expect(
      learner.diagnostic.create({ requestId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const after = await db
      .select({ id: attempt.id })
      .from(attempt)
      .where(eq(attempt.userId, learnerId));
    expect(after.length).toBe(before.length);
    expect((await learner.diagnostic.skip()).reason).toContain("insufficient evidence");
  });
});

describe("shared history and timing boundaries", () => {
  test("server expiry finalizes once and late edits cannot change a result", async () => {
    const { a, item } = await first();
    const [timed] = await db
      .insert(attempt)
      .values({
        userId: learnerId,
        mode: "strict_mock",
        profileVersionId: fixture.profileId,
        expiresAt: new Date(Date.now() + 250),
      })
      .returning();
    if (!timed) throw new Error("Timed fixture missing");
    const [pinned] = await db
      .insert(attemptItem)
      .values({
        attemptId: timed.id,
        position: 0,
        questionVersionId: item.versionId,
        choiceOrder: item.choices.map((c) => c.id),
      })
      .returning();
    if (!pinned) throw new Error("Pinned item missing");
    await Bun.sleep(275);
    const restored = await learner.attempts.get({ attemptId: timed.id });
    expect(restored.status).toBe("expired");
    await expect(
      learner.attempts.saveAnswer({
        attemptId: timed.id,
        itemId: pinned.id,
        selectedChoiceId: "b",
        expectedRevision: 0,
        mutationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await learner.attempts.submit({ attemptId: timed.id });
    expect(
      await db.select().from(attemptResult).where(eq(attemptResult.attemptId, timed.id)),
    ).toHaveLength(1);
    expect((await learner.attempts.results({ attemptId: timed.id })).unanswered).toBe(1);
    expect((await learner.attempts.get({ attemptId: a.id })).status).toBe("in_progress");
  });
  test("published corrections change future keys while preserving original scores and visible errata", async () => {
    const { a, item } = await first();
    await learner.attempts.saveAnswer({
      attemptId: a.id,
      itemId: item.id,
      selectedChoiceId: "b",
      expectedRevision: 0,
      mutationId: crypto.randomUUID(),
    });
    await learner.attempts.submit({ attemptId: a.id });
    const original = await learner.attempts.results({ attemptId: a.id });
    const record = await admin.content.question({ id: item.versionId });
    const replacement = {
      ...questionDraft(record.externalId ?? "missing"),
      prompt: record.prompt,
      choices: record.choices,
      answerChoiceId: "a",
      explanation: "An explicit test correction to the original key.",
    };
    const correction = await admin.content.createQuestion({
      question: replacement,
      correctionId: record.questionId,
    });
    await admin.content.review({ kind: "question", versionId: correction.id, checklist });
    await admin.content.publish({
      kind: "question",
      versionId: correction.id,
      erratum: "Test correction: original scoring is preserved.",
    });
    const history = await learner.attempts.results({ attemptId: a.id });
    expect(history.correct).toBe(original.correct);
    expect(history.detail.items[0]?.feedback?.answerChoiceId).toBe("b");
    expect(history.detail.items[0]?.feedback?.erratum).toContain("Test correction");
    expect((await admin.content.question({ id: correction.id })).answerChoiceId).toBe("a");
  });
  test("subprofessional diagnostics include clerical coverage and level changes preserve old attempts", async () => {
    const { examProfileVersion } = await import("@sibol-cse/db/schema");
    const [profile] = await db
      .insert(examProfileVersion)
      .values({
        level: "subprofessional",
        version: 99,
        itemCount: 145,
        durationMinutes: 160,
        diagnosticCount: 30,
        sourceUrl: "https://csc.gov.ph/test-only",
        sourceTitle: "Test-only source metadata",
        verifiedAt: new Date(),
        reviewerId: adminId,
        active: true,
      })
      .returning();
    if (!profile) throw new Error("Profile fixture missing");
    const topics = await db.select().from((await import("@sibol-cse/db/schema")).topic);
    await db.transaction(async (tx) => {
      for (const t of topics.filter((t) => t.levels.includes("subprofessional")))
        for (let n = 0; n < 4; n++) {
          const draft = await createQuestionDraft(tx, adminId, {
            ...questionDraft(`sub-${t.id}-${n}`, t.id),
            level: "subprofessional",
          });
          await tx
            .update(questionVersion)
            .set({ status: "published", reviewedAt: new Date(), reviewedBy: adminId })
            .where(eq(questionVersion.id, draft.id));
        }
    });
    const prior = await db
      .select()
      .from(attempt)
      .where(and(eq(attempt.userId, otherId), eq(attempt.mode, "diagnostic")));
    const [oldActive] = await db
      .insert(attempt)
      .values({
        userId: otherId,
        mode: "diagnostic",
        profileVersionId: fixture.profileId,
      })
      .returning();
    if (!oldActive) throw new Error("Missing original-level fixture");
    const priorDetail = await other.attempts.get({ attemptId: prior[0]?.id ?? "" });
    const pinnedItem = priorDetail.items[0];
    if (!pinnedItem) throw new Error("Missing original-level question");
    await db.insert(attemptItem).values({
      attemptId: oldActive.id,
      position: 0,
      questionVersionId: pinnedItem.versionId,
      choiceOrder: pinnedItem.choices.map((c) => c.id),
    });
    await other.profile.update({
      level: "subprofessional",
      days: [1, 3, 5],
      dailyMinutes: 25,
      targetDate: null,
      language: "english",
      revision: 1,
    });
    expect((await other.profile.get()).diagnosticDecision).toBe("pending");
    await other.attempts.submit({ attemptId: oldActive.id });
    expect((await other.profile.get()).diagnosticDecision).toBe("pending");
    const diagnostic = await other.diagnostic.create({ requestId: crypto.randomUUID() });
    const detail = await other.attempts.get({ attemptId: diagnostic.id });
    expect(detail.items).toHaveLength(30);
    expect(detail.items.some((i) => i.topicId === "clerical-filing")).toBe(true);
    expect(detail.items.some((i) => i.topicId.startsWith("analytical-"))).toBe(false);
    expect(
      (
        await db
          .select()
          .from(attempt)
          .where(eq(attempt.id, prior[0]?.id ?? ""))
      )[0]?.profileVersionId,
    ).toBe(fixture.profileId);
    await other.attempts.submit({ attemptId: diagnostic.id });
    expect((await other.diagnostic.skip()).skipped).toBe(false);
  });
});
