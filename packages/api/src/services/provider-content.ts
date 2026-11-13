import type { Database } from "@sibol-cse/db";
import {
  attemptItem,
  auditEvent,
  providerBank,
  providerSnapshot,
  question,
  questionTopic,
  questionVersion,
  topic,
} from "@sibol-cse/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { examLevel, questionInput } from "../learning-contracts";
import { providerTopicLabels, providerTopics } from "../study-catalog";
import { candidates, supportsLevel } from "./catalog";
import { createQuestionDraft } from "./content";
import { assertAdmin, fail, missing } from "./learning-shared";

export const bankInput = z
  .object({
    manifestHash: z.string().regex(/^[a-f0-9]{64}$/),
    permissionHash: z.string().regex(/^[a-f0-9]{64}$/),
    mode: z.enum(["api_sample", "export", "feed"]).default("api_sample"),
    expectedIds: z
      .record(z.string(), z.array(z.string().min(1).max(1000)).max(100000))
      .nullable()
      .default(null),
    report: z.record(z.string(), z.unknown()),
  })
  .strict();
const snapshotInput = z
  .object({
    sourceKey: z.string().regex(/^[a-f0-9]{48}$/),
    providerQuestionId: z.string().min(1).max(1000),
    category: z.string(),
    subcategory: z.string(),
    levels: z.array(examLevel).min(1).max(2),
    topicId: z.string().nullable(),
    raw: z.record(z.string(), z.unknown()),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    native: questionInput.nullable(),
    heldReasons: z.array(z.string().min(1).max(1000)).max(20),
  })
  .strict();
