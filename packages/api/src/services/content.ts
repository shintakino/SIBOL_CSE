import { createHash } from "node:crypto";
import { ORPCError } from "@orpc/server";
import type { Database } from "@sibol-cse/db";
import {
  auditEvent,
  choice,
  contentSource,
  importBatch,
  lesson,
  lessonVersion,
  question,
  questionIssue,
  questionVersion,
  reviewState,
  topic,
} from "@sibol-cse/db/schema";
import { and, count, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import {
  type LessonInput,
  lessonInput,
  type QuestionInput,
  questionInput,
  type SourceInput,
} from "../learning-contracts";
import {
  assertAdmin,
  assertFeedbackAllowed,
  fail,
  missing,
  type Store,
  type Tx,
} from "./learning-shared";

export async function topicList(db: Store) {
  return db.select().from(topic).orderBy(topic.slug);
}
async function validateTopic(db: Store, topicId: string, levels: string[]) {
  const [t] = await db.select().from(topic).where(eq(topic.id, topicId)).for("share");
  if (
    !t?.enabled ||
    !levels.every((l) => t.levels.includes(l as "professional" | "subprofessional"))
  )
    fail("The topic must be enabled and support the selected exam level.");
}
async function insertSource(tx: Tx, source: SourceInput, actorId: string) {
  const [row] = await tx
    .insert(contentSource)
    .values({
      title: source.title,
      url: source.url,
      rights: JSON.stringify(source),
      verifiedAt: new Date(),
      reviewerId: actorId,
    })
    .returning();
  if (!row) throw new Error("Source insert failed");
  return row.id;
}
export async function createQuestionDraft(
  tx: Tx,
  actorId: string,
  input: QuestionInput,
  correctionId?: string,
) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`question:${input.externalId}`}))`);
  await validateTopic(tx, input.topicId, [input.level]);
  const [old] = await tx
    .select()
    .from(question)
    .where(eq(question.externalId, input.externalId))
    .for("update");
  if (old && old.id !== correctionId)
    throw new ORPCError("CONFLICT", {
      message: "External ID already exists. Create a correction from its existing record.",
    });
  let stableId = old?.id;
  if (!stableId) {
    const [q] = await tx.insert(question).values({ externalId: input.externalId }).returning();
    if (!q) throw new Error("Question insert failed");
    stableId = q.id;
  }
  const [last] = await tx
    .select({ version: questionVersion.version })
    .from(questionVersion)
    .where(eq(questionVersion.questionId, stableId))
    .orderBy(desc(questionVersion.version))
    .limit(1);
  const sourceId = await insertSource(tx, input.source, actorId);
  const [version] = await tx
    .insert(questionVersion)
    .values({
      questionId: stableId,
      version: (last?.version ?? 0) + 1,
      level: input.level,
      language: input.language,
      difficulty: input.difficulty,
      prompt: input.prompt,
      passage: input.passage,
      media: input.media,
      distractorExplanations: input.distractorExplanations,
      answerChoiceId: input.answerChoiceId,
      explanation: input.explanation,
      primaryTopicId: input.topicId,
      sourceId,
    })
    .returning();
  if (!version) throw new Error("Version insert failed");
  await tx
    .insert(choice)
    .values(input.choices.map((c) => ({ ...c, questionVersionId: version.id })));
  await tx
    .insert(auditEvent)
    .values({ actorId, action: "question.draft.created", targetId: version.id });
  return { id: version.id, questionId: stableId, version: version.version };
}
export async function saveQuestionDraft(
  db: Database,
  actorId: string,
  raw: QuestionInput,
  correctionId?: string,
) {
  const input = questionInput.parse(raw);
  return db.transaction(async (tx) => {
    await assertAdmin(tx, actorId);
    if (correctionId) await assertFeedbackAllowed(tx, actorId, [correctionId]);
    return createQuestionDraft(tx, actorId, input, correctionId);
  });
}
export async function saveLessonDraft(db: Database, actorId: string, raw: LessonInput) {
  const input = lessonInput.parse(raw);
  return db.transaction(async (tx) => {
    await assertAdmin(tx, actorId);
    await validateTopic(tx, input.topicId, input.levels);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`lesson:${input.slug}`}))`);
    let [stable] = await tx.select().from(lesson).where(eq(lesson.slug, input.slug)).for("update");
    if (!stable) [stable] = await tx.insert(lesson).values({ slug: input.slug }).returning();
    if (!stable) throw new Error("Lesson insert failed");
    const [last] = await tx
      .select({ version: lessonVersion.version })
      .from(lessonVersion)
      .where(eq(lessonVersion.lessonId, stable.id))
      .orderBy(desc(lessonVersion.version))
      .limit(1);
    const sourceId = await insertSource(tx, input.source, actorId);
    const [version] = await tx
      .insert(lessonVersion)
      .values({
        lessonId: stable.id,
        version: (last?.version ?? 0) + 1,
        title: input.title,
        body: JSON.stringify(input.structure),
        structure: input.structure,
        levels: input.levels,
        topicId: input.topicId,
        sourceId,
      })
      .returning();
    if (!version) throw new Error("Lesson version insert failed");
    await tx
      .insert(auditEvent)
      .values({ actorId, action: "lesson.draft.created", targetId: version.id });
    return { id: version.id, version: version.version };
  });
}
export async function reviewContent(
  db: Database,
  actorId: string,
  kind: "question" | "lesson",
  versionId: string,
  checklist: Record<string, boolean>,
) {
  return db.transaction(async (tx) => {
    await assertAdmin(tx, actorId);
    const table = kind === "question" ? questionVersion : lessonVersion;
    const [v] = await tx.select().from(table).where(eq(table.id, versionId)).for("update");
    if (!v) return missing();
    if (v.status !== "draft") fail("Only a draft can be reviewed.");
    if (kind === "question")
      await assertFeedbackAllowed(tx, actorId, [
        (v as typeof questionVersion.$inferSelect).questionId,
      ]);
    await tx
      .update(table)
      .set({
        status: "reviewed",
        reviewedAt: new Date(),
        reviewedBy: actorId,
        reviewChecklist: checklist,
      })
      .where(eq(table.id, versionId));
    await tx
      .insert(auditEvent)
      .values({ actorId, action: `${kind}.reviewed`, targetId: versionId });
    return { reviewed: true };
  });
}
export async function publishContent(
  db: Database,
  actorId: string,
  kind: "question" | "lesson",
  versionId: string,
  erratum: string | null,
) {
  return db.transaction(async (tx) => {
    await assertAdmin(tx, actorId);
    await tx.execute(sql`select pg_advisory_xact_lock(712031)`);
    if (kind === "question") {
      const [v] = await tx.select().from(questionVersion).where(eq(questionVersion.id, versionId));
      if (!v) return missing();
      const [stable] = await tx
        .select()
        .from(question)
        .where(eq(question.id, v.questionId))
        .for("update");
      if (!stable) return missing();
      const [fresh] = await tx
        .select()
        .from(questionVersion)
        .where(eq(questionVersion.id, versionId))
        .for("update");
      if (fresh?.status !== "reviewed")
        fail("Review the draft and its checklist before publishing.");
      await assertFeedbackAllowed(tx, actorId, [stable.id]);
      await validateTopic(tx, v.primaryTopicId, [v.level]);
      const history = await tx
        .select()
        .from(questionVersion)
        .where(
          and(
            eq(questionVersion.questionId, stable.id),
            inArray(questionVersion.status, ["published", "retired", "quarantined"]),
          ),
        );
      if (history.some((old) => old.version >= v.version))
        fail("Publish a newer version instead of restoring an older one.");
      if (history.length && !erratum)
        fail("Explain the correction so historical attempts can display an erratum.");
      for (const old of history)
        await tx
          .update(questionVersion)
          .set({
            status: old.status === "published" ? "retired" : old.status,
            erratum: erratum ?? old.erratum,
          })
          .where(eq(questionVersion.id, old.id));
      await tx
        .update(questionVersion)
        .set({ status: "published", publishedAt: new Date() })
        .where(eq(questionVersion.id, versionId));
      await tx.update(question).set({ blocked: false }).where(eq(question.id, stable.id));
      await tx
        .update(reviewState)
        .set({ lastVersionId: versionId })
        .where(eq(reviewState.questionId, stable.id));
    } else {
      const [v] = await tx.select().from(lessonVersion).where(eq(lessonVersion.id, versionId));
      if (!v) return missing();
      await tx.select().from(lesson).where(eq(lesson.id, v.lessonId)).for("update");
      const [fresh] = await tx
        .select()
        .from(lessonVersion)
        .where(eq(lessonVersion.id, versionId))
        .for("update");
      if (fresh?.status !== "reviewed") fail("Review the draft before publishing.");
      await validateTopic(tx, v.topicId, v.levels);
      const history = await tx
        .select()
        .from(lessonVersion)
        .where(
          and(
            eq(lessonVersion.lessonId, v.lessonId),
            inArray(lessonVersion.status, ["published", "retired", "quarantined"]),
          ),
        );
      if (history.some((old) => old.version >= v.version)) fail("Publish a newer version.");
      if (history.length && !erratum) fail("Provide a correction notice for earlier readers.");
      for (const old of history)
        await tx
          .update(lessonVersion)
          .set({
            status: old.status === "published" ? "retired" : old.status,
            erratum: erratum ?? old.erratum,
          })
          .where(eq(lessonVersion.id, old.id));
      await tx
        .update(lessonVersion)
        .set({ status: "published", publishedAt: new Date() })
        .where(eq(lessonVersion.id, versionId));
    }
    await tx
      .insert(auditEvent)
      .values({ actorId, action: `${kind}.published`, targetId: versionId });
    return { published: true };
  });
}
export async function retireContent(
  db: Database,
  actorId: string,
  kind: "question" | "lesson",
  versionId: string,
  reason: string,
) {
  return db.transaction(async (tx) => {
    await assertAdmin(tx, actorId);
    await tx.execute(sql`select pg_advisory_xact_lock(712031)`);
    const table = kind === "question" ? questionVersion : lessonVersion;
    const [v] = await tx.select().from(table).where(eq(table.id, versionId)).for("update");
    if (!v) return missing();
    if (v.status !== "published") fail("Only published content can be retired.");
    await tx
      .update(table)
      .set({ status: "retired", erratum: reason })
      .where(eq(table.id, versionId));
    if (kind === "question")
      await tx
        .delete(reviewState)
        .where(eq(reviewState.questionId, (v as typeof questionVersion.$inferSelect).questionId));
    await tx.insert(auditEvent).values({ actorId, action: `${kind}.retired`, targetId: versionId });
    return { retired: true };
  });
}
export async function adminContent(db: Database, actorId: string, query = "", page = 0) {
  await assertAdmin(db, actorId);
  const pattern = `%${query}%`;
  const questionFilter = query
    ? or(ilike(question.externalId, pattern), ilike(questionVersion.prompt, pattern))
    : undefined;
  const lessonFilter = query
    ? or(ilike(lesson.slug, pattern), ilike(lessonVersion.title, pattern))
    : undefined;
  const [questionTotal] = await db
    .select({ count: count() })
    .from(questionVersion)
    .innerJoin(question, eq(question.id, questionVersion.questionId))
    .where(questionFilter);
  const [lessonTotal] = await db
    .select({ count: count() })
    .from(lessonVersion)
    .innerJoin(lesson, eq(lesson.id, lessonVersion.lessonId))
    .where(lessonFilter);
  const questions = await db
    .select({
      id: questionVersion.id,
      stableId: question.id,
      externalId: question.externalId,
      version: questionVersion.version,
      status: questionVersion.status,
      prompt: questionVersion.prompt,
      topicId: questionVersion.primaryTopicId,
      level: questionVersion.level,
    })
    .from(questionVersion)
    .innerJoin(question, eq(question.id, questionVersion.questionId))
    .where(questionFilter)
    .orderBy(desc(questionVersion.version), question.externalId)
    .limit(100)
    .offset(page * 100);
  const lessons = await db
    .select({
      id: lessonVersion.id,
      slug: lesson.slug,
      title: lessonVersion.title,
      version: lessonVersion.version,
      status: lessonVersion.status,
    })
    .from(lessonVersion)
    .innerJoin(lesson, eq(lesson.id, lessonVersion.lessonId))
    .where(lessonFilter)
    .orderBy(lesson.slug, desc(lessonVersion.version))
    .limit(100)
    .offset(page * 100);
  return {
    questions,
    lessons,
    topics: await topicList(db),
    page,
    questionTotal: questionTotal?.count ?? 0,
    lessonTotal: lessonTotal?.count ?? 0,
    hasMore: Math.max(questionTotal?.count ?? 0, lessonTotal?.count ?? 0) > (page + 1) * 100,
  };
}
export async function questionDetails(db: Database, actorId: string, versionId: string) {
  await assertAdmin(db, actorId);
  const [v] = await db.select().from(questionVersion).where(eq(questionVersion.id, versionId));
  if (!v) return missing();
  await assertFeedbackAllowed(db, actorId, [v.questionId]);
  const [stable] = await db.select().from(question).where(eq(question.id, v.questionId));
  const [source] = await db.select().from(contentSource).where(eq(contentSource.id, v.sourceId));
  return {
    ...v,
    externalId: stable?.externalId,
    choices: await db
      .select({ id: choice.id, text: choice.text })
      .from(choice)
      .where(eq(choice.questionVersionId, v.id)),
    source,
  };
}

