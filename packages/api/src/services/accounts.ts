import { createHash, randomBytes } from "node:crypto";
import { ORPCError } from "@orpc/server";
import type { Database } from "@sibol-cse/db";
import {
  account,
  auditEvent,
  invitation,
  session,
  studyPlan,
  studyPreferences,
  user,
  userProfile,
} from "@sibol-cse/db/schema";
import { hashPassword } from "better-auth/crypto";
import { and, eq, sql } from "drizzle-orm";
import type { z } from "zod";
import { acceptInvitationInput, type PreferencesInput } from "../contracts";

export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const invalidInvitation = () =>
  new ORPCError("BAD_REQUEST", {
    message: "This invitation is invalid, expired, or already used. Ask for a new invitation.",
  });

export async function acceptInvitation(db: Database, raw: z.infer<typeof acceptInvitationInput>) {
  const input = acceptInvitationInput.parse(raw);
  const password = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(invitation)
      .where(eq(invitation.tokenHash, tokenHash(input.token)))
      .for("update");
    if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) throw invalidInvitation();
    const [existing] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, invite.email));
    if (existing) throw invalidInvitation();
    const userId = crypto.randomUUID();
    await tx
      .insert(user)
      .values({ id: userId, email: invite.email, name: input.name, emailVerified: true });
    await tx.insert(account).values({
      id: crypto.randomUUID(),
      userId,
      accountId: userId,
      providerId: "credential",
      password,
      updatedAt: new Date(),
    });
    await tx.insert(userProfile).values({ userId });
    await tx.update(invitation).set({ acceptedAt: new Date() }).where(eq(invitation.id, invite.id));
    await tx
      .insert(auditEvent)
      .values({ actorId: userId, action: "invitation.accepted", targetId: invite.id });
    return { accepted: true };
  });
}

export async function createInvitation(db: Database, actorId: string, email: string) {
  const token = randomBytes(32).toString("hex");
  const result = await db.transaction(async (tx) => {
    const [actor] = await tx
      .select()
      .from(userProfile)
      .where(eq(userProfile.userId, actorId))
      .for("update");
    if (actor?.role !== "admin") throw new ORPCError("FORBIDDEN");
    const [existing] = await tx.select({ id: user.id }).from(user).where(eq(user.email, email));
    if (existing)
      throw new ORPCError("CONFLICT", { message: "This email already has an account." });
    const [invite] = await tx
      .insert(invitation)
      .values({
        email,
        tokenHash: tokenHash(token),
        invitedBy: actorId,
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      })
      .returning({ id: invitation.id, expiresAt: invitation.expiresAt });
    if (!invite) throw new Error("Invitation insert failed");
    await tx
      .insert(auditEvent)
      .values({ actorId, action: "invitation.created", targetId: invite.id });
    return invite;
  });
  return { ...result, token };
}

export async function savePreferences(db: Database, userId: string, input: PreferencesInput) {
  return db.transaction(async (tx) => {
    // Lock the owner, including the first-save case where preferences do not exist yet.
    const [profile] = await tx
      .select()
      .from(userProfile)
      .where(eq(userProfile.userId, userId))
      .for("update");
    if (!profile) throw new ORPCError("FORBIDDEN");
    const [old] = await tx
      .select()
      .from(studyPreferences)
      .where(eq(studyPreferences.userId, userId));
    if ((old?.revision ?? 0) !== input.revision)
      throw new ORPCError("CONFLICT", {
        message: "Your preferences changed in another tab. Reload and try again.",
      });
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: profile.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    if (input.targetDate && input.targetDate < today)
      throw new ORPCError("BAD_REQUEST", {
        message: "Choose today or a future personal target date.",
      });
    const revision = input.revision + 1;
    const { language, ...preferences } = input;
    await tx
      .insert(studyPreferences)
      .values({ ...preferences, userId, revision })
      .onConflictDoUpdate({
        target: studyPreferences.userId,
        set: { ...preferences, revision, updatedAt: new Date() },
      });
    await tx
      .update(userProfile)
      .set({
        language,
        onboardedAt: profile.onboardedAt ?? new Date(),
        diagnosticDecision:
          old && old.level !== input.level ? "pending" : profile.diagnosticDecision,
      })
      .where(eq(userProfile.userId, userId));
    const [previousPlan] = await tx
      .select({ allocation: studyPlan.allocation })
      .from(studyPlan)
      .where(and(eq(studyPlan.userId, userId), eq(studyPlan.status, "active")));
    await tx
      .update(studyPlan)
      .set({ status: "superseded" })
      .where(and(eq(studyPlan.userId, userId), eq(studyPlan.status, "active")));
    const [plan] = await tx
      .insert(studyPlan)
      .values({
        userId,
        level: input.level,
        preferencesRevision: revision,
        allocation: previousPlan?.allocation ?? { review: 20, priority: 60, mixed: 20 },
        reason: !old
          ? "Balanced starter plan: insufficient diagnostic evidence."
          : old.level !== input.level
            ? "Exam level changed; previous learning history is preserved."
            : "Study availability or preferences updated.",
      })
      .returning();
    return { revision, planId: plan?.id };
  });
}

export async function setRole(
  db: Database,
  actorId: string,
  userId: string,
  role: "learner" | "admin",
) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(741920)`);
    // Recheck the actor after acquiring the lock so a revoked administrator cannot race another role change.
    const [actor] = await tx.select().from(userProfile).where(eq(userProfile.userId, actorId));
    if (actor?.role !== "admin") throw new ORPCError("FORBIDDEN");
    const [target] = await tx.select().from(userProfile).where(eq(userProfile.userId, userId));
    if (!target) throw new ORPCError("NOT_FOUND");
    if (target.role === role) return;
    if (target.role === "admin" && role === "learner") {
      const admins = await tx
        .select({ id: userProfile.userId })
        .from(userProfile)
        .where(eq(userProfile.role, "admin"));
      if (admins.length <= 1)
        throw new ORPCError("CONFLICT", { message: "Keep at least one administrator." });
    }
    await tx.update(userProfile).set({ role }).where(eq(userProfile.userId, userId));
    await tx.delete(session).where(eq(session.userId, userId));
    await tx.insert(auditEvent).values({ actorId, action: `user.role.${role}`, targetId: userId });
  });
  return { updated: true };
}
