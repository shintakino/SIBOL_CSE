import { ORPCError } from "@orpc/server";
import type { Database } from "@sibol-cse/db";
import {
  attempt,
  attemptAnswer,
  attemptItem,
  attemptResult,
  examProfileVersion,
  questionVersion,
  topic,
} from "@sibol-cse/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { reconcileExpired } from "./attempts";
import { consistency } from "./learning-policy";
import { preferences, type Store } from "./learning-shared";
export async function assessmentActive(db: Store, userId: string) {
  const [active] = await db
    .select({ id: attempt.id })
    .from(attempt)
    .where(
      and(
        eq(attempt.userId, userId),
        eq(attempt.status, "in_progress"),
        inArray(attempt.mode, ["strict_mock", "diagnostic"]),
      ),
    )
    .limit(1);
  return !!active;
}
export async function allowInsights(db: Store, userId: string) {
  if (await assessmentActive(db, userId))
    throw new ORPCError("FORBIDDEN", {
      message:
        "Finish your active diagnostic or strict mock before viewing learning analytics or rebuilding recommendations.",
    });
}
export async function evidence(db: Store, userId: string) {
  const prefs = await preferences(db, userId);
  const topics = await db
    .select({ id: topic.id, title: topic.title, area: topic.area })
    .from(topic)
    .where(and(eq(topic.enabled, true), sql`${prefs.level} = any(${topic.levels})`))
    .orderBy(topic.slug);
  const rows = await db
    .select({
      attemptId: attempt.id,
      mode: attempt.mode,
      setKind: attempt.setKind,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      questionId: questionVersion.questionId,
      topicId: questionVersion.primaryTopicId,
      firstExposure: attemptItem.firstExposure,
      answered: sql<boolean>`(${attemptAnswer.selectedChoiceId} is not null or cardinality(${attemptAnswer.selectedOrder}) > 0) is true`,
      correct: sql<boolean>`coalesce(case when ${questionVersion.kind} = 'order' then ${attemptAnswer.selectedOrder} = ${questionVersion.answerOrder} else ${attemptAnswer.selectedChoiceId} = ${questionVersion.answerChoiceId} end, false)`,
    })
    .from(attempt)
    .innerJoin(examProfileVersion, eq(examProfileVersion.id, attempt.profileVersionId))
    .innerJoin(attemptResult, eq(attemptResult.attemptId, attempt.id))
    .innerJoin(attemptItem, eq(attemptItem.attemptId, attempt.id))
    .innerJoin(questionVersion, eq(questionVersion.id, attemptItem.questionVersionId))
    .leftJoin(attemptAnswer, eq(attemptAnswer.attemptItemId, attemptItem.id))
    .where(and(eq(attempt.userId, userId), eq(examProfileVersion.level, prefs.level)))
    .orderBy(attempt.startedAt, attemptItem.position);
  const items = rows.filter((r) => r.mode !== "review");
  const stats = topics.map((t) => {
    const group = items.filter((r) => r.topicId === t.id),
      first = group.filter((r) => r.firstExposure && r.answered);
    return {
      ...t,
      presented: group.length,
      answered: group.filter((r) => r.answered).length,
      correct: group.filter((r) => r.correct).length,
      firstCount: new Set(first.map((r) => r.questionId)).size,
      firstCorrect: new Set(first.filter((r) => r.correct).map((r) => r.questionId)).size,
      unique: new Set(group.filter((r) => r.answered).map((r) => r.questionId)).size,
      uniquePresented: new Set(group.map((r) => r.questionId)).size,
      provisional: new Set(first.map((r) => r.questionId)).size < 10,
    };
  });
  return { prefs, rows, topics: stats };
}
export async function progressSummary(db: Database, userId: string) {
  await reconcileExpired(db, userId);
  await allowInsights(db, userId);
  const data = await evidence(db, userId);
  const history = await db
    .select({
      id: attempt.id,
      mode: attempt.mode,
      setKind: attempt.setKind,
      timeMultiplier: attempt.timeMultiplier,
      status: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      correct: attemptResult.correct,
      incorrect: attemptResult.incorrect,
      unanswered: attemptResult.unanswered,
      elapsedSeconds: attemptResult.elapsedSeconds,
    })
    .from(attempt)
    .innerJoin(attemptResult, eq(attemptResult.attemptId, attempt.id))
    .innerJoin(examProfileVersion, eq(examProfileVersion.id, attempt.profileVersionId))
    .where(and(eq(attempt.userId, userId), eq(examProfileVersion.level, data.prefs.level)))
    .orderBy(desc(attempt.startedAt), desc(attempt.id));
  const items = data.rows.filter((r) => r.mode !== "review"),
    first = items.filter((r) => r.firstExposure),
    repeats = items.filter((r) => !r.firstExposure);
  const summarize = (rows: typeof items) => ({
    presented: rows.length,
    attempted: rows.filter((r) => r.answered).length,
    correct: rows.filter((r) => r.correct).length,
    accuracy: rows.length ? rows.filter((r) => r.correct).length / rows.length : null,
  });
  const short = history.filter((a) => a.mode === "strict_mock" && a.setKind === "short");
  const covered = data.topics.every(
    (t) =>
      new Set(
        items
          .filter((r) => r.topicId === t.id && r.answered && r.setKind !== "full")
          .map((r) => r.questionId),
      ).size >= 5,
  );
  const indicator = consistency(
    short.map((a) => ({
      accuracy: a.correct / (a.correct + a.incorrect + a.unanswered),
      questions: items.filter((r) => r.attemptId === a.id).map((r) => r.questionId),
    })),
    covered,
  );
  const recentPractice = history.filter((a) => a.mode === "practice").slice(0, 5);
  const recentTotal = recentPractice.reduce(
    (n, a) => n + a.correct + a.incorrect + a.unanswered,
    0,
  );
  return {
    level: data.prefs.level,
    total: summarize(items),
    firstExposure: summarize(first),
    repeated: summarize(repeats),
    uniquePresented: new Set(items.map((r) => r.questionId)).size,
    uniqueAnswered: new Set(items.filter((r) => r.answered).map((r) => r.questionId)).size,
    topics: data.topics,
    indicator,
    uncoveredTopics: data.topics
      .filter(
        (t) =>
          new Set(
            items
              .filter((r) => r.topicId === t.id && r.answered && r.setKind !== "full")
              .map((r) => r.questionId),
          ).size < 5,
      )
      .map((t) => t.title),
    recentPracticeAccuracy: recentTotal
      ? recentPractice.reduce((n, a) => n + a.correct, 0) / recentTotal
      : null,
    history: history.slice(0, 30),
    fullMockTrend: history.filter((a) => a.setKind === "full").slice(0, 20),
    timedSetTrend: short.slice(0, 20),
    extendedTrend: history.filter((a) => a.mode === "timed_practice").slice(0, 20),
    reviewSessions: history.filter((a) => a.mode === "review").length,
  };
}
