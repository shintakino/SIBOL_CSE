"use client";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { AppRouterClient } from "@sibol-cse/api/routers/index";

export const client: AppRouterClient = createORPCClient(
  new RPCLink({
    url: () => `${window.location.origin}/api/rpc`,
    fetch: (url, options) => fetch(url, { ...options, credentials: "same-origin" }),
  }),
);
