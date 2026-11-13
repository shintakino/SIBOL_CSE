import { mkdir, writeFile } from "node:fs/promises";
import { cpus, platform, release, totalmem } from "node:os";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { AppRouterClient } from "@sibol-cse/api/routers/index";
import { buildForms, createBlueprint } from "@sibol-cse/api/services/catalog";
import { createDb } from "@sibol-cse/db";
import { account, studyPreferences, user, userProfile } from "@sibol-cse/db/schema";
import { hashPassword } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { seedLearning } from "../tests/fixtures/learning";

const databaseURL = process.env.TEST_DATABASE_URL;
if (!databaseURL || !new URL(databaseURL).pathname.endsWith("_test"))
  throw new Error(
    "Benchmark requires a dedicated *_test database; it clears public fixture tables.",
  );
const origin = "http://127.0.0.1:3200";
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: databaseURL,
  PORT: "3200",
  BETTER_AUTH_URL: origin,
  CORS_ORIGIN: origin,
  BETTER_AUTH_SECRET: "benchmark-only-secret-at-least-32-characters",
  SMTP_URL: "smtp://localhost:1025",
  EMAIL_FROM: "Sibol <benchmark@example.test>",
});
const db = createDb({ DATABASE_URL: databaseURL });
const { app } = await import("../apps/server/src/index"),
  services = await import("../apps/server/src/services");
const server = Bun.serve({ port: 3200, hostname: "127.0.0.1", fetch: app.fetch });
const password = "benchmark-only-passphrase",
  adminId = crypto.randomUUID();
const reads: number[] = [],
  saves: number[] = [],
  bytes: number[] = [];
const started = performance.now();
try {
  await migrate(db, { migrationsFolder: "packages/db/src/migrations" });
  const tables = await db.$client.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname='public'",
  );
  for (const { tablename } of tables.rows)
    await db.execute(sql.raw(`TRUNCATE TABLE "${tablename.replaceAll('"', '""')}" CASCADE`));
  const hashed = await hashPassword(password);
  await db.insert(user).values({
    id: adminId,
    name: "Benchmark editor",
    email: "bench-admin@example.test",
    emailVerified: true,
  });
  await db.insert(userProfile).values({ userId: adminId, role: "admin" });
  const fixture = await seedLearning(db, adminId, 20, "professional", true);
  const quotas = Object.fromEntries(
    fixture.topics.map((t, i) => [
      t.id,
      Math.floor(150 / fixture.topics.length) + (i < 150 % fixture.topics.length ? 1 : 0),
    ]),
  );
  const b = await createBlueprint(db, adminId, fixture.profileId, quotas);
  await buildForms(db, adminId, b.id);
  const learners = await Promise.all(
    Array.from({ length: 20 }, async (_, i) => {
      const id = crypto.randomUUID(),
        email = `bench-${i}@example.test`;
      await db
        .insert(user)
        .values({ id, name: "Synthetic benchmark learner", email, emailVerified: true });
      await db.insert(userProfile).values({ userId: id, onboardedAt: new Date() });
      await db
        .insert(studyPreferences)
        .values({ userId: id, level: "professional", days: [1, 3, 5], dailyMinutes: 25 });
      await db.insert(account).values({
        id: crypto.randomUUID(),
        userId: id,
        accountId: id,
        providerId: "credential",
        password: hashed,
      });
      // Authenticate fixtures before the measured workload, using Better Auth's server API.
      // This avoids treating a burst of setup logins from one IP as normal learner traffic.
      const login = await services.auth.api.signInEmail({
        body: { email, password },
        asResponse: true,
      });
      if (!login.ok) throw new Error(`Fixture sign-in failed (${login.status})`);
      const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
      const rpc: AppRouterClient = createORPCClient(
        new RPCLink({
          url: `${origin}/api/rpc`,
          fetch: (url, init) => {
            const request = new Request(url, init);
            request.headers.set("origin", origin);
            request.headers.set("cookie", cookie);
            return fetch(request);
          },
        }),
      );
      const attempt = await rpc.mocks.start({
        requestId: crypto.randomUUID(),
        kind: "full",
        mode: "strict_mock",
        count: 10,
        multiplier: 100,
      });
      return { rpc, attemptId: attempt.id };
    }),
  );
  await Promise.all(
    learners.map(async ({ rpc, attemptId }) => {
      let revision = 0;
      for (let n = 0; n < 17; n++) {
        let t = performance.now();
        const data = await rpc.attempts.get({ attemptId });
        const elapsed = performance.now() - t;
        if (data.items.length !== 150 || data.items.some((item) => item.feedback !== null))
          throw new Error("Unsafe or shortened mock payload");
        if (n >= 2) {
          reads.push(elapsed);
          bytes.push(Buffer.byteLength(JSON.stringify(data)));
        }
        const item = data.items[0];
        if (!item) throw new Error("Missing pinned item");
        t = performance.now();
        const saved = await rpc.attempts.saveAnswer({
          attemptId,
          itemId: item.id,
          selectedChoiceId: item.choices[n % item.choices.length]?.id ?? null,
          expectedRevision: revision,
          mutationId: crypto.randomUUID(),
        });
        revision = saved.revision;
        if (n >= 2) saves.push(performance.now() - t);
      }
    }),
  );
  const stats = (samples: number[]) => {
    const a = [...samples].sort((a, b) => a - b);
    return {
      samples: a.length,
      p50Ms: Math.round((a[Math.ceil(a.length * 0.5) - 1] ?? 0) * 10) / 10,
      p95Ms: Math.round((a[Math.ceil(a.length * 0.95) - 1] ?? 0) * 10) / 10,
      maxMs: Math.round((a.at(-1) ?? 0) * 10) / 10,
    };
  };
  const read = stats(reads),
    save = stats(saves);
  const report = {
    measuredAt: new Date().toISOString(),
    concurrentLearners: 20,
    databasePoolMax: Number(process.env.DB_POOL_MAX ?? 10),
    warmupRounds: 2,
    measuredRounds: 15,
    transport: "Real loopback HTTP to Bun/Hono, without reverse-proxy/TLS latency",
    dataset:
      "320 synthetic published questions; 20 owner-private full 150-item strict mocks; long prompts and choices",
    meanMockPayloadBytes: Math.round(bytes.reduce((n, v) => n + v, 0) / bytes.length),
    read,
    save,
    targetP95Ms: 500,
    passed: read.p95Ms < 500 && save.p95Ms < 500,
    baseline: {
      runtime: Bun.version,
      nodeCompatibility: process.version,
      postgresMajor: 17,
      cpu: cpus()[0]?.model,
      logicalCpus: cpus().length,
      memoryGiB: Math.round(totalmem() / 1024 ** 3),
      os: `${platform()} ${release()}`,
    },
    totalSeconds: Math.round((performance.now() - started) / 1000),
  };
  await mkdir(".cache/verification", { recursive: true });
  await writeFile(".cache/verification/api-load.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally {
  await server.stop(true);
  await db.$client.end();
  await services.db.$client.end();
}