export type ProviderSnapshotInput = z.infer<typeof snapshotInput>;
export async function openProviderBank(
  db: Database,
  actorId: string,
  raw: z.input<typeof bankInput>,
) {
  const input = bankInput.parse(raw);
  await assertAdmin(db, actorId);
  const [created] = await db
    .insert(providerBank)
    .values({ provider: "topnotcher", ...input, createdBy: actorId, coverageVerified: false })
    .onConflictDoNothing()
    .returning();
  const [existing] = created
    ? [created]
    : await db.select().from(providerBank).where(eq(providerBank.manifestHash, input.manifestHash));
  if (!existing || existing.permissionHash !== input.permissionHash)
    fail("Snapshot manifest permission does not match its existing record.");
  return { id: existing.id };
}
export async function importProviderSnapshots(
  db: Database,
  actorId: string,
  bankId: string,
  raw: ProviderSnapshotInput[],
) {
  const rows = z.array(snapshotInput).min(1).max(100).parse(raw);
  if (Buffer.byteLength(JSON.stringify(rows)) > 512 * 1024)
    fail("Snapshot batches are limited to 512 KiB.");
  return db.transaction(async (tx) => {
    await assertAdmin(tx, actorId);
    const [bank] = await tx
      .select({ id: providerBank.id })
      .from(providerBank)
      .where(eq(providerBank.id, bankId))
      .for("update");
    if (!bank) return missing();
    let inserted = 0,
      existing = 0,
      drafts = 0;
    for (const row of rows) {
      const source = providerTopics.find(
        (t) => t.category === row.category && t.subcategory === row.subcategory,
      );
      if (
        !source ||
        row.levels.length !== source.levels.length ||
        !row.levels.every((l) => (source.levels as readonly string[]).includes(l)) ||
        row.raw.id !== row.providerQuestionId
      )
        fail("Snapshot category, source ID or track scope is invalid.");
      const [seen] = await tx
        .select()
        .from(providerSnapshot)
        .where(
          and(
            eq(providerSnapshot.bankId, bankId),
            eq(providerSnapshot.sourceKey, row.sourceKey),
            eq(providerSnapshot.category, row.category),
            eq(providerSnapshot.subcategory, row.subcategory),
          ),
        );
      if (seen) {
        if (seen.fingerprint !== row.fingerprint)
          fail("A snapshot key changed within the same manifest.");
        existing++;
        continue;
      }
      let questionId: string | null = null;
      if (row.native) {
        const input = row.native;
        if (
          input.provider?.questionId !== row.providerQuestionId ||
          input.provider.category !== row.category ||
          input.provider.subcategory !== row.subcategory
        )
          fail("Native provenance must match its source snapshot.");
        const [stable] = await tx
          .select()
          .from(question)
          .where(eq(question.externalId, input.externalId));
        const [same] = stable
          ? await tx
              .select({ id: questionVersion.id })
              .from(questionVersion)
              .where(
                and(
                  eq(questionVersion.questionId, stable.id),
                  eq(questionVersion.importHash, row.fingerprint),
                ),
              )
          : [];
        if (same && stable) questionId = stable.id;
        else {
          const draft = await createQuestionDraft(tx, actorId, input, stable?.id, row.fingerprint);
          questionId = draft.questionId;
          drafts++;
        }
        if (questionId) {
          const [latest] = await tx
            .select({ id: questionVersion.id })
            .from(questionVersion)
            .where(eq(questionVersion.questionId, questionId))
            .orderBy(desc(questionVersion.version))
            .limit(1);
          if (latest && row.topicId)
            await tx
              .insert(questionTopic)
              .values({ questionVersionId: latest.id, topicId: row.topicId })
              .onConflictDoNothing();
        }
      }
      const { native: _native, ...snapshot } = row;
      await tx.insert(providerSnapshot).values({ ...snapshot, bankId, questionId });
      inserted++;
    }
    await tx
      .insert(auditEvent)
      .values({ actorId, action: "provider.snapshots.imported", targetId: bankId });
    return { inserted, existing, drafts };
  });
}
export async function finalizeProviderBank(
  db: Database,
  actorId: string,
  bankId: string,
  retireLegacy = false,
) {
  return db.transaction(async (tx) => {
    await assertAdmin(tx, actorId);
    const [bank] = await tx
      .select()
      .from(providerBank)
      .where(eq(providerBank.id, bankId))
      .for("update");
    if (!bank) return missing();
    const rows = await tx
      .select({
        sourceId: providerSnapshot.providerQuestionId,
        category: providerSnapshot.category,
        subcategory: providerSnapshot.subcategory,
        questionId: providerSnapshot.questionId,
        heldReasons: providerSnapshot.heldReasons,
      })
      .from(providerSnapshot)
      .where(eq(providerSnapshot.bankId, bankId));
    const topics = providerTopics.map((t) => {
      const observed = rows.filter(
        (r) => r.category === t.category && r.subcategory === t.subcategory,
      );
      const expected = bank.expectedIds?.[`${t.category}/${t.subcategory}`] ?? null;
      const actualIds = new Set(observed.map((r) => r.sourceId));
      const expectedIds = expected ? new Set(expected) : null;
      const missingIds = expected?.filter((id) => !actualIds.has(id)) ?? [];
      const unexpectedIds = expectedIds ? [...actualIds].filter((id) => !expectedIds.has(id)) : [];
      return {
        category: t.category,
        subcategory: t.subcategory,
        label: providerTopicLabels[t.subcategory],
        levels: [...t.levels],
        observed: actualIds.size,
        expected: expectedIds?.size ?? null,
        nativeQuestions: new Set(observed.map((r) => r.questionId).filter(Boolean)).size,
        held: observed.filter((r) => r.heldReasons.length > 0).length,
        missingIds,
        unexpectedIds,
      };
    });
    const verified =
      bank.mode !== "api_sample" &&
      !!bank.expectedIds &&
      topics.every(
        (t) => t.expected !== null && t.missingIds.length === 0 && t.unexpectedIds.length === 0,
      );
    let retired = 0;
    if (retireLegacy) {
      const legacy = await tx
        .select({ id: questionVersion.id, status: questionVersion.status })
        .from(questionVersion)
        .innerJoin(question, eq(question.id, questionVersion.questionId))
        .where(
          sql`${question.externalId} like 'topnotcher-professional-%' or ${question.externalId} like 'topnotcher-subprofessional-%'`,
        )
        .for("update");
      if (legacy.some((v) => v.status === "published" || v.status === "quarantined"))
        fail(
          "Legacy provider versions are published or disputed; reconcile their learner history before consolidation.",
        );
      const active = legacy.filter((v) => v.status === "draft" || v.status === "reviewed");
      const [used] = active.length
        ? await tx
            .select({ id: attemptItem.id })
            .from(attemptItem)
            .where(
              inArray(
                attemptItem.questionVersionId,
                active.map((v) => v.id),
              ),
            )
            .limit(1)
        : [];
      if (used)
        fail(
          "Legacy provider versions have pinned attempts; preserve and reconcile them explicitly.",
        );
      if (active.length)
        await tx
          .update(questionVersion)
          .set({ status: "retired" })
          .where(
            inArray(
              questionVersion.id,
              active.map((v) => v.id),
            ),
          );
      retired = active.length;
    }
    await tx
      .update(providerBank)
      .set({
        report: {
          ...bank.report,
          topics,
          observedQuestions: rows.length,
          nativeQuestions: new Set(rows.map((r) => r.questionId).filter(Boolean)).size,
          retiredLegacyDrafts: retired,
          finalizedAt: new Date().toISOString(),
        },
        coverageVerified: verified,
      })
      .where(eq(providerBank.id, bankId));
    await tx
      .insert(auditEvent)
      .values({ actorId, action: "provider.bank.reconciled", targetId: bankId });
    return {
      observed: rows.length,
      nativeQuestions: new Set(rows.map((r) => r.questionId).filter(Boolean)).size,
      coverageVerified: verified,
      retiredLegacyDrafts: retired,
    };
  });
}
export async function providerCoverage(
  db: Database,
  actorId: string,
  level: "professional" | "subprofessional",
) {
  await assertAdmin(db, actorId);
  const [bank] = await db
    .select({
      id: providerBank.id,
      mode: providerBank.mode,
      report: providerBank.report,
      coverageVerified: providerBank.coverageVerified,
      createdAt: providerBank.createdAt,
    })
    .from(providerBank)
    .where(eq(providerBank.provider, "topnotcher"))
    .orderBy(desc(providerBank.createdAt))
    .limit(1);
  const rows = bank
    ? await db
        .select({
          category: providerSnapshot.category,
          subcategory: providerSnapshot.subcategory,
          questionId: providerSnapshot.questionId,
          heldReasons: providerSnapshot.heldReasons,
          topicId: providerSnapshot.topicId,
        })
        .from(providerSnapshot)
        .where(
          and(
            eq(providerSnapshot.bankId, bank.id),
            sql`${level} = any(${providerSnapshot.levels})`,
          ),
        )
    : [];
  const versions = await db
    .select({ questionId: questionVersion.questionId, status: questionVersion.status })
    .from(questionVersion)
    .where(
      and(
        supportsLevel(level),
        inArray(questionVersion.status, ["draft", "reviewed", "published"]),
      ),
    )
    .orderBy(desc(questionVersion.version));
  const current = new Map<string, string>();
  for (const v of versions) if (!current.has(v.questionId)) current.set(v.questionId, v.status);
  const eligible = new Set((await candidates(db, level)).map((q) => q.questionId));
  return {
    level,
    bank: bank
      ? {
          id: bank.id,
          mode: bank.mode,
          createdAt: bank.createdAt,
          coverageVerified: bank.coverageVerified,
          finalized: typeof bank.report.finalizedAt === "string",
        }
      : null,
    topics: providerTopics
      .filter((t) => (t.levels as readonly string[]).includes(level))
      .map((t) => {
        const group = rows.filter(
          (r) => r.category === t.category && r.subcategory === t.subcategory,
        );
        const ids = [...new Set(group.map((r) => r.questionId).filter((id): id is string => !!id))];
        const expectedMap = Array.isArray(bank?.report.topics)
          ? (bank.report.topics as { subcategory?: string; expected?: number | null }[])
          : [];
        return {
          category: t.category,
          subcategory: t.subcategory,
          label: providerTopicLabels[t.subcategory] ?? t.subcategory,
          collected: group.length,
          expected: expectedMap.find((e) => e.subcategory === t.subcategory)?.expected ?? null,
          published: ids.filter((id) => eligible.has(id)).length,
          drafts: ids.filter((id) => ["draft", "reviewed"].includes(current.get(id) ?? "")).length,
          held: group.filter((r) => r.heldReasons.length > 0).length,
          mapped: group.filter((r) => !!r.topicId).length,
        };
      }),
  };
}
export async function providerSources(
  db: Database,
  actorId: string,
  bankId: string,
  subcategory: string,
  page: number,
) {
  await assertAdmin(db, actorId);
  const rows = await db
    .select({
      key: providerSnapshot.sourceKey,
      providerId: providerSnapshot.providerQuestionId,
      prompt: sql<string>`left(${providerSnapshot.raw}->>'text', 300)`,
      topicId: providerSnapshot.topicId,
      topicTitle: topic.title,
      questionId: providerSnapshot.questionId,
      heldReasons: providerSnapshot.heldReasons,
    })
    .from(providerSnapshot)
    .leftJoin(topic, eq(topic.id, providerSnapshot.topicId))
    .where(and(eq(providerSnapshot.bankId, bankId), eq(providerSnapshot.subcategory, subcategory)))
    .orderBy(providerSnapshot.sourceKey)
    .limit(21)
    .offset(page * 20);
  const items = [];
  for (const row of rows.slice(0, 20)) {
    const [native] = row.questionId
      ? await db
          .select({ externalId: question.externalId })
          .from(question)
          .where(eq(question.id, row.questionId))
      : [];
    items.push({ ...row, externalId: native?.externalId ?? null });
  }
  return { items, hasMore: rows.length > 20, page };
}

