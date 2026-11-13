import { afterAll, beforeAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { createRouterClient } from "@orpc/server";
import type { Context } from "@sibol-cse/api/context";
import { questionInput } from "@sibol-cse/api/learning-contracts";
import { appRouter } from "@sibol-cse/api/routers/index";
import { candidates } from "@sibol-cse/api/services/catalog";
import { readContentAsset } from "@sibol-cse/api/services/content-media";
import {
  finalizeProviderBank,
  importProviderSnapshots,
  openProviderBank,
} from "@sibol-cse/api/services/provider-content";
import { providerTopics } from "@sibol-cse/api/study-catalog";
import { createDb } from "@sibol-cse/db";
import {
  attemptAnswer,
  contentAsset,
  questionVersion,
  reviewEvent,
  reviewState,
  studyPreferences,
  topic,
  user,
  userProfile,
} from "@sibol-cse/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { checklist, questionDraft, seedLearning } from "./fixtures/learning";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("A dedicated TEST_DATABASE_URL ending in _test is required.");
const db = createDb({ DATABASE_URL: url });
const adminId = crypto.randomUUID(),
  learnerId = crypto.randomUUID(),
  otherId = crypto.randomUUID();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
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
        token: "fixture-only",
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
const admin = client(adminId),
  learner = client(learnerId),
  other = client(otherId);
const pixel =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF8cAAAAASUVORK5CYII=";
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
    await db.insert(studyPreferences).values({
      userId: id,
      level: id === otherId ? "subprofessional" : "professional",
      days: [1, 3, 5],
      dailyMinutes: 25,
    });
  }
  await seedLearning(db, adminId, 6);
  await seedLearning(db, adminId, 6, "subprofessional");
  for (const id of ["format-shared", "format-order", "format-images", "format-error"])
    await db.insert(topic).values({
      id,
      slug: id,
      title: id,
      area: "verbal",
      levels: ["professional", "subprofessional"],
    });
}, 60000);
afterAll(async () => {
  await db.$client.end();
});
async function publish(input: ReturnType<typeof questionInput.parse>) {
  const draft = await admin.content.createQuestion({ question: input });
  await admin.content.review({ kind: "question", versionId: draft.id, checklist });
  await admin.content.publish({ kind: "question", versionId: draft.id });
  return draft;
}
const practice = (topicId: string) =>
  learner.practice.create({
    topicId,
    count: 5,
    difficulty: "any",
    unseenFirst: true,
    requestId: crypto.randomUUID(),
  });

