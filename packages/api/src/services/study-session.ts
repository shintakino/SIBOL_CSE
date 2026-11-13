import { ORPCError } from "@orpc/server";
import { attempt, attemptItem, questionVersion, userProfile } from "@sibol-cse/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { Tx } from "./learning-shared";
export async function lockStudyOwner(tx: Tx, userId: string, requestId: string, mode: string) {
  await tx.select().from(userProfile).where(eq(userProfile.userId, userId)).for("update");
  const [existing] = await tx
    .select()
    .from(attempt)
    .where(and(eq(attempt.userId, userId), eq(attempt.creationKey, requestId)));
  if (existing) {
    if (existing.mode !== mode)
      throw new ORPCError("CONFLICT", {
        message: "This request ID was used for a different study mode.",
      });
    return existing;
  }
  const [strict] = await tx
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
  if (strict)
    throw new ORPCError("CONFLICT", {
      message: "Finish your active diagnostic or strict mock first.",
    });
  return null;
}
export async function seenQuestions(tx: Tx, userId: string) {
  const rows = await tx
    .select({ id: questionVersion.questionId })
    .from(attemptItem)
    .innerJoin(attempt, eq(attempt.id, attemptItem.attemptId))
    .innerJoin(questionVersion, eq(questionVersion.id, attemptItem.questionVersionId))
    .where(eq(attempt.userId, userId));
  return new Set(rows.map((r) => r.id));
}
