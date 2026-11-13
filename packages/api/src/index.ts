import { ORPCError, os } from "@orpc/server";
import { userProfile } from "@sibol-cse/db/schema";
import { eq } from "drizzle-orm";

import type { Context } from "./context";

export const o = os.$context<Context>();

export const publicProcedure = o;

const requireAuth = o.middleware(async ({ context, next }) => {
  if (!context.session?.user) {
    throw new ORPCError("UNAUTHORIZED");
  }
  const [profile] = await context.db
    .select()
    .from(userProfile)
    .where(eq(userProfile.userId, context.session.user.id));
  if (!profile) throw new ORPCError("FORBIDDEN");
  return next({
    context: {
      session: context.session,
      profile,
    },
  });
});

export const protectedProcedure = publicProcedure.use(requireAuth);
export const adminProcedure = protectedProcedure.use(async ({ context, next }) => {
  if (context.profile.role !== "admin") throw new ORPCError("FORBIDDEN");
  return next();
});
