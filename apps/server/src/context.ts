import type { Context as ApiContext } from "@sibol-cse/api/context";
import type { Context as HonoContext } from "hono";
import { auth, db, sendInvitation } from "./services";

export type CreateContextOptions = {
  context: HonoContext;
};

// One authentication lookup per HTTP request, shared by rate limiting and RPC.
// The WeakMap never reuses a session across requests or delays revocation.
const sessions = new WeakMap<Request, ReturnType<typeof auth.api.getSession>>();
export function requestSession(request: Request) {
  let pending = sessions.get(request);
  if (!pending) {
    pending = auth.api.getSession({ headers: request.headers });
    sessions.set(request, pending);
  }
  return pending;
}

export async function createContext({ context }: CreateContextOptions): Promise<ApiContext> {
  const session = await requestSession(context.req.raw);
  return {
    db,
    session,
    sendInvitation,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