test("one shared identity serves both tracks and catalogs hide the other track's category", async () => {
  const ids: string[] = [];
  for (let i = 0; i < 5; i++)
    ids.push(
      (
        await publish(
          questionInput.parse({
            ...questionDraft(`shared-${i}`, "format-shared"),
            levels: ["professional", "subprofessional"],
          }),
        )
      ).questionId,
    );
  for (const level of ["professional", "subprofessional"] as const)
    expect((await candidates(db, level)).filter((q) => ids.includes(q.questionId))).toHaveLength(5);
  const a = await practice("format-shared");
  const b = await other.practice.create({
    topicId: "format-shared",
    count: 5,
    difficulty: "any",
    unseenFirst: true,
    requestId: crypto.randomUUID(),
  });
  expect(
    (await learner.attempts.get({ attemptId: a.id })).items.map((i) => i.questionId).sort(),
  ).toEqual((await other.attempts.get({ attemptId: b.id })).items.map((i) => i.questionId).sort());
  expect((await learner.topics.catalog()).areas.map((a) => a.id)).not.toContain("clerical");
  expect((await other.topics.catalog()).areas.map((a) => a.id)).not.toContain("analytical");
});
test("ordering saves, stale/replayed writes, local scoring and review snapshots preserve the sequence", async () => {
  for (let i = 0; i < 5; i++)
    await publish(
      questionInput.parse({
        ...questionDraft(`order-${i}`, "format-order"),
        kind: "order",
        choices: [],
        answerChoiceId: null,
        orderItems: [
          { id: "a", text: "First, begin." },
          { id: "b", text: "Then, continue." },
          { id: "c", text: "Finally, finish." },
        ],
        answerOrder: ["a", "b", "c"],
      }),
    );
  const a = await practice("format-order"),
    initial = await learner.attempts.get({ attemptId: a.id });
  const item = initial.items[0],
    second = initial.items[1];
  if (!item || !second) throw new Error("Missing ordering fixture.");
  expect(initial.items.every((i) => i.orderItems.length === 3 && i.feedback === null)).toBe(true);
  expect(JSON.stringify(initial)).not.toContain("answerOrder");
  await expect(other.attempts.get({ attemptId: a.id })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  const input = {
    attemptId: a.id,
    itemId: item.id,
    selectedChoiceId: null,
    selectedOrder: ["c", "b", "a"],
    expectedRevision: 0,
    mutationId: crypto.randomUUID(),
  };
  await expect(
    learner.attempts.saveAnswer({ ...input, selectedOrder: ["a", "a", "c"] }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  const saved = await learner.attempts.saveAnswer(input);
  expect((await learner.attempts.saveAnswer(input)).revision).toBe(saved.revision);
  await expect(
    learner.attempts.saveAnswer({ ...input, selectedOrder: ["a", "b", "c"] }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(
    learner.attempts.saveAnswer({ ...input, mutationId: crypto.randomUUID() }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  const restored = await learner.attempts.get({ attemptId: a.id });
  expect(restored.items[0]?.selectedOrder).toEqual(input.selectedOrder);
  expect(restored.items[0]?.orderItems).toEqual(item.orderItems);
  expect(restored.items[0]?.feedback).toBeNull();
  const feedback = await learner.attempts.commit({
    attemptId: a.id,
    itemId: item.id,
    revision: saved.revision,
  });
  expect(feedback.correct).toBe(false);
  expect(feedback.answerOrder).toEqual(["a", "b", "c"]);
  await learner.attempts.commit({ attemptId: a.id, itemId: item.id, revision: saved.revision });
  expect(
    await db.select().from(reviewEvent).where(eq(reviewEvent.attemptItemId, item.id)),
  ).toHaveLength(1);
  const good = await learner.attempts.saveAnswer({
    ...input,
    itemId: second.id,
    selectedOrder: ["a", "b", "c"],
    mutationId: crypto.randomUUID(),
  });
  await learner.attempts.commit({ attemptId: a.id, itemId: second.id, revision: good.revision });
  const results = await Promise.all([
    learner.attempts.submit({ attemptId: a.id }),
    learner.attempts.submit({ attemptId: a.id }),
  ]);
  expect(results[0]).toEqual(results[1]);
  expect(results[0]?.correct).toBe(1);
  expect(results[0]?.incorrect).toBe(1);
  expect(results[0]?.unanswered).toBe(3);
  const notebook = await learner.review.listDue({ page: 0, topicId: "format-order" });
  expect(notebook.history.find((e) => e.questionId === item.questionId)?.selected).toBe(
    "Finally, finish. → Then, continue. → First, begin.",
  );
  expect(notebook.history.find((e) => e.questionId === item.questionId)?.key).toBe(
    "First, begin. → Then, continue. → Finally, finish.",
  );
  await db
    .update(reviewState)
    .set({ dueAt: new Date(Date.now() - 60000) })
    .where(and(eq(reviewState.userId, learnerId), eq(reviewState.questionId, item.questionId)));
  const review = await learner.review.start({
    count: 1,
    topicId: "format-order",
    requestId: crypto.randomUUID(),
  });
  expect((await learner.attempts.get({ attemptId: review.id })).items[0]?.kind).toBe("order");
});
test("database guards reject malformed order arrays independently of the API", async () => {
  const a = await practice("format-order"),
    detail = await learner.attempts.get({ attemptId: a.id }),
    item = detail.items[0];
  if (!item) throw new Error("No fixture item.");
  await expect(
    Promise.resolve(
      db.insert(attemptAnswer).values({
        attemptItemId: item.id,
        questionVersionId: item.versionId,
        selectedOrder: ["a", "a", "c"],
        revision: 1,
      }),
    ),
  ).rejects.toThrow();
  await expect(
    Promise.resolve(
      db
        .update(questionVersion)
        .set({ answerOrder: ["a", "a", "c"] })
        .where(eq(questionVersion.id, item.versionId)),
    ),
  ).rejects.toThrow();
});
test("registered images are private, immutable and inaccessible to learners without a pinned reference", async () => {
  const asset = await admin.content.putAsset({ mime: "image/png", dataBase64: pixel });
  await expect(
    learner.content.putAsset({ mime: "image/png", dataBase64: pixel }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    readContentAsset(db, learnerId, asset.src.split("/").at(-1) ?? ""),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(
    (await readContentAsset(db, adminId, asset.src.split("/").at(-1) ?? "")).bytes.length,
  ).toBeGreaterThan(24);
  await expect(
    Promise.resolve(
      db.update(contentAsset).set({ mime: "image/jpeg" }).where(eq(contentAsset.id, asset.id)),
    ),
  ).rejects.toThrow();
  const media = {
    src: asset.src,
    alt: "Original software-test image swatch.",
    descriptionReviewed: true,
  };
  const draft = await admin.content.createQuestion({
    question: questionInput.parse({
      ...questionDraft("unreviewed-image", "format-images"),
      media: { ...media, descriptionReviewed: false },
    }),
  });
  await expect(
    admin.content.review({ kind: "question", versionId: draft.id, checklist }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  for (let i = 0; i < 5; i++)
    await publish(
      questionInput.parse({
        ...questionDraft(`image-choice-${i}`, "format-images"),
        media,
        choices: [
          { id: "a", text: "First description", media },
          { id: "b", text: "Second description", media },
        ],
        answerChoiceId: "b",
      }),
    );
  const a = await practice("format-images"),
    detail = await learner.attempts.get({ attemptId: a.id });
  expect(
    detail.items.every(
      (i) => i.media?.src === asset.src && i.choices.every((c) => c.media?.src === asset.src),
    ),
  ).toBe(true);
  expect((await readContentAsset(db, learnerId, asset.src.split("/").at(-1) ?? "")).mime).toBe(
    "image/png",
  );
  await expect(
    readContentAsset(db, otherId, asset.src.split("/").at(-1) ?? ""),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(readContentAsset(db, learnerId, `${asset.id}.jpg`)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});
test("error-recognition labels stay fixed and category filters are enforced server-side", async () => {
  for (let i = 0; i < 5; i++)
    await publish(
      questionInput.parse({
        ...questionDraft(`error-format-${i}`, "format-error"),
        kind: "error",
        instruction: "Choose the incorrect segment.",
        choices: [
          { id: "c", label: "C", text: "Third segment" },
          { id: "a", label: "A", text: "First segment" },
          { id: "b", label: "B", text: "Second segment" },
        ],
      }),
    );
  const a = await practice("format-error"),
    detail = await learner.attempts.get({ attemptId: a.id });
  expect(detail.items.every((i) => i.choices.map((c) => c.label).join("") === "ABC")).toBe(true);
  await expect(
    learner.practice.create({
      topicId: "mixed",
      area: "clerical",
      count: 5,
      difficulty: "any",
      unseenFirst: true,
      requestId: crypto.randomUUID(),
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(
    learner.practice.create({
      topicId: "numerical-arithmetic",
      area: "verbal",
      count: 5,
      difficulty: "any",
      unseenFirst: true,
      requestId: crypto.randomUUID(),
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(
    learner.mocks.start({
      kind: "full",
      mode: "strict_mock",
      count: 10,
      multiplier: 100,
      area: "numerical",
      requestId: crypto.randomUUID(),
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  const timed = await learner.mocks.start({
    kind: "short",
    mode: "strict_mock",
    count: 10,
    multiplier: 100,
    area: "numerical",
    requestId: crypto.randomUUID(),
  });
  const strict = await learner.attempts.get({ attemptId: timed.id });
  expect(strict.items.every((i) => i.area === "numerical" && i.feedback === null)).toBe(true);
  expect(JSON.stringify(strict)).not.toContain("answerOrder");
  await learner.attempts.submit({ attemptId: timed.id });
});
test("sampling reports all topic counts without claiming a complete bank, and resumes without duplicates", async () => {
  const opened = await openProviderBank(db, adminId, {
    manifestHash: hash("sample-bank"),
    permissionHash: hash("permission"),
    report: {},
  });
  expect(
    (
      await openProviderBank(db, adminId, {
        manifestHash: hash("sample-bank"),
        permissionHash: hash("permission"),
        report: {},
      })
    ).id,
  ).toBe(opened.id);
  const rows = providerTopics.map((t, i) => ({
    sourceKey: hash(`source-${i}`).slice(0, 48),
    providerQuestionId: `source-${i}`,
    category: t.category,
    subcategory: t.subcategory,
    levels: [...t.levels],
    topicId: t.topicId,
    raw: { id: `source-${i}`, text: "Synthetic source only" },
    fingerprint: hash(`revision-${i}`),
    native: null,
    heldReasons: ["Awaiting editorial adaptation"],
  }));
  expect((await importProviderSnapshots(db, adminId, opened.id, rows)).inserted).toBe(16);
  expect((await importProviderSnapshots(db, adminId, opened.id, rows)).existing).toBe(16);
  expect((await finalizeProviderBank(db, adminId, opened.id)).coverageVerified).toBe(false);
  expect((await admin.content.coverage({ level: "professional" })).topics).toHaveLength(14);
  expect((await admin.content.coverage({ level: "subprofessional" })).topics).toHaveLength(11);
  const sourceQuery = { bankId: opened.id, subcategory: "basic_operations", page: 0 };
  const sources = await admin.content.sources(sourceQuery);
  expect(sources.items).toHaveLength(1);
  expect(sources.items[0]?.topicTitle).toBeTruthy();
  const sourceKey = sources.items[0]?.key;
  if (!sourceKey) throw new Error("Missing synthetic source.");
  const recordQuery = { ...sourceQuery, sourceKey };
  const record = await admin.content.sourceRecord({
    bankId: recordQuery.bankId,
    subcategory: recordQuery.subcategory,
    sourceKey,
  });
  expect(record.prompt).toBe("Synthetic source only");
  await expect(learner.content.sources(sourceQuery)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    learner.content.sourceRecord({ bankId: opened.id, subcategory: "basic_operations", sourceKey }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(learner.content.coverage({ level: "professional" })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(
    openProviderBank(db, learnerId, {
      manifestHash: hash("denied"),
      permissionHash: hash("permission"),
      report: {},
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  const expected = Object.fromEntries(
    providerTopics.map((t, i) => [`${t.category}/${t.subcategory}`, [`source-${i}`]]),
  );
  const authoritative = await openProviderBank(db, adminId, {
    manifestHash: hash("authoritative-bank"),
    permissionHash: hash("permission"),
    mode: "export",
    expectedIds: expected,
    report: {},
  });
  await importProviderSnapshots(db, adminId, authoritative.id, rows);
  expect((await finalizeProviderBank(db, adminId, authoritative.id)).coverageVerified).toBe(true);
});
