import { ORPCError } from "@orpc/server";
import type { Database } from "@sibol-cse/db";
import {
  attempt,
  attemptItem,
  questionVersion,
  studyPreferences,
  userProfile,
} from "@sibol-cse/db/schema";
import { and, eq, inArray } from "drizzle-orm";

export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Store = Database | Tx;
export function fail(message: string): never {
  throw new ORPCError("BAD_REQUEST", { message });
}
export function missing(): never {
  throw new ORPCError("NOT_FOUND", { message: "This resource is unavailable." });
}
export async function assertAdmin(db: Store, actorId: string) {
  const [actor] = await db
    .select()
    .from(userProfile)
    .where(eq(userProfile.userId, actorId))
    .for("share");
  if (actor?.role !== "admin") throw new ORPCError("FORBIDDEN");
}
export async function preferences(db: Store, userId: string) {
  const [row] = await db.select().from(studyPreferences).where(eq(studyPreferences.userId, userId));
  if (!row)
    throw new ORPCError("PRECONDITION_FAILED", {
      message: "Complete your study preferences first.",
    });
  return row;
}
export async function strictQuestions(db: Store, userId: string) {
  const rows = await db
    .select({ questionId: questionVersion.questionId })
    .from(attempt)
    .innerJoin(attemptItem, eq(attemptItem.attemptId, attempt.id))
    .innerJoin(questionVersion, eq(questionVersion.id, attemptItem.questionVersionId))
    .where(
      and(
        eq(attempt.userId, userId),
        inArray(attempt.mode, ["strict_mock", "diagnostic"]),
        eq(attempt.status, "in_progress"),
      ),
    );
  return new Set(rows.map((r) => r.questionId));
}
export async function assertFeedbackAllowed(db: Store, userId: string, questionIds: string[]) {
  if (!questionIds.length) return;
  const forbidden = await db
    .select({ id: attempt.id })
    .from(attempt)
    .innerJoin(attemptItem, eq(attemptItem.attemptId, attempt.id))
    .innerJoin(questionVersion, eq(questionVersion.id, attemptItem.questionVersionId))
    .where(
      and(
        eq(attempt.userId, userId),
        inArray(attempt.mode, ["strict_mock", "diagnostic"]),
        eq(attempt.status, "in_progress"),
        inArray(questionVersion.questionId, questionIds),
      ),
    )
    .limit(1);
  if (forbidden.length)
    throw new ORPCError("FORBIDDEN", {
      message:
        "This question's study material is unavailable during your active diagnostic or strict mock.",
    });
}

export async function assertStudyWindow(db: Store, userId: string) {
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
  if (active)
    throw new ORPCError("FORBIDDEN", {
      message:
        "Finish your active diagnostic or strict mock before opening saved material, notes or search.",
    });
}