// RFC 4180 quoting, including escaped quotes, commas and newlines. No eval or executable fields.
export function parseCsv(text: string): Record<string, unknown>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (!quoted && cell.length) fail("Unexpected quote in CSV field.");
      else quoted = !quoted;
    } else if (!quoted && (ch === "," || ch === "\n" || ch === "\r")) {
      row.push(cell);
      cell = "";
      if (ch !== ",") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        if (row.some((x) => x.length)) rows.push(row);
        row = [];
      }
    } else cell += ch;
  }
  if (quoted) fail("Unclosed quoted CSV field.");
  row.push(cell);
  if (row.some((x) => x.length)) rows.push(row);
  const header = rows.shift();
  if (!header || new Set(header).size !== header.length) fail("CSV needs unique column headers.");
  return rows.map((cells) => {
    if (cells.length !== header.length)
      return { __rowError: "Column count does not match headers." };
    const obj: Record<string, unknown> = Object.create(null);
    try {
      header.forEach((h, i) => {
        const v = cells[i] ?? "";
        obj[h] = ["choices", "source", "media", "distractorExplanations"].includes(h)
          ? v
            ? JSON.parse(v)
            : null
          : v === "" && h === "passage"
            ? null
            : v;
      });
    } catch {
      return { __rowError: "Malformed JSON in a structured CSV field." };
    }
    return obj;
  });
}
export async function validateImport(
  db: Database,
  actorId: string,
  format: "json" | "csv",
  file: string,
) {
  await assertAdmin(db, actorId);
  if (Buffer.byteLength(file) > 512 * 1024) fail("Imports are limited to 512 KiB.");
  let rows: unknown;
  try {
    rows = format === "json" ? JSON.parse(file) : parseCsv(file);
  } catch {
    return {
      batchId: null,
      valid: false,
      errors: [{ row: 0, message: "Invalid JSON or CSV encoding." }],
      preview: [],
    };
  }
  if (!Array.isArray(rows) || !rows.length || rows.length > 100)
    fail("Import 1–100 question rows at a time.");
  const errors: { row: number; message: string }[] = [];
  const valid: QuestionInput[] = [];
  const ids = new Set<string>();
  for (const [i, row] of rows.entries()) {
    if (row && typeof row === "object" && "__rowError" in row) {
      errors.push({ row: i + 1, message: String(row.__rowError).slice(0, 200) });
      continue;
    }
    const result = questionInput.safeParse(row);
    if (!result.success) {
      errors.push({
        row: i + 1,
        message: result.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; "),
      });
      continue;
    }
    const input = result.data;
    if (ids.has(input.externalId)) {
      errors.push({ row: i + 1, message: "Duplicate external ID in this file." });
      continue;
    }
    ids.add(input.externalId);
    const [existing] = await db
      .select({ id: question.id })
      .from(question)
      .where(eq(question.externalId, input.externalId));
    if (existing) {
      errors.push({ row: i + 1, message: "External ID already exists." });
      continue;
    }
    try {
      await validateTopic(db, input.topicId, [input.level]);
      valid.push(input);
    } catch {
      errors.push({ row: i + 1, message: "Unsupported or disabled topic for this level." });
    }
  }
  const hash = createHash("sha256").update(file).digest("hex");
  const [batch] = await db
    .insert(importBatch)
    .values({
      fileHash: hash,
      operatorId: actorId,
      status: errors.length ? "invalid" : "validated",
      validationSummary: { errors, count: rows.length },
      rows: errors.length ? null : valid,
    })
    .onConflictDoNothing()
    .returning();
  const [stored] = batch
    ? [batch]
    : await db
        .select()
        .from(importBatch)
        .where(and(eq(importBatch.fileHash, hash), eq(importBatch.operatorId, actorId)));
  if (stored)
    await db
      .update(importBatch)
      .set({
        status: errors.length ? "invalid" : "validated",
        validationSummary: { errors, count: rows.length },
        rows: errors.length ? null : valid,
      })
      .where(and(eq(importBatch.id, stored.id), ne(importBatch.status, "committed")));
  return {
    batchId: stored?.id ?? null,
    valid: errors.length === 0,
    errors,
    preview: valid.map((r) => ({
      externalId: r.externalId,
      prompt: r.prompt,
      topicId: r.topicId,
      level: r.level,
    })),
  };
}
export async function commitImport(db: Database, actorId: string, batchId: string) {
  return db.transaction(async (tx) => {
    await assertAdmin(tx, actorId);
    const [batch] = await tx
      .select()
      .from(importBatch)
      .where(and(eq(importBatch.id, batchId), eq(importBatch.operatorId, actorId)))
      .for("update");
    if (!batch) return missing();
    if (batch.status === "committed") return { committed: true };
    if (batch.status !== "validated" || !Array.isArray(batch.rows))
      fail("Fix all validation errors before committing.");
    const parsedRows = batch.rows
      .map((row) => questionInput.parse(row))
      .sort((a, b) => a.externalId.localeCompare(b.externalId));
    for (const row of parsedRows) await createQuestionDraft(tx, actorId, row);
    await tx.update(importBatch).set({ status: "committed" }).where(eq(importBatch.id, batchId));
    await tx.insert(auditEvent).values({ actorId, action: "import.committed", targetId: batchId });
    return { committed: true };
  });
}
export async function resolveIssue(
  db: Database,
  actorId: string,
  id: string,
  resolution: string,
  quarantine: boolean,
) {
  return db.transaction(async (tx) => {
    await assertAdmin(tx, actorId);
    await tx.execute(sql`select pg_advisory_xact_lock(712031)`);
    const [issue] = await tx
      .select()
      .from(questionIssue)
      .where(eq(questionIssue.id, id))
      .for("update");
    if (!issue) return missing();
    const [v] = await tx
      .select()
      .from(questionVersion)
      .where(eq(questionVersion.id, issue.questionVersionId));
    if (!v) return missing();
    if (quarantine) {
      await tx.update(question).set({ blocked: true }).where(eq(question.id, v.questionId));
      await tx.delete(reviewState).where(eq(reviewState.questionId, v.questionId));
      await tx
        .update(questionVersion)
        .set({ status: "quarantined", erratum: resolution })
        .where(eq(questionVersion.id, v.id));
    }
    await tx
      .update(questionIssue)
      .set({ status: quarantine ? "quarantined" : "resolved", resolution })
      .where(eq(questionIssue.id, id));
    await tx.insert(auditEvent).values({
      actorId,
      action: quarantine ? "question.quarantined" : "issue.resolved",
      targetId: id,
    });
    return { resolved: true };
  });
}
