import { createHash } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { appRouter } from "@sibol-cse/api/routers/index";
import { exportAccount, prepareExport } from "@sibol-cse/api/services/account-data";
import { requestLimit } from "@sibol-cse/db/schema";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";
import { createContext, requestSession } from "./context";
import { ENV } from "./env.server";
import { auth, db } from "./services";

const app = new Hono();
const rpcPaths = new Set(
  Object.entries(appRouter).flatMap(([group, procedures]) =>
    Object.keys(procedures).map((procedure) => `/api/rpc/${group}/${procedure}`),
  ),
);
rpcPaths.add("/api/account/export");
app.use(requestId());
app.use(secureHeaders({ referrerPolicy: "no-referrer" }));
app.use("/api/*", (c, next) =>
  bodyLimit({
    maxSize:
      c.req.path.startsWith("/api/rpc/content/") || c.req.path === "/api/rpc/imports/validate"
        ? 1024 * 1024
        : 64 * 1024,
    onError: (ctx) => ctx.json({ error: "Request body exceeds the permitted size." }, 413),
  })(c, next),
);
app.onError((_error, c) => {
  console.error(JSON.stringify({ requestId: c.get("requestId"), event: "request_failed" }));
  return c.json({ error: "Unable to complete the request.", requestId: c.get("requestId") }, 500);
});
app.get("/health/live", (c) => c.json({ status: "ok" }));
app.get("/health/ready", async (c) => {
  try {
    await db.execute(sql`select 1 from user_profile limit 1`);
    return c.json({ status: "ready" });
  } catch {
    return c.json({ status: "unavailable" }, 503);
  }
});
app.get("/api/health/ready", async (c) => {
  c.header("Cache-Control", "no-store");
  try {
    await db.execute(sql`select 1 from user_profile limit 1`);
    return c.json({ status: "ready", release: ENV.SIBOL_RELEASE_SHA });
  } catch {
    return c.json({ status: "unavailable" }, 503);
  }
});
app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    if (c.req.header("origin") !== ENV.CORS_ORIGIN)
      return c.json({ error: "Untrusted request origin." }, 403);
  }
  // Shared buckets do not trust caller-controlled forwarded IP headers.
  if (c.req.method === "POST") {
    const identity =
      c.req.path.startsWith("/api/auth/") || c.req.path.includes("/invitations/")
        ? "anonymous"
        : ((await requestSession(c.req.raw))?.user.id ?? "anonymous");
    // Unknown URLs share one bucket; caller-chosen paths cannot create unlimited rows.
    const scope = c.req.path.startsWith("/api/auth/")
      ? "auth"
      : rpcPaths.has(c.req.path)
        ? c.req.path
        : "unmatched";
    const key = createHash("sha256").update(`${identity}:${scope}`).digest("hex");
    const [bucket] = await db
      .insert(requestLimit)
      .values({ key, count: 1, windowStart: new Date() })
      .onConflictDoUpdate({
        target: requestLimit.key,
        set: {
          count: sql`case when ${requestLimit.windowStart} < now() - interval '1 minute' then 1 else ${requestLimit.count} + 1 end`,
          windowStart: sql`case when ${requestLimit.windowStart} < now() - interval '1 minute' then now() else ${requestLimit.windowStart} end`,
        },
      })
      .returning({ count: requestLimit.count });
    const frequentReads = [
      "/api/rpc/profile/get",
      "/api/rpc/attempts/get",
      "/api/rpc/attempts/clock",
      "/api/rpc/attempts/saveAnswer",
      "/api/rpc/attempts/setFlag",
    ];
    const studyReads = [
      "dashboard/get",
      "plan/get",
      "review/listDue",
      "progress/summary",
      "mocks/list",
      "attempts/results",
      "attempts/list",
      "lessons/get",
      "lessons/list",
      "topics/list",
      "bookmarks/list",
      "notes/get",
      "notes/list",
      "search/query",
      "search/question",
      "account/settings",
    ];
    const maxRequests =
      identity !== "anonymous" && frequentReads.includes(c.req.path)
        ? 240
        : identity !== "anonymous" && studyReads.some((path) => c.req.path === `/api/rpc/${path}`)
          ? 120
          : 30;
    const sensitiveLimit = [
      "/api/account/export",
      "/api/rpc/account/export",
      "/api/rpc/account/requestDeletion",
    ].includes(c.req.path)
      ? 5
      : maxRequests;
    if (bucket && bucket.count > sensitiveLimit) {
      c.header("Retry-After", "60");
      return c.json({ error: "Please wait a minute before trying again." }, 429);
    }
  }
  await next();
});
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));
app.post("/api/account/export", async (c) => {
  const context = await createContext({ context: c });
  if (!context.session?.user) return c.json({ error: "Sign in to export your own data." }, 401);
  try {
    const body = await c.req.json().catch(() => null);
    if (!z.object({}).strict().safeParse(body).success)
      return c.json({ error: "Export does not accept an account identifier." }, 400);
    await prepareExport(db, context.session.user.id);
  } catch (error) {
    if (error instanceof ORPCError)
      return c.json(
        { error: error.message },
        error.code === "FORBIDDEN" ? 403 : error.code === "UNAUTHORIZED" ? 401 : 400,
      );
    throw error;
  }
  const transform = new TransformStream<Uint8Array, Uint8Array>();
  const writer = transform.writable.getWriter();
  const encoder = new TextEncoder();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  const cancel = () => controller.abort();
  c.req.raw.signal.addEventListener("abort", cancel, { once: true });
  controller.signal.addEventListener(
    "abort",
    () => {
      void writer.abort(new Error("Export cancelled")).catch(() => {});
    },
    { once: true },
  );
  void exportAccount(
    db,
    context.session.user.id,
    (chunk) => writer.write(encoder.encode(chunk)),
    controller.signal,
  )
    .then(() => writer.close())
    .catch(async () => {
      console.error(JSON.stringify({ requestId: c.get("requestId"), event: "export_failed" }));
      await writer.abort(new Error("Export interrupted")).catch(() => {});
    })
    .finally(() => {
      clearTimeout(timer);
      c.req.raw.signal.removeEventListener("abort", cancel);
    });
  return new Response(transform.readable, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="sibol-account-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
});
const rpcHandler = new RPCHandler(appRouter);
app.use("/api/rpc/*", async (c, next) => {
  const result = await rpcHandler.handle(c.req.raw, {
    prefix: "/api/rpc",
    context: await createContext({ context: c }),
  });
  if (result.matched) return result.response;
  await next();
});

export { app };
export default { port: ENV.PORT, fetch: app.fetch };