export async function providerSourceRecord(
  db: Database,
  actorId: string,
  bankId: string,
  sourceKey: string,
  subcategory: string,
) {
  await assertAdmin(db, actorId);
  const [record] = await db
    .select()
    .from(providerSnapshot)
    .where(
      and(
        eq(providerSnapshot.bankId, bankId),
        eq(providerSnapshot.sourceKey, sourceKey),
        eq(providerSnapshot.subcategory, subcategory),
      ),
    );
  const [bank] = await db
    .select({ report: providerBank.report })
    .from(providerBank)
    .where(eq(providerBank.id, bankId));
  if (!record || !bank) return missing();
  const assets =
    bank.report.mediaMap && typeof bank.report.mediaMap === "object"
      ? (bank.report.mediaMap as Record<
          string,
          { src?: string; width?: number; height?: number; archivalOnly?: boolean }
        >)
      : {};
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const media = (value: unknown) => {
    const asset = assets[text(value)];
    if (
      !asset?.src ||
      !/^\/api\/content-media\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(asset.src) ||
      asset.archivalOnly
    )
      return null;
    return {
      src: asset.src,
      alt: "Preserved source image awaiting an editorial description.",
      descriptionReviewed: false,
      width: asset.width,
      height: asset.height,
    };
  };
  const raw = record.raw;
  const list = (value: unknown) =>
    Array.isArray(value)
      ? value.filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
      : [];
  return {
    sourceKey,
    category: record.category,
    subcategory: record.subcategory,
    topicId: record.topicId,
    heldReasons: record.heldReasons,
    kind: text(raw.type),
    prompt: text(raw.text),
    instruction: text(raw.instruction),
    passage: text(raw.passage),
    highlight: text(raw.highlight),
    media: media(raw.image),
    choices: list(raw.choices).map((c) => ({
      id: text(c.id),
      text: text(c.text),
      media: media(c.image),
    })),
    orderItems: list(raw.items).map((i) => ({ id: text(i.id), text: text(i.text) })),
    providerKey: JSON.stringify(raw.correct ?? null),
    explanation: text(raw.explanation),
  };
}
