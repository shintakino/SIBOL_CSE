import { createHash } from "node:crypto";
import type { Database } from "@sibol-cse/db";
import {
  attempt,
  attemptAnswer,
  attemptItem,
  attemptResult,
  bookmark,
  examProfileVersion,
  questionVersion,
  userProfile,
} from "@sibol-cse/db/schema";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import type { ReviewerStartInput } from "../reviewer-contracts";
import { ownerAttempt, pinSelected, reconcileExpired, shuffled } from "./attempts";
import { activeProfile, candidates } from "./catalog";
import { studyDate } from "./learning-policy";
import { assertStudyWindow, fail, missing, preferences, type Store } from "./learning-shared";
import { lockPersonalOwner, writeBookmark } from "./note-store";
import { serverClock } from "./review-schedule";
import { matchesStudyFilter, resolveStudyFilter, studyCatalog } from "./study-catalog";
import { seenQuestions } from "./study-session";

// A completion counts once per local day. Yesterday's streak remains visible
// until the learner has had a chance to complete today's challenge.
export function dailyStreak(days: string[], today: string) {
  const completed = new Set(days);
  const cursor = new Date(`${today}T12:00:00Z`);
  if (!completed.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let count = 0;
  while (completed.has(cursor.toISOString().slice(0, 10))) {
    count++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return count;
}

async function personalPools(db: Store, userId: string) {
  const latest = await db
    .selectDistinctOn([questionVersion.questionId], {
      questionId: questionVersion.questionId,
      correct: sql<boolean>`coalesce(case when ${questionVersion.kind} = 'order' then ${attemptAnswer.selectedOrder} = ${questionVersion.answerOrder} else ${attemptAnswer.selectedChoiceId} = ${questionVersion.answerChoiceId} end, false)`,
    })
    .from(attemptItem)
    .innerJoin(attempt, eq(attempt.id, attemptItem.attemptId))
    .innerJoin(questionVersion, eq(questionVersion.id, attemptItem.questionVersionId))
    .leftJoin(attemptAnswer, eq(attemptAnswer.attemptItemId, attemptItem.id))
    .leftJoin(attemptResult, eq(attemptResult.attemptId, attempt.id))
    .where(
      and(
        eq(attempt.userId, userId),
        or(
          sql`${attemptItem.committedAt} is not null`,
          sql`${attemptResult.attemptId} is not null`,
        ),
      ),
    )
    .orderBy(
      questionVersion.questionId,
      desc(sql`coalesce(${attemptItem.committedAt}, ${attempt.submittedAt})`),
      desc(attemptItem.id),
    );
  const saved = await db
    .select({ questionId: bookmark.questionId })
    .from(bookmark)
    .where(eq(bookmark.userId, userId));
  return {
    missed: new Set(latest.filter((r) => !r.correct).map((r) => r.questionId)),
    bookmarks: new Set(saved.map((r) => r.questionId)),
  };
}

export async function reviewerSummary(db: Database, userId: string) {
  await reconcileExpired(db, userId);
  return db.transaction(async (tx) => {
    await lockPersonalOwner(tx, userId);
    const catalog = await studyCatalog(tx, userId);
    const [timing] = await tx
      .select({
        itemCount: examProfileVersion.itemCount,
        durationMinutes: examProfileVersion.durationMinutes,
      })
      .from(examProfileVersion)
      .where(and(eq(examProfileVersion.level, catalog.level), eq(examProfileVersion.active, true)));
    const eligible = new Set((await candidates(tx, catalog.level)).map((q) => q.questionId));
    const [profile] = await tx.select().from(userProfile).where(eq(userProfile.userId, userId));
    const now = await serverClock(tx),
      today = studyDate(now, profile?.timezone ?? "Asia/Manila");
    const history = await tx
      .select({
        id: attempt.id,
        mode: attempt.mode,
        status: attempt.status,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
        creationKey: attempt.creationKey,
        correct: attemptResult.correct,
        incorrect: attemptResult.incorrect,
        unanswered: attemptResult.unanswered,
        elapsedSeconds: attemptResult.elapsedSeconds,
      })
      .from(attempt)
      .innerJoin(attemptResult, eq(attemptResult.attemptId, attempt.id))
      .innerJoin(examProfileVersion, eq(examProfileVersion.id, attempt.profileVersionId))
      .where(and(eq(attempt.userId, userId), eq(examProfileVersion.level, catalog.level)))
      .orderBy(desc(attempt.submittedAt), desc(attempt.id));
    const active = await tx
      .select({ id: attempt.id, mode: attempt.mode })
      .from(attempt)
      .where(and(eq(attempt.userId, userId), eq(attempt.status, "in_progress")))
      .orderBy(desc(attempt.startedAt))
      .limit(1);
    // No question-level performance is exposed while an assessment is active.
    const assessment = active[0] && ["strict_mock", "diagnostic"].includes(active[0].mode);
    const pools = assessment ? null : await personalPools(tx, userId);
    const days = history
      .filter(
        (h) => h.status === "submitted" && h.creationKey?.startsWith("cse:daily:") && h.submittedAt,
      )
      .map((h) => studyDate(h.submittedAt as Date, profile?.timezone ?? "Asia/Manila"));
    const average = history.length
      ? history.reduce((sum, h) => sum + h.correct / (h.correct + h.incorrect + h.unanswered), 0) /
        history.length
      : null;
    return {
      catalog,
      timing: timing ?? null,
      examsTaken: history.length,
      averageScore: average === null ? null : Math.round(average * 100),
      streak: dailyStreak(days, today),
      missedCount: pools ? [...pools.missed].filter((id) => eligible.has(id)).length : null,
      bookmarkCount: pools
        ? [...pools.bookmarks].filter((id) => id && eligible.has(id)).length
        : null,
      active: active[0] ?? null,
      history: history.slice(0, 50).map(({ creationKey, ...h }) => ({
        ...h,
        label: creationKey?.startsWith("cse:daily:")
          ? "Daily challenge"
          : creationKey?.startsWith("cse:quick10:")
            ? "Quick 10"
            : h.mode === "strict_mock"
              ? "Mock simulation"
              : "Topic practice",
        total: h.correct + h.incorrect + h.unanswered,
        percent: Math.round((100 * h.correct) / (h.correct + h.incorrect + h.unanswered)),
      })),
    };
  });
}

export async function startReviewer(db: Database, userId: string, input: ReviewerStartInput) {
  await reconcileExpired(db, userId);
  return db.transaction(async (tx) => {
    await tx.select().from(userProfile).where(eq(userProfile.userId, userId)).for("update");
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify([
          input.mode,
          input.area,
          input.topicId,
          input.providerSubcategory ?? null,
          input.attemptId ?? null,
        ]),
      )
      .digest("hex");
    const key = `cse:${input.mode}:${fingerprint}:${input.requestId}`;
    const [existing] = await tx
      .select()
      .from(attempt)
      .where(
        and(
          eq(attempt.userId, userId),
          or(
            eq(attempt.creationKey, input.requestId),
            like(attempt.creationKey, `%:${input.requestId}`),
          ),
        ),
      );
    if (existing) {
      if (existing.creationKey !== key)
        fail("This start ID belongs to a different quiz. Start a new request.");
      return { id: existing.id };
    }
    await assertStudyWindow(tx, userId);
    const prefs = await preferences(tx, userId),
      profile = await activeProfile(tx, prefs.level);
    const filter = await resolveStudyFilter(tx, prefs.level, {
      area: input.area,
      topicId: input.topicId,
      providerSubcategory: input.providerSubcategory,
    });
    const pool = (await candidates(tx, prefs.level)).filter((q) => matchesStudyFilter(q, filter));
    const personal = ["missed", "bookmarks"].includes(input.mode)
      ? await personalPools(tx, userId)
      : null;
    if (input.attemptId && input.mode !== "retake") fail("Choose retake mode for a previous quiz.");
    let retakeQuestions: Set<string> | null = null,
      retakeTimed = false;
    if (input.mode === "retake") {
      if (!input.attemptId) fail("Choose a completed quiz to retake.");
      const original = await ownerAttempt(tx, userId, input.attemptId);
      if (original.status === "in_progress") fail("Finish the original quiz before retaking it.");
      if (!["practice", "review"].includes(original.mode))
        fail("Choose a timed mock preset to start a new simulation.");
      const items = await tx
        .select({ questionId: questionVersion.questionId })
        .from(attemptItem)
        .innerJoin(questionVersion, eq(questionVersion.id, attemptItem.questionVersionId))
        .where(eq(attemptItem.attemptId, original.id));
      retakeQuestions = new Set(items.map((i) => i.questionId));
      retakeTimed = !!original.expiresAt;
    }
    const found = retakeQuestions
      ? pool.filter((q) => retakeQuestions.has(q.questionId))
      : input.mode === "missed"
        ? pool.filter((q) => personal?.missed.has(q.questionId))
        : input.mode === "bookmarks"
          ? pool.filter((q) => personal?.bookmarks.has(q.questionId))
          : pool;
    const count = retakeQuestions
      ? retakeQuestions.size
      : input.mode === "daily"
        ? 25
        : input.mode === "quick10"
          ? 10
          : Math.min(50, found.length);
    if (!count)
      fail(
        input.mode === "bookmarks"
          ? "No bookmarked questions yet. Bookmark a question while practicing."
          : input.mode === "missed"
            ? "No missed questions to review. Take a quiz to test your skills."
            : "No published questions are available in this topic yet.",
      );
    if (found.length < count)
      fail(
        `Not enough reviewed questions: ${found.length}/${count}. No shortened quiz was created.`,
      );
    const selected = shuffled(found).slice(0, count),
      seen = await seenQuestions(tx, userId);
    return pinSelected(
      tx,
      userId,
      selected,
      seen,
      {
        mode: input.mode === "missed" ? "review" : "practice",
        profileVersionId: profile.id,
        creationKey: key,
      },
      retakeTimed || ["daily", "quick10"].includes(input.mode)
        ? Math.ceil((profile.durationMinutes * count) / profile.itemCount) * 60
        : undefined,
    );
  });
}

// Pin ownership is sufficient for bookmark metadata; no feedback is returned.
export async function reviewerBookmark(
  db: Database,
  userId: string,
  attemptId: string,
  itemId: string,
  saved?: boolean,
) {
  return db.transaction(async (tx) => {
    await lockPersonalOwner(tx, userId);
    await ownerAttempt(tx, userId, attemptId);
    const [item] = await tx
      .select({ questionId: questionVersion.questionId })
      .from(attemptItem)
      .innerJoin(questionVersion, eq(questionVersion.id, attemptItem.questionVersionId))
      .where(and(eq(attemptItem.id, itemId), eq(attemptItem.attemptId, attemptId)));
    if (!item) return missing();
    if (saved !== undefined)
      return writeBookmark(tx, userId, { kind: "question", id: item.questionId }, saved);
    const [row] = await tx
      .select({ id: bookmark.id })
      .from(bookmark)
      .where(and(eq(bookmark.userId, userId), eq(bookmark.questionId, item.questionId)));
    return { saved: !!row };
  });
}
