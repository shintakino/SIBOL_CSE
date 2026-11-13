import { ORPCError } from "@orpc/server";
import type { Database } from "@sibol-cse/db";
import {
  account,
  attempt,
  attemptAnswer,
  attemptItem,
  attemptResult,
  auditEvent,
  bookmark,
  deletionReceipt,
  displayPreferences,
  importBatch,
  invitation,
  lessonProgress,
  planBuild,
  privateNote,
  questionExposure,
  questionIssue,
  reviewEvent,
  reviewState,
  session,
  studyPlan,
  studyPreferences,
  studyTask,
  user,
  userProfile,
  verification,
} from "@sibol-cse/db/schema";
import { verifyPassword } from "better-auth/crypto";
import { and, eq, or, sql } from "drizzle-orm";
import type { z } from "zod";
import type { displayInput } from "../library-contracts";
import { reconcileExpired } from "./attempts";
import { missing, type Store, type Tx } from "./learning-shared";
import { lockPersonalOwner } from "./note-store";
import { allowInsights } from "./progress";
export async function getDisplay(db: Store, userId: string) {
  const [row] = await db
    .select()
    .from(displayPreferences)
    .where(eq(displayPreferences.userId, userId));
  return (
    row ?? {
      userId,
      theme: "light" as const,
      motion: "system" as const,
      inAppReminders: true,
      futureEmailOptIn: false,
      revision: 0,
      updatedAt: null,
    }
  );
}
export async function saveDisplay(
  db: Database,
  userId: string,
  input: z.infer<typeof displayInput>,
) {
  return db.transaction(async (tx) => {
    await lockPersonalOwner(tx, userId);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`display:${userId}`}))`);
    const old = await getDisplay(tx, userId);
    if (old.revision !== input.revision)
      throw new ORPCError("CONFLICT", {
        message: "Settings changed in another tab. Reload before saving.",
      });
    const values = { ...input, revision: input.revision + 1, updatedAt: new Date() };
    await tx
      .insert(displayPreferences)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: displayPreferences.userId, set: values });
    return values;
  });
}
export async function prepareExport(db: Database, userId: string) {
  await reconcileExpired(db, userId);
  await lockPersonalOwner(db, userId);
  await allowInsights(db, userId);
  return {
    path: "/api/account/export",
    method: "POST" as const,
    format: "sibol-account-v1",
    backupRetentionDays: 30,
  };
}
// Drizzle wraps PostgreSQL errors; retry only serialization failures before a stream starts.
function serializationFailure(error: unknown) {
  for (let depth = 0; depth < 5 && error && typeof error === "object"; depth++) {
    if ("code" in error && error.code === "40001") return true;
    error = "cause" in error ? error.cause : null;
  }
  return false;
}
export async function exportAccount(
  db: Database,
  userId: string,
  write: (chunk: string) => Promise<unknown>,
  signal?: AbortSignal,
) {
  let emitted = false;
  for (let retry = 0; ; retry++) {
    try {
      return await db.transaction(
        async (tx) => {
          await lockPersonalOwner(tx, userId);
          await allowInsights(tx, userId);
          const [identity] = await tx
            .select({ name: user.name, email: user.email, createdAt: user.createdAt })
            .from(user)
            .where(eq(user.id, userId));
          if (!identity) return missing();
          const emit = async (value: string) => {
            if (signal?.aborted) throw new Error("Export cancelled");
            emitted = true;
            await write(value);
          };
          await emit(
            JSON.stringify({
              format: "sibol-account-v1",
              exportedAt: new Date().toISOString(),
              identity,
              notice:
                "Owner records only. Course prompts, choices, explanations, answer keys, credentials and tokens are omitted. Backup retention is 30 days.",
            }).slice(0, -1),
          );
          const field = async <T>(name: string, load: (offset: number) => Promise<T[]>) => {
            await emit(`,${JSON.stringify(name)}:[`);
            let first = true;
            for (let offset = 0; ; offset += 500) {
              const rows = await load(offset);
              for (const row of rows) {
                await emit(`${first ? "" : ","}${JSON.stringify(row)}`);
                first = false;
              }
              if (rows.length < 500) break;
            }
            await emit("]");
          };
          await field("studyPreferences", (o) =>
            tx
              .select()
              .from(studyPreferences)
              .where(eq(studyPreferences.userId, userId))
              .limit(500)
              .offset(o),
          );
          await field("displayPreferences", (o) =>
            tx
              .select()
              .from(displayPreferences)
              .where(eq(displayPreferences.userId, userId))
              .limit(500)
              .offset(o),
          );
          await field("profile", (o) =>
            tx
              .select({
                timezone: userProfile.timezone,
                language: userProfile.language,
                diagnosticDecision: userProfile.diagnosticDecision,
                dedication: userProfile.dedication,
              })
              .from(userProfile)
              .where(eq(userProfile.userId, userId))
              .limit(500)
              .offset(o),
          );
          await field("notes", (o) =>
            tx
              .select({
                id: privateNote.id,
                lessonId: privateNote.lessonId,
                questionId: privateNote.questionId,
                body: privateNote.body,
                revision: privateNote.revision,
                updatedAt: privateNote.updatedAt,
              })
              .from(privateNote)
              .where(and(eq(privateNote.userId, userId), sql`${privateNote.deletedAt} is null`))
              .orderBy(privateNote.id)
              .limit(500)
              .offset(o),
          );
          await field("bookmarks", (o) =>
            tx
              .select()
              .from(bookmark)
              .where(eq(bookmark.userId, userId))
              .orderBy(bookmark.id)
              .limit(500)
              .offset(o),
          );
          await field("lessonProgress", (o) =>
            tx
              .select()
              .from(lessonProgress)
              .where(eq(lessonProgress.userId, userId))
              .orderBy(lessonProgress.lessonId)
              .limit(500)
              .offset(o),
          );
          await field("plans", (o) =>
            tx
              .select()
              .from(studyPlan)
              .where(eq(studyPlan.userId, userId))
              .orderBy(studyPlan.id)
              .limit(500)
              .offset(o),
          );
          await field("tasks", (o) =>
            tx
              .select({
                id: studyTask.id,
                planId: studyTask.planId,
                topicId: studyTask.topicId,
                scheduledOn: studyTask.scheduledOn,
                minutes: studyTask.minutes,
                completedAt: studyTask.completedAt,
                kind: studyTask.kind,
                reason: studyTask.reason,
                carriedFromOn: studyTask.carriedFromOn,
                archivedAt: studyTask.archivedAt,
              })
              .from(studyTask)
              .innerJoin(studyPlan, eq(studyPlan.id, studyTask.planId))
              .where(eq(studyPlan.userId, userId))
              .orderBy(studyTask.id)
              .limit(500)
              .offset(o),
          );
          await field("attempts", (o) =>
            tx
              .select({
                id: attempt.id,
                mode: attempt.mode,
                setKind: attempt.setKind,
                timeMultiplier: attempt.timeMultiplier,
                profileVersionId: attempt.profileVersionId,
                blueprintVersionId: attempt.blueprintVersionId,
                status: attempt.status,
                startedAt: attempt.startedAt,
                expiresAt: attempt.expiresAt,
                submittedAt: attempt.submittedAt,
              })
              .from(attempt)
              .where(eq(attempt.userId, userId))
              .orderBy(attempt.id)
              .limit(500)
              .offset(o),
          );
          await field("items", (o) =>
            tx
              .select({
                id: attemptItem.id,
                attemptId: attemptItem.attemptId,
                questionVersionId: attemptItem.questionVersionId,
                position: attemptItem.position,
                flagged: attemptItem.flagged,
                firstExposure: attemptItem.firstExposure,
                committedAt: attemptItem.committedAt,
              })
              .from(attemptItem)
              .innerJoin(attempt, eq(attempt.id, attemptItem.attemptId))
              .where(eq(attempt.userId, userId))
              .orderBy(attemptItem.id)
              .limit(500)
              .offset(o),
          );
          await field("answers", (o) =>
            tx
              .select({
                attemptItemId: attemptAnswer.attemptItemId,
                selectedChoiceId: attemptAnswer.selectedChoiceId,
                selectedOrder: attemptAnswer.selectedOrder,
                confidence: attemptAnswer.confidence,
                revision: attemptAnswer.revision,
                savedAt: attemptAnswer.savedAt,
              })
              .from(attemptAnswer)
              .innerJoin(attemptItem, eq(attemptItem.id, attemptAnswer.attemptItemId))
              .innerJoin(attempt, eq(attempt.id, attemptItem.attemptId))
              .where(eq(attempt.userId, userId))
              .orderBy(attemptAnswer.attemptItemId)
              .limit(500)
              .offset(o),
          );
          await field("results", (o) =>
            tx
              .select({
                attemptId: attemptResult.attemptId,
                correct: attemptResult.correct,
                incorrect: attemptResult.incorrect,
                unanswered: attemptResult.unanswered,
                elapsedSeconds: attemptResult.elapsedSeconds,
                scoringVersion: attemptResult.scoringVersion,
                createdAt: attemptResult.createdAt,
              })
              .from(attemptResult)
              .innerJoin(attempt, eq(attempt.id, attemptResult.attemptId))
              .where(eq(attempt.userId, userId))
              .orderBy(attemptResult.attemptId)
              .limit(500)
              .offset(o),
          );
          await field("reviewState", (o) =>
            tx
              .select()
              .from(reviewState)
              .where(eq(reviewState.userId, userId))
              .orderBy(reviewState.id)
              .limit(500)
              .offset(o),
          );
          await field("reviewHistory", (o) =>
            tx
              .select({
                id: reviewEvent.id,
                questionId: reviewEvent.questionId,
                outcome: reviewEvent.outcome,
                fromStep: reviewEvent.fromStep,
                toStep: reviewEvent.toStep,
                studyDate: reviewEvent.studyDate,
                versionId: reviewEvent.versionId,
                selectedChoiceId: reviewEvent.selectedChoiceId,
                selectedOrder: reviewEvent.selectedOrder,
                createdAt: reviewEvent.createdAt,
              })
              .from(reviewEvent)
              .where(eq(reviewEvent.userId, userId))
              .orderBy(reviewEvent.id)
              .limit(500)
              .offset(o),
          );
          await field("issueReports", (o) =>
            tx
              .select({
                id: questionIssue.id,
                questionVersionId: questionIssue.questionVersionId,
                category: questionIssue.category,
                description: questionIssue.description,
                status: questionIssue.status,
                createdAt: questionIssue.createdAt,
              })
              .from(questionIssue)
              .where(eq(questionIssue.reporterId, userId))
              .orderBy(questionIssue.id)
              .limit(500)
              .offset(o),
          );
          await emit("}");
        },
        { isolationLevel: "repeatable read" },
      );
    } catch (error) {
      if (!emitted && retry === 0 && !signal?.aborted && serializationFailure(error)) continue;
      throw error;
    }
  }
}
// Shared by confirmed self-deletion and the offline restore-only reconciliation tool.
export async function purgePersonalData(
  tx: Tx,
  userId: string,
  receiptId: string,
  deletedAt = new Date(),
) {
  const [identity] = await tx.select().from(user).where(eq(user.id, userId)).for("update");
  if (identity) {
    // Finish readers/writers that lock preferences before clearing dependent learning data.
    await tx.delete(studyPreferences).where(eq(studyPreferences.userId, userId));
    await tx.delete(reviewEvent).where(eq(reviewEvent.userId, userId));
    await tx.delete(reviewState).where(eq(reviewState.userId, userId));
    await tx.delete(questionExposure).where(eq(questionExposure.userId, userId));
    await tx.delete(bookmark).where(eq(bookmark.userId, userId));
    await tx.delete(privateNote).where(eq(privateNote.userId, userId));
    await tx.delete(lessonProgress).where(eq(lessonProgress.userId, userId));
    await tx.delete(planBuild).where(eq(planBuild.userId, userId));
    await tx.delete(studyPlan).where(eq(studyPlan.userId, userId));
    await tx.delete(attempt).where(eq(attempt.userId, userId));
    await tx.delete(questionIssue).where(eq(questionIssue.reporterId, userId));
    await tx.delete(displayPreferences).where(eq(displayPreferences.userId, userId));
    await tx.delete(session).where(eq(session.userId, userId));
    await tx
      .delete(verification)
      .where(or(eq(verification.value, userId), eq(verification.identifier, identity.email)));
    await tx.delete(account).where(eq(account.userId, userId));
    await tx.delete(invitation).where(eq(invitation.email, identity.email));
    await tx.update(importBatch).set({ rows: null }).where(eq(importBatch.operatorId, userId));
    await tx.update(auditEvent).set({ actorId: null }).where(eq(auditEvent.actorId, userId));
    await tx.delete(userProfile).where(eq(userProfile.userId, userId));
    await tx
      .update(user)
      .set({
        name: "Deleted account",
        email: `deleted-${userId}@deleted.invalid`,
        emailVerified: false,
        image: null,
        createdAt: new Date(0),
        updatedAt: deletedAt,
      })
      .where(eq(user.id, userId));
  }
  await tx.insert(deletionReceipt).values({ userId, receiptId, deletedAt }).onConflictDoNothing();
}
export async function requestDeletion(
  db: Database,
  userId: string,
  sessionId: string,
  password: string,
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(741920)`);
    // Same order as finalization: attempt rows before the diagnostic/profile update.
    await tx
      .select({ id: attempt.id })
      .from(attempt)
      .where(eq(attempt.userId, userId))
      .orderBy(attempt.id)
      .for("update");
    const [profile] = await tx
      .select()
      .from(userProfile)
      .where(eq(userProfile.userId, userId))
      .for("update");
    if (!profile) return missing();
    const [live] = await tx
      .select({ id: session.id })
      .from(session)
      .where(
        and(
          eq(session.id, sessionId),
          eq(session.userId, userId),
          sql`${session.expiresAt} > clock_timestamp()`,
        ),
      );
    if (!live) throw new ORPCError("UNAUTHORIZED");
    if (profile.role === "admin") {
      const admins = await tx
        .select({ id: userProfile.userId })
        .from(userProfile)
        .where(eq(userProfile.role, "admin"));
      if (admins.length <= 1)
        throw new ORPCError("CONFLICT", {
          message:
            "Keep at least one administrator. Transfer administration before deleting this account.",
        });
    }
    const [credential] = await tx
      .select({ password: account.password })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, "credential")));
    if (!credential?.password || !(await verifyPassword({ hash: credential.password, password })))
      throw new ORPCError("BAD_REQUEST", {
        message: "The current password did not match. Your account has not been deleted.",
      });
    const receiptId = crypto.randomUUID();
    await purgePersonalData(tx, userId, receiptId);
    await tx
      .insert(auditEvent)
      .values({ actorId: null, action: "account.deleted", targetId: receiptId });
    return { deleted: true, receiptId, backupRetentionDays: 30 };
  });
}
