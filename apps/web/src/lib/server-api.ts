import "server-only";
import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { AppRouterClient } from "@sibol-cse/api/routers/index";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export async function requireProfile(onboardingRequired = true) {
  const incoming = await headers();
  const api: AppRouterClient = createORPCClient(
    new RPCLink({
      url: `${process.env.API_INTERNAL_URL ?? "http://localhost:3000"}/api/rpc`,
      headers: {
        cookie: incoming.get("cookie") ?? "",
        origin: process.env.CORS_ORIGIN ?? "http://localhost:3001",
      },
      fetch: (url, options) => fetch(url, { ...options, cache: "no-store" }),
    }),
  );
  let profile: Awaited<ReturnType<AppRouterClient["profile"]["get"]>>;
  try {
    profile = await api.profile.get();
  } catch (error) {
    if (error instanceof ORPCError && (error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN"))
      redirect("/sign-in");
    throw error;
  }
  if (onboardingRequired && !profile.onboarded) redirect("/onboarding");
  return profile;
}
export type Profile = Awaited<ReturnType<typeof requireProfile>>;
