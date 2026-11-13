import { ORPCError } from "@orpc/server";
import type { Database } from "@sibol-cse/db";
import {
  bookmark,
  choice,
  lesson,
  lessonVersion,
  privateNote,
  questionVersion,
  topic,
} from "@sibol-cse/db/schema";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import type { z } from "zod";
import type { libraryQuery, Target } from "../library-contracts";
import { reconcileExpired } from "./attempts";
import { supportsLevel } from "./catalog";
import { missing, preferences, type Store, type Tx } from "./learning-shared";
import { lockPersonalOwner, readNote, writeBookmark, writeNote } from "./note-store";
import { assessmentActive } from "./progress";
export type LibraryQuery = z.infer<typeof libraryQuery>;
export async function allowLibrary(db: Store, userId: string) {
  if (await assessmentActive(db, userId))
    throw new ORPCError("FORBIDDEN", {
      message:
        "Finish your active diagnostic or strict mock before opening saved material, notes or search.",
    });
}
const pattern = (text: string) => `%${text.replace(/[\\%_]/g, "\\$&")}%`;
const permitted = (
  userId: string,
) => sql`(${questionVersion.status} in ('published','retired','quarantined') AND (
  EXISTS (SELECT 1 FROM attempt_item i JOIN attempt a ON a.id=i.attempt_id
    WHERE a.user_id=${userId} AND i.question_version_id=${questionVersion.id}
      AND ((a.mode in ('practice','review') AND i.committed_at IS NOT NULL)
        OR (a.status in ('submitted','expired') AND EXISTS (SELECT 1 FROM attempt_result r WHERE r.attempt_id=a.id))))
  OR EXISTS (SELECT 1 FROM review_event e WHERE e.user_id=${userId} AND e.version_id=${questionVersion.id})))`;
