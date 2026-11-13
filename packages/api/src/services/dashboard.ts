import type { Database } from "@sibol-cse/db";
import { attempt, attemptAnswer, attemptItem, userProfile } from "@sibol-cse/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDisplay } from "./account-data";
import { reconcileExpired } from "./attempts";
import { monday } from "./learning-policy";
import { generatePlan, planGet } from "./planner";
import { assessmentActive, progressSummary } from "./progress";
import { dueRows } from "./reviews";
export async function dashboardGet(db: Database, userId: string) {
  await reconcileExpired(db, userId);
  const [profile] = await db
    .select({
      dedication: userProfile.dedication,
      diagnosticDecision: userProfile.diagnosticDecision,
    })
    .from(userProfile)
    .where(eq(userProfile.userId, userId));
  const activeAssessment = await assessmentActive(db, userId);
  let plan = await planGet(db, userId);
  if (!activeAssessment && (!plan.plan?.generatedOn || plan.plan.generatedOn < plan.today))
    plan = await generatePlan(db, userId, `auto:${plan.preferences.revision}:${plan.today}`);
  const progress = activeAssessment ? null : await progressSummary(db, userId);
  const due = await dueRows(db, userId);
  const active = await db
    .select({
      id: attempt.id,
      mode: attempt.mode,
      setKind: attempt.setKind,
      expiresAt: attempt.expiresAt,
      savedAt: sql<Date | null>`max(${attemptAnswer.savedAt})`,
    })
    .from(attempt)
    .leftJoin(attemptItem, eq(attemptItem.attemptId, attempt.id))
    .leftJoin(attemptAnswer, eq(attemptAnswer.attemptItemId, attemptItem.id))
    .where(and(eq(attempt.userId, userId), eq(attempt.status, "in_progress")))
    .groupBy(attempt.id)
    .orderBy(desc(attempt.startedAt))
    .limit(5);
  const observed = progress?.topics
    .filter((t) => t.firstCount >= 10)
    .sort((a, b) => a.firstCorrect / a.firstCount - b.firstCorrect / b.firstCount)[0];
  const next =
    plan.tasks.find((t) => !t.completedAt && t.scheduledOn === plan.today) ??
    plan.tasks.find((t) => !t.completedAt && t.scheduledOn >= plan.today);
  const daysRemaining = plan.preferences.targetDate
    ? Math.round(
        (new Date(`${plan.preferences.targetDate}T12:00:00Z`).getTime() -
          new Date(`${plan.today}T12:00:00Z`).getTime()) /
          86400000,
      )
    : null;
  return {
    today: plan.today,
    weekStart: monday(plan.today),
    dedication: profile?.dedication ?? null,
    diagnosticDecision: profile?.diagnosticDecision ?? "pending",
    preferences: plan.preferences,
    dueCount: due.length,
    inAppReminders: (await getDisplay(db, userId)).inAppReminders,
    weekCompleted: plan.completed,
    weekTotal: plan.total,
    planReason: plan.plan?.reason ?? null,
    nextTask: next ?? null,
    daysRemaining,
    activeAssessment,
    active,
    recentPracticeAccuracy: progress?.recentPracticeAccuracy ?? null,
    observedWeakTopic: observed
      ? {
          title: observed.title,
          count: observed.firstCount,
          accuracy: observed.firstCorrect / observed.firstCount,
        }
      : null,
    recommendation: observed
      ? `Revisit ${observed.title} using unfamiliar questions.`
      : "Insufficient evidence: broad topic coverage is recommended without assuming a weak topic.",
  };
}
export async function setDedication(db: Database, userId: string, dedication: string | null) {
  await db.update(userProfile).set({ dedication }).where(eq(userProfile.userId, userId));
  return { saved: true };
}
