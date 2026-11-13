import {
  attemptAnswer,
  type attemptItem,
  question,
  questionVersion,
  reviewEvent,
  reviewState,
  userProfile,
} from "@sibol-cse/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { reviewTransition, studyDate } from "./learning-policy";
import { fail, missing, type Store, type Tx } from "./learning-shared";
export async function serverClock(db: Store) {
  const result = await db.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`);
  const row = result.rows[0];
  if (!row) throw new Error("Server clock unavailable");
  return new Date(row.now);
}
export async function applyReviewOutcome(
  tx: Tx,
  userId: string,
  item: typeof attemptItem.$inferSelect,
  mode: string,
) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`review:${userId}`}))`);
  const eventKey = `${mode === "review" ? "review" : "practice"}:${item.id}`;
  const [existing] = await tx.select().from(reviewEvent).where(eq(reviewEvent.eventKey, eventKey));
  if (existing) return;
  const [version] = await tx
    .select()
    .from(questionVersion)
    .where(eq(questionVersion.id, item.questionVersionId));
  if (!version) return;
  const [answer] = await tx
    .select()
    .from(attemptAnswer)
    .where(eq(attemptAnswer.attemptItemId, item.id));
  const outcome = !answer?.selectedChoiceId
    ? "skipped"
    : answer.selectedChoiceId !== version.answerChoiceId
      ? "incorrect"
      : answer.confidence === "guessed"
        ? "guessed"
        : "correct";
  if (mode !== "review" && outcome === "correct") return;
  await transition(tx, userId, version.questionId, eventKey, outcome, {
    versionId: version.id,
    selectedChoiceId: answer?.selectedChoiceId ?? null,
    attemptItemId: item.id,
  });
}
export async function transition(
  tx: Tx,
  userId: string,
  questionId: string,
  eventKey: string,
  outcome: "correct" | "incorrect" | "skipped" | "guessed" | "tomorrow",
  snapshot: {
    versionId: string | null;
    selectedChoiceId: string | null;
    attemptItemId: string | null;
  },
) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`review:${userId}`}))`);
  const [existing] = await tx.select().from(reviewEvent).where(eq(reviewEvent.eventKey, eventKey));
  if (existing) {
    if (existing.userId !== userId || existing.questionId !== questionId)
      fail("This action ID belongs to a different review.");
    return;
  }
  const [profile] = await tx.select().from(userProfile).where(eq(userProfile.userId, userId));
  if (!profile) return missing();
  const zone = profile.timezone;
  const now = await serverClock(tx),
    today = studyDate(now, zone);
  const [stable] = await tx.select().from(question).where(eq(question.id, questionId)).for("share");
  const [current] = await tx
    .select()
    .from(questionVersion)
    .where(and(eq(questionVersion.questionId, questionId), eq(questionVersion.status, "published")))
    .for("share");
  // Match publication/quarantine lock order: question, version, then review state.
  const [old] = await tx
    .select()
    .from(reviewState)
    .where(and(eq(reviewState.userId, userId), eq(reviewState.questionId, questionId)))
    .for("update");
  const next = reviewTransition({
    today,
    dueOn: old ? studyDate(old.dueAt, zone) : today,
    step: old?.intervalStep ?? 0,
    lastReviewedOn: old?.lastReviewedOn ?? null,
    outcome: outcome === "correct" && snapshot.versionId !== current?.id ? "tomorrow" : outcome,
  });
  if (current && !stable?.blocked) {
    const values = {
      dueAt: sql`(${next.dueOn}::date::timestamp at time zone ${zone})`,
      intervalStep: next.step,
      lastReviewedOn: next.lastReviewedOn,
      lastVersionId: current.id,
    };
    await tx
      .insert(reviewState)
      .values({ userId, questionId, ...values })
      .onConflictDoUpdate({ target: [reviewState.userId, reviewState.questionId], set: values });
  } else if (old) await tx.delete(reviewState).where(eq(reviewState.id, old.id));
  await tx.insert(reviewEvent).values({
    userId,
    questionId,
    eventKey,
    outcome,
    studyDate: today,
    fromStep: old?.intervalStep ?? 0,
    toStep: current && !stable?.blocked ? next.step : 0,
    ...snapshot,
  });
}
