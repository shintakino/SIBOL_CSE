import type { Database } from "@sibol-cse/db";
import {
  lesson,
  lessonVersion,
  planBuild,
  studyPlan,
  studyTask,
  userProfile,
} from "@sibol-cse/db/schema";
import { and, asc, eq, gte, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { candidates } from "./catalog";
import { type Allocation, addDays, monday, planSlots, studyDate } from "./learning-policy";
import { fail, missing, preferences, type Store } from "./learning-shared";
import { allowInsights, evidence } from "./progress";
import { serverClock } from "./review-schedule";
import { dueRows } from "./reviews";
export async function planGet(db: Store, userId: string) {
  const prefs = await preferences(db, userId);
  const [profile] = await db.select().from(userProfile).where(eq(userProfile.userId, userId));
  const today = studyDate(await serverClock(db), profile?.timezone ?? "Asia/Manila");
  const [plan] = await db
    .select()
    .from(studyPlan)
    .where(and(eq(studyPlan.userId, userId), eq(studyPlan.status, "active")));
  const tasks = await db
    .select({
      id: studyTask.id,
      planId: studyTask.planId,
      topicId: studyTask.topicId,
      scheduledOn: studyTask.scheduledOn,
      minutes: studyTask.minutes,
      completedAt: studyTask.completedAt,
      kind: studyTask.kind,
      reason: studyTask.reason,
      href: studyTask.href,
      carriedFromOn: studyTask.carriedFromOn,
    })
    .from(studyTask)
    .innerJoin(studyPlan, eq(studyPlan.id, studyTask.planId))
    .where(
      and(
        eq(studyPlan.userId, userId),
        eq(studyPlan.level, prefs.level),
        gte(studyTask.scheduledOn, monday(today)),
        lte(studyTask.scheduledOn, addDays(monday(today), 6)),
        isNull(studyTask.archivedAt),
        sql`(${studyPlan.status} = 'active' OR ${studyTask.completedAt} IS NOT NULL)`,
      ),
    )
    .orderBy(studyTask.scheduledOn, studyTask.id);
  return {
    today,
    weekStart: monday(today),
    weekEnd: addDays(monday(today), 6),
    preferences: prefs,
    plan: plan
      ? {
          id: plan.id,
          reason: plan.reason,
          generatedOn: plan.generatedOn,
          allocation: plan.allocation,
        }
      : null,
    tasks,
    completed: tasks.filter((t) => t.completedAt).length,
    total: tasks.length,
  };
}
export async function generatePlan(
  db: Database,
  userId: string,
  requestId: string,
  allocation?: Allocation,
) {
  return db.transaction(async (tx) => {
    const [profile] = await tx
      .select()
      .from(userProfile)
      .where(eq(userProfile.userId, userId))
      .for("update");
    if (!profile) return missing();
    const [existing] = await tx
      .select()
      .from(planBuild)
      .where(and(eq(planBuild.userId, userId), eq(planBuild.requestId, requestId)));
    if (existing) return planGet(tx, userId);
    await allowInsights(tx, userId);
    const data = await evidence(tx, userId),
      prefs = data.prefs;
    const today = studyDate(await serverClock(tx), profile.timezone),
      weekEnd = addDays(monday(today), 6);
    let [plan] = await tx
      .select()
      .from(studyPlan)
      .where(and(eq(studyPlan.userId, userId), eq(studyPlan.status, "active")));
    if (!plan) {
      [plan] = await tx
        .insert(studyPlan)
        .values({
          userId,
          level: prefs.level,
          preferencesRevision: prefs.revision,
          reason: "Broad coverage while evidence develops.",
        })
        .returning();
    }
    if (!plan) throw new Error("Plan creation failed");
    const weights = allocation ?? plan.allocation;
    if (weights.review + weights.priority + weights.mixed !== 100)
      fail("Allocation percentages must total 100.");
    const completed = await tx
      .select({ day: studyTask.scheduledOn, minutes: studyTask.minutes })
      .from(studyTask)
      .innerJoin(studyPlan, eq(studyPlan.id, studyTask.planId))
      .where(
        and(
          eq(studyPlan.userId, userId),
          eq(studyPlan.level, prefs.level),
          isNotNull(studyTask.completedAt),
          gte(studyTask.scheduledOn, today),
          lte(studyTask.scheduledOn, weekEnd),
        ),
      );
    const minutesByDay: Record<string, number> = {};
    for (const t of completed) minutesByDay[t.day] = (minutesByDay[t.day] ?? 0) + t.minutes;
    const pool = await candidates(tx, prefs.level),
      due = await dueRows(tx, userId);
    const lessons = await tx
      .select({ topicId: lessonVersion.topicId, slug: lesson.slug })
      .from(lessonVersion)
      .innerJoin(lesson, eq(lesson.id, lessonVersion.lessonId))
      .where(
        and(
          eq(lessonVersion.status, "published"),
          sql`${prefs.level} = any(${lessonVersion.levels})`,
        ),
      );
    const available = data.topics.filter(
      (t) =>
        pool.filter((q) => q.topicId === t.id).length >= 5 ||
        lessons.some((l) => l.topicId === t.id),
    );
    const sparse = available.some((t) => t.firstCount < 10);
    const ranked = [...available].sort((a, b) =>
      sparse
        ? a.unique - b.unique || a.id.localeCompare(b.id)
        : a.firstCorrect / Math.max(1, a.firstCount) -
          due.filter((r) => r.topicId === a.id).length * 0.02 -
          (b.firstCorrect / Math.max(1, b.firstCount) -
            due.filter((r) => r.topicId === b.id).length * 0.02),
    );
    const slots = planSlots({
      today,
      days: prefs.days,
      dailyMinutes: prefs.dailyMinutes,
      targetDate: prefs.targetDate,
      completed: minutesByDay,
      allocation: weights,
      reviewMinutes: due.length,
      priorityAvailable: available.length > 0,
      mixedAvailable: pool.length >= 5,
    });
    const pending = await tx
      .select()
      .from(studyTask)
      .where(
        and(
          eq(studyTask.planId, plan.id),
          isNull(studyTask.completedAt),
          isNull(studyTask.archivedAt),
        ),
      )
      .orderBy(asc(studyTask.scheduledOn), asc(studyTask.id));
    const carryBudget = Math.floor((slots.length * 5 * 0.2) / 5) * 5;
    const carry = pending
      .filter(
        (t) =>
          t.minutes === 5 &&
          (t.kind === "review"
            ? due.length > 0
            : t.kind === "mixed"
              ? pool.length >= 5
              : available.some((a) => a.id === t.topicId)) &&
          (t.carriedFromOn ?? t.scheduledOn) < today &&
          (t.carriedFromOn ?? t.scheduledOn) >= addDays(today, -14),
      )
      .slice(0, Math.min(2, Math.floor(carryBudget / 5)));
    const carryIds = new Set(carry.map((t) => t.id));
    for (const t of pending) {
      if (carryIds.has(t.id)) continue;
      if (t.scheduledOn < today || t.carriedFromOn)
        await tx
          .update(studyTask)
          .set({ archivedAt: await serverClock(tx) })
          .where(eq(studyTask.id, t.id));
      else await tx.delete(studyTask).where(eq(studyTask.id, t.id));
    }
    let carryIndex = 0,
      topicIndex = 0;
    for (const slot of slots) {
      const carried = carry[carryIndex];
      if (carried && carried.minutes <= slot.minutes) {
        carryIndex++;
        await tx
          .update(studyTask)
          .set({
            scheduledOn: slot.day,
            carriedFromOn: carried.carriedFromOn ?? carried.scheduledOn,
            reason: "A small carried-over task, within this week's budget.",
          })
          .where(eq(studyTask.id, carried.id));
        continue;
      }
      const selected = ranked[topicIndex % Math.max(1, ranked.length)];
      if (slot.kind === "priority") topicIndex++;
      const lessonFor = lessons.find((l) => l.topicId === selected?.id);
      const title =
        slot.kind === "review"
          ? "Revisit due concepts"
          : slot.kind === "mixed"
            ? "Mixed retrieval"
            : (selected?.title ?? "Broad coverage");
      const href =
        slot.kind === "review"
          ? "/review"
          : slot.kind === "mixed"
            ? "/practice?topic=mixed"
            : lessonFor
              ? `/learn/${lessonFor.slug}`
              : `/practice?topic=${selected?.id ?? "mixed"}`;
      await tx.insert(studyTask).values({
        planId: plan.id,
        topicId: slot.kind === "priority" ? selected?.id : null,
        scheduledOn: slot.day,
        minutes: slot.minutes,
        kind: slot.kind,
        href,
        reason: `${title}. ${slot.kind === "review" ? "Scheduled retrieval is due." : sparse ? "Insufficient evidence: broad coverage is recommended, without assuming weakness." : "First-exposure observations, review burden and coverage inform this recommendation."}`,
      });
    }
    const reason = slots.length
      ? `${sparse ? "Balanced coverage while evidence is sparse." : "Priorities use first-exposure performance and review burden."} Tasks are estimates, not a promise of complete coverage. Carryover is capped at two tasks / 20% of remaining weekly time. ${pool.length < 5 ? "Question inventory is limited." : ""}`
      : "No work can be scheduled within the remaining availability, target date and reviewed inventory. Adjust your preferences when ready; no progress is lost.";
    await tx
      .update(studyPlan)
      .set({ generatedOn: today, allocation: weights, reason })
      .where(eq(studyPlan.id, plan.id));
    await tx.insert(planBuild).values({ userId, requestId, planId: plan.id });
    return planGet(tx, userId);
  });
}
export async function completeTask(db: Database, userId: string, id: string) {
  return db.transaction(async (tx) => {
    await tx.select().from(userProfile).where(eq(userProfile.userId, userId)).for("update");
    const [task] = await tx
      .select({ task: studyTask, planStatus: studyPlan.status })
      .from(studyTask)
      .innerJoin(studyPlan, eq(studyPlan.id, studyTask.planId))
      .where(and(eq(studyTask.id, id), eq(studyPlan.userId, userId)))
      .for("update");
    if (!task) return missing();
    if (task.task.completedAt) return { completed: true };
    if (task.task.archivedAt || task.planStatus !== "active")
      fail("This task was replaced by your current plan. Reload before continuing.");
    const [profile] = await tx.select().from(userProfile).where(eq(userProfile.userId, userId));
    const today = studyDate(await serverClock(tx), profile?.timezone ?? "Asia/Manila");
    if (task.task.scheduledOn > today)
      fail("Future tasks can be completed on their scheduled study date.");
    await tx
      .update(studyTask)
      .set({ completedAt: await serverClock(tx) })
      .where(eq(studyTask.id, id));
    return { completed: true };
  });
}
