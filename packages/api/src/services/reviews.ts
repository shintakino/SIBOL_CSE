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
import type { QuestionMedia, StudyFilter } from "../learning-contracts";
import { pinSelected, reconcileExpired } from "./attempts";
import { activeProfile, supportsLevel } from "./catalog";
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
import { resolveStudyFilter, studyFilterWhere } from "./study-catalog";
import { lockStudyOwner, seenQuestions } from "./study-session";
export async function dueRows(db: Store, userId: string, filters: Partial<StudyFilter> = {}) {
  const prefs = await preferences(db, userId);
  const filter = await resolveStudyFilter(db, prefs.level, filters);
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
      providerSubcategory: sql<string | null>`${questionVersion.provider}->>'subcategory'`,
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
        supportsLevel(prefs.level),
        studyFilterWhere(filter),
        sql`${reviewState.dueAt} <= clock_timestamp()`,
      ),
    )
    .orderBy(reviewState.dueAt, reviewState.id)
    .limit(1000);
  return rows.filter((r) => !blocked.has(r.questionId));
}
export async function reviewNotebook(
  db: Database,
  userId: string,
  page: number,
  filters: Partial<StudyFilter> = {},
) {
  await reconcileExpired(db, userId);
  return db.transaction(
    async (tx) => {
      await lockPersonalOwner(tx, userId);
      const prefs = await preferences(tx, userId);
      const filter = await resolveStudyFilter(tx, prefs.level, filters);
      const blocked = await strictQuestions(tx, userId);
      const due = await dueRows(tx, userId, filter);
      const rows = await tx
        .select({
          event: reviewEvent,
          prompt: questionVersion.prompt,
          explanation: questionVersion.explanation,
          answerChoiceId: questionVersion.answerChoiceId,
          erratum: questionVersion.erratum,
          topicId: topic.id,
          topic: topic.title,
          area: topic.area,
          kind: questionVersion.kind,
          orderItems: questionVersion.orderItems,
          answerOrder: questionVersion.answerOrder,
          passage: questionVersion.passage,
          instruction: questionVersion.instruction,
          highlight: questionVersion.highlight,
          media: questionVersion.media,
        })
        .from(reviewEvent)
        .innerJoin(questionVersion, eq(questionVersion.id, reviewEvent.versionId))
        .innerJoin(topic, eq(topic.id, questionVersion.primaryTopicId))
        .where(
          and(eq(reviewEvent.userId, userId), supportsLevel(prefs.level), studyFilterWhere(filter)),
        )
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
          area: r.area,
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
          area: r.area,
          kind: r.kind,
          passage: r.passage,
          instruction: r.instruction,
          highlight: r.highlight,
          media: r.media as QuestionMedia | null,
          prompt: r.prompt,
          explanation: r.explanation,
          erratum: r.erratum,
          outcome: r.event.outcome,
          studyDate: r.event.studyDate,
          fromStep: r.event.fromStep,
          toStep: r.event.toStep,
          selected:
            r.kind === "order"
              ? (r.event.selectedOrder
                  ?.map((id) => r.orderItems.find((i) => i.id === id)?.text ?? id)
                  .join(" → ") ?? "Unanswered")
              : (choices.find(
                  (c) =>
                    c.questionVersionId === r.event.versionId && c.id === r.event.selectedChoiceId,
                )?.text ?? "Unanswered"),
          selectedMedia:
            choices.find(
              (c) => c.questionVersionId === r.event.versionId && c.id === r.event.selectedChoiceId,
            )?.media ?? null,
          keyMedia:
            choices.find(
              (c) => c.questionVersionId === r.event.versionId && c.id === r.answerChoiceId,
            )?.media ?? null,
          key:
            r.kind === "order"
              ? (r.answerOrder
                  ?.map((id) => r.orderItems.find((i) => i.id === id)?.text ?? id)
                  .join(" → ") ?? null)
              : (choices.find(
                  (c) => c.questionVersionId === r.event.versionId && c.id === r.answerChoiceId,
                )?.text ?? null),
        })),
      };
    },
    { isolationLevel: "read committed" },
  );
}
export async function startReview(
  db: Database,
  userId: string,
  requestId: string,
  count: number,
  filters: Partial<StudyFilter> = {},
) {
  await reconcileExpired(db, userId);
  return db.transaction(async (tx) => {
    const existing = await lockStudyOwner(tx, userId, requestId, "review");
    if (existing) return { id: existing.id };
    const prefs = await preferences(tx, userId),
      profile = await activeProfile(tx, prefs.level);
    const rows = (await dueRows(tx, userId, filters)).slice(0, count);
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