export type Preview = {
  kind: "lesson" | "question";
  id: string;
  versionId: string;
  title: string;
  topic: string;
  topicId: string;
  snippet: string;
  href: string;
  saved: boolean;
  status: string;
  erratum: string | null;
};
async function queryLessons(
  db: Store,
  userId: string,
  input: LibraryQuery,
  id?: string,
): Promise<Preview[]> {
  const prefs = await preferences(db, userId);
  const saved = sql<boolean>`exists(select 1 from bookmark b where b.user_id=${userId} and b.lesson_id=${lesson.id})`;
  const rows = await db
    .select({
      id: lesson.id,
      slug: lesson.slug,
      versionId: lessonVersion.id,
      title: lessonVersion.title,
      topic: topic.title,
      topicId: topic.id,
      snippet: sql<string>`left(coalesce(${lessonVersion.structure}->'concept'->0->>'text','A reviewed concept, worked example, common mistake and technique.'),240)`,
      saved,
      erratum: lessonVersion.erratum,
    })
    .from(lessonVersion)
    .innerJoin(lesson, eq(lesson.id, lessonVersion.lessonId))
    .innerJoin(topic, eq(topic.id, lessonVersion.topicId))
    .where(
      and(
        eq(lessonVersion.status, "published"),
        eq(topic.enabled, true),
        sql`${prefs.level}=any(${lessonVersion.levels})`,
        id ? eq(lesson.id, id) : undefined,
        input.topicId ? eq(topic.id, input.topicId) : undefined,
        input.savedOnly ? saved : undefined,
        input.query
          ? sql`(${lessonVersion.title} ilike ${pattern(input.query)} OR ${lessonVersion.body} ilike ${pattern(input.query)})`
          : undefined,
      ),
    )
    .orderBy(lessonVersion.title, lesson.id)
    .limit(21)
    .offset(input.page * 20);
  return rows.map((r) => ({ ...r, kind: "lesson", href: `/learn/${r.slug}`, status: "published" }));
}
async function queryQuestions(
  db: Store,
  userId: string,
  input: LibraryQuery,
  id?: string,
): Promise<Preview[]> {
  const prefs = await preferences(db, userId);
  const saved = sql<boolean>`exists(select 1 from bookmark b where b.user_id=${userId} and b.question_id=${questionVersion.questionId})`;
  const rows = await db
    .selectDistinctOn([questionVersion.questionId], {
      id: questionVersion.questionId,
      versionId: questionVersion.id,
      title: sql<string>`left(${questionVersion.prompt},160)`,
      topic: topic.title,
      topicId: topic.id,
      snippet: sql<string>`left(${questionVersion.explanation},240)`,
      saved,
      status: questionVersion.status,
      erratum: questionVersion.erratum,
    })
    .from(questionVersion)
    .innerJoin(topic, eq(topic.id, questionVersion.primaryTopicId))
    .where(
      and(
        permitted(userId),
        supportsLevel(prefs.level),
        eq(topic.enabled, true),
        id ? eq(questionVersion.questionId, id) : undefined,
        input.topicId ? eq(topic.id, input.topicId) : undefined,
        input.savedOnly ? saved : undefined,
        input.query
          ? sql`(${questionVersion.prompt} ilike ${pattern(input.query)} OR ${questionVersion.explanation} ilike ${pattern(input.query)} OR ${questionVersion.passage} ilike ${pattern(input.query)})`
          : undefined,
      ),
    )
    .orderBy(questionVersion.questionId, desc(questionVersion.version))
    .limit(21)
    .offset(input.page * 20);
  return rows.map((r) => ({ ...r, kind: "question", href: `/bookmarks/questions/${r.versionId}` }));
}
const emptyQuery: LibraryQuery = { query: "", kind: "all", savedOnly: false, page: 0 };
async function withLibrary<T>(db: Database, userId: string, read: (tx: Tx) => Promise<T>) {
  await reconcileExpired(db, userId);
  return db.transaction(async (tx) => {
    // Starting an assessment and deleting an account require an exclusive owner lock.
    // Hold the shared lock across the authorization check and all returned snippets.
    await lockPersonalOwner(tx, userId);
    await allowLibrary(tx, userId);
    return read(tx);
  });
}
export async function searchLibrary(db: Database, userId: string, input: LibraryQuery) {
  return withLibrary(db, userId, async (tx) => {
    const lessons = input.kind === "question" ? [] : await queryLessons(tx, userId, input);
    const questions = input.kind === "lesson" ? [] : await queryQuestions(tx, userId, input);
    return {
      lessons: lessons.slice(0, 20),
      questions: questions.slice(0, 20),
      hasMoreLessons: lessons.length > 20,
      hasMoreQuestions: questions.length > 20,
      page: input.page,
    };
  });
}
export async function targetPreview(db: Store, userId: string, target: Target) {
  return (
    (target.kind === "lesson"
      ? await queryLessons(db, userId, emptyQuery, target.id)
      : await queryQuestions(db, userId, emptyQuery, target.id))[0] ?? null
  );
}
export async function setBookmark(db: Database, userId: string, target: Target, saved: boolean) {
  return db.transaction(async (tx) => {
    await lockPersonalOwner(tx, userId);
    await allowLibrary(tx, userId);
    if (saved && !(await targetPreview(tx, userId, target))) return missing();
    return writeBookmark(tx, userId, target, saved);
  });
}
export async function listBookmarks(db: Database, userId: string, page: number) {
  return withLibrary(db, userId, async (tx) => {
    const rows = await tx
      .select()
      .from(bookmark)
      .where(eq(bookmark.userId, userId))
      .orderBy(desc(bookmark.createdAt), bookmark.id)
      .limit(21)
      .offset(page * 20);
    const items = [];
    for (const row of rows.slice(0, 20)) {
      const target: Target = row.lessonId
        ? { kind: "lesson", id: row.lessonId }
        : { kind: "question", id: row.questionId ?? "" };
      items.push({ bookmarkId: row.id, target, preview: await targetPreview(tx, userId, target) });
    }
    return { items, hasMore: rows.length > 20, page };
  });
}
export async function getPrivateNote(db: Database, userId: string, target: Target) {
  return withLibrary(db, userId, async (tx) => {
    const note = await readNote(tx, userId, target);
    const preview = await targetPreview(tx, userId, target);
    if (!preview && !note.id) return missing();
    return { ...note, target, preview };
  });
}
export async function savePrivateNote(
  db: Database,
  userId: string,
  target: Target,
  body: string | null,
  revision: number,
  mutationId: string,
) {
  return db.transaction(async (tx) => {
    await lockPersonalOwner(tx, userId);
    await allowLibrary(tx, userId);
    const old = await readNote(tx, userId, target);
    if (body && !old.id && !(await targetPreview(tx, userId, target))) return missing();
    if (!body && !old.id) return { revision: 0, deleted: true };
    return writeNote(tx, userId, target, body, revision, mutationId);
  });
}
export async function listPrivateNotes(db: Database, userId: string, query: string, page: number) {
  return withLibrary(db, userId, async (tx) => {
    const rows = await tx
      .select({
        id: privateNote.id,
        lessonId: privateNote.lessonId,
        questionId: privateNote.questionId,
        body: sql<string>`left(${privateNote.body},300)`,
        revision: privateNote.revision,
        updatedAt: privateNote.updatedAt,
      })
      .from(privateNote)
      .where(
        and(
          eq(privateNote.userId, userId),
          sql`${privateNote.deletedAt} is null`,
          query ? ilike(privateNote.body, pattern(query)) : undefined,
        ),
      )
      .orderBy(desc(privateNote.updatedAt), privateNote.id)
      .limit(21)
      .offset(page * 20);
    const items = [];
    for (const row of rows.slice(0, 20)) {
      const target: Target = row.lessonId
        ? { kind: "lesson", id: row.lessonId }
        : { kind: "question", id: row.questionId ?? "" };
      items.push({ ...row, target, preview: await targetPreview(tx, userId, target) });
    }
    return { items, hasMore: rows.length > 20, page };
  });
}
export async function getQuestionReview(db: Database, userId: string, versionId: string) {
  return withLibrary(db, userId, async (tx) => {
    const prefs = await preferences(tx, userId);
    const [v] = await tx
      .select()
      .from(questionVersion)
      .where(and(eq(questionVersion.id, versionId), supportsLevel(prefs.level), permitted(userId)));
    if (!v) return missing();
    const choices = await tx
      .select({ id: choice.id, text: choice.text, label: choice.label, media: choice.media })
      .from(choice)
      .where(eq(choice.questionVersionId, v.id));
    return {
      id: v.questionId,
      versionId: v.id,
      version: v.version,
      prompt: v.prompt,
      passage: v.passage,
      kind: v.kind,
      media: v.media as import("../learning-contracts").QuestionMedia | null,
      instruction: v.instruction,
      highlight: v.highlight,
      orderItems: v.orderItems,
      answerOrder: v.answerOrder,
      choices,
      answerChoiceId: v.answerChoiceId,
      explanation: v.explanation,
      distractorExplanations: v.distractorExplanations ?? {},
      status: v.status,
      erratum: v.erratum,
      language: v.language,
    };
  });
}
