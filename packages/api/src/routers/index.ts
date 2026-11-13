import type { RouterClient } from "@orpc/server";
import { ORPCError } from "@orpc/server";
import { invitation, studyPlan, studyPreferences, user, userProfile } from "@sibol-cse/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { acceptInvitationInput, emailInput, preferencesInput } from "../contracts";
import { adminProcedure, protectedProcedure, publicProcedure } from "../index";
import {
  acceptInvitation,
  createInvitation,
  savePreferences,
  setRole,
  tokenHash,
} from "../services/accounts";

import { learningRouter } from "./learning";
import { libraryAccountRouter } from "./library-account";
import { studyLoopRouter } from "./study-loop";

export const appRouter = {
  ...learningRouter,
  ...libraryAccountRouter,
  ...studyLoopRouter,
  profile: {
    get: protectedProcedure.handler(async ({ context }) => {
      const userId = context.session.user.id;
      const [preferences] = await context.db
        .select()
        .from(studyPreferences)
        .where(eq(studyPreferences.userId, userId));
      const [plan] = await context.db
        .select({ id: studyPlan.id, reason: studyPlan.reason })
        .from(studyPlan)
        .where(and(eq(studyPlan.userId, userId), eq(studyPlan.status, "active")));
      return {
        name: context.session.user.name,
        email: context.session.user.email,
        role: context.profile.role,
        language: context.profile.language,
        timezone: context.profile.timezone,
        onboarded: !!context.profile.onboardedAt,
        diagnosticDecision: context.profile.diagnosticDecision,
        preferences: preferences ?? null,
        plan: plan ?? null,
      };
    }),
    update: protectedProcedure
      .input(preferencesInput)
      .handler(({ context, input }) => savePreferences(context.db, context.session.user.id, input)),
  },
  onboarding: {
    complete: protectedProcedure
      .input(preferencesInput)
      .handler(({ context, input }) => savePreferences(context.db, context.session.user.id, input)),
  },
  invitations: {
    inspect: publicProcedure
      .input(z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).strict())
      .handler(async ({ context, input }) => {
        const [invite] = await context.db
          .select({ expiresAt: invitation.expiresAt, acceptedAt: invitation.acceptedAt })
          .from(invitation)
          .where(eq(invitation.tokenHash, tokenHash(input.token)));
        if (!invite || invite.acceptedAt || invite.expiresAt <= new Date())
          throw new ORPCError("BAD_REQUEST", {
            message: "This invitation is invalid, expired, or already used.",
          });
        return { valid: true };
      }),
    accept: publicProcedure
      .input(acceptInvitationInput)
      .handler(({ context, input }) => acceptInvitation(context.db, input)),
  },
  users: {
    list: adminProcedure.handler(async ({ context }) =>
      context.db
        .select({ id: user.id, name: user.name, email: user.email, role: userProfile.role })
        .from(user)
        .innerJoin(userProfile, eq(user.id, userProfile.userId))
        .orderBy(desc(user.createdAt))
        .limit(100),
    ),
    invite: adminProcedure
      .input(z.object({ email: emailInput }).strict())
      .handler(async ({ context, input }) => {
        const invite = await createInvitation(context.db, context.session.user.id, input.email);
        try {
          await context.sendInvitation(input.email, invite.token);
        } catch {
          await context.db.delete(invitation).where(eq(invitation.id, invite.id));
          throw new ORPCError("SERVICE_UNAVAILABLE", {
            message: "The email could not be sent. Please retry.",
          });
        }
        return { sent: true, expiresAt: invite.expiresAt };
      }),
    setRole: adminProcedure
      .input(
        z
          .object({ userId: z.string().min(1).max(100), role: z.enum(["learner", "admin"]) })
          .strict(),
      )
      .handler(({ context, input }) =>
        setRole(context.db, context.session.user.id, input.userId, input.role),
      ),
  },
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<AppRouter>;
