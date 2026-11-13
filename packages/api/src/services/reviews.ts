import type { Database } from "@sibol-cse/db";
import {
  choice,
  question,
  questionVersion,
  reviewEvent,
  reviewState,
  topic,
} from "@sibol-cse/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { pinSelected, reconcileExpired } from "./attempts";
import { activeProfile } from "./catalog";
import {
  assertFeedbackAllowed,
  fail,
  missing,
  preferences,
  type Store,
  strictQuestions,
} from "./learning-shared";
import { lockPersonalOwner } from "./note-store";
import { transition } from "./review-schedule";
import { lockStudyOwner, seenQuestions } from "./study-session";
export async function dueRows(db: Store, userId: string) {
  const prefs = await preferences(db, userId);
  const blocked = await strictQuestions(db, userId);
  const rows = await db
    .select({
      stateId: reviewState.id,
      questionId: question.id,
      id: questionVersion.id,
      topicId: topic.id,
      topic: topic.title,
      difficulty: questionVersion.difficulty,
      area: topic.area,
      dueAt: reviewState.dueAt,
      intervalStep: reviewState.intervalStep,
    })
    .from(reviewState)
    .innerJoin(question, eq(question.id, reviewState.questionId))
    .innerJoin(
      questionVersion,
      and(eq(questionVersion.questionId, question.id), eq(questionVersion.status, "published")),
    )
    .innerJoin(topic, eq(topic.id, questionVersion.primaryTopicId))
    .where(
      and(
        eq(reviewState.userId, userId),
        eq(question.blocked, false),
        eq(topic.enabled, true),
        eq(questionVersion.level, prefs.level),
        sql`${reviewState.dueAt} <= clock_timestamp()`,
      ),
    )
    .orderBy(reviewState.dueAt, reviewState.id)
    .limit(1000);
  return rows.filter((r) => !blocked.has(r.questionId));
}
export async function reviewNotebook(db: Database, userId: string, page: number) {
  await reconcileExpired(db, userId);
  return db.transaction(
    async (tx) => {
      await lockPersonalOwner(tx, userId);
      const prefs = await preferences(tx, userId);
      const blocked = await strictQuestions(tx, userId);
      const due = await dueRows(tx, userId);
      const rows = await tx
        .select({
          event: reviewEvent,
          prompt: questionVersion.prompt,
          explanation: questionVersion.explanation,
          answerChoiceId: questionVersion.answerChoiceId,
          erratum: questionVersion.erratum,
          topicId: topic.id,
          topic: topic.title,
        })
        .from(reviewEvent)
        .innerJoin(questionVersion, eq(questionVersion.id, reviewEvent.versionId))
        .innerJoin(topic, eq(topic.id, questionVersion.primaryTopicId))
        .where(and(eq(reviewEvent.userId, userId), eq(questionVersion.level, prefs.level)))
        .orderBy(desc(reviewEvent.createdAt), desc(reviewEvent.id))
        .limit(51)
        .offset(page * 50);
      const visible = rows.slice(0, 50).filter((r) => !blocked.has(r.event.questionId));
      const choices = visible.length
        ? await tx
            .select()
            .from(choice)
            .where(
              inArray(
                choice.questionVersionId,
                visible.map((r) => r.event.versionId ?? ""),
              ),
            )
        : [];
      return {
        dueCount: due.length,
        blockedCount: blocked.size,
        due: due.slice(0, 20).map((r) => ({
          id: r.stateId,
          topicId: r.topicId,
          topic: r.topic,
          dueAt: r.dueAt,
          intervalStep: r.intervalStep,
        })),
        hasMore: rows.length > 50,
        page,
        history: visible.map((r) => ({
          id: r.event.id,
          questionId: r.event.questionId,
          topicId: r.topicId,
          topic: r.topic,
          prompt: r.prompt,
          explanation: r.explanation,
          erratum: r.erratum,
          outcome: r.event.outcome,
          studyDate: r.event.studyDate,
          fromStep: r.event.fromStep,
          toStep: r.event.toStep,
          selected:
            choices.find(
              (c) => c.questionVersionId === r.event.versionId && c.id === r.event.selectedChoiceId,
            )?.text ?? "Unanswered",
          key:
            choices.find(
              (c) => c.questionVersionId === r.event.versionId && c.id === r.answerChoiceId,
            )?.text ?? null,
        })),
      };
    },
    { isolationLevel: "read committed" },
  );
}
export async function startReview(db: Database, userId: string, requestId: string, count: number) {
  await reconcileExpired(db, userId);
  return db.transaction(async (tx) => {
    const existing = await lockStudyOwner(tx, userId, requestId, "review");
    if (existing) return { id: existing.id };
    const prefs = await preferences(tx, userId),
      profile = await activeProfile(tx, prefs.level);
    const rows = (await dueRows(tx, userId)).slice(0, count);
    if (!rows.length) fail("No eligible reviews are due. Return on the scheduled study date.");
    return pinSelected(tx, userId, rows, await seenQuestions(tx, userId), {
      mode: "review",
      profileVersionId: profile.id,
      creationKey: requestId,
    });
  });
}
export async function reviewTomorrow(
  db: Database,
  userId: string,
  questionId: string,
  requestId: string,
) {
  return db.transaction(async (tx) => {
    await lockPersonalOwner(tx, userId);
    await assertFeedbackAllowed(tx, userId, [questionId]);
    const [history] = await tx
      .select()
      .from(reviewEvent)
      .where(and(eq(reviewEvent.userId, userId), eq(reviewEvent.questionId, questionId)))
      .orderBy(desc(reviewEvent.createdAt))
      .limit(1);
    if (!history) return missing();
    await transition(tx, userId, questionId, `tomorrow:${userId}:${requestId}`, "tomorrow", {
      versionId: history.versionId,
      selectedChoiceId: null,
      attemptItemId: null,
    });
    const [scheduled] = await tx
      .select({ id: reviewState.id })
      .from(reviewState)
      .where(and(eq(reviewState.userId, userId), eq(reviewState.questionId, questionId)));
    return { scheduled: !!scheduled };
  });
}
