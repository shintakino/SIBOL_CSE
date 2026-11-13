import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, unlink, utimes, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { purgePersonalData } from "@sibol-cse/api/services/account-data";
import { createDb } from "@sibol-cse/db";
import { privateNote, questionVersion, user, userProfile } from "@sibol-cse/db/schema";
import { eq } from "drizzle-orm";

const source = new URL(process.env.TEST_DATABASE_URL ?? "");
if (!source.pathname.endsWith("_test"))
  throw new Error("Requires a migrated dedicated *_test database");
const started = performance.now(),
  stamp = Date.now().toString(36);
const directory = resolve(`.cache/verification/restore-${stamp}`);
await mkdir(directory, { recursive: true, mode: 0o700 });
const image = "sibol-cse-backup",
  target = `sibol_${stamp}_restore`;
const pg = {
  PGHOST: source.hostname,
  PGPORT: source.port || "5432",
  PGUSER: decodeURIComponent(source.username),
  PGPASSWORD: decodeURIComponent(source.password),
  PGDATABASE: source.pathname.slice(1),
};
function container(
  entry: string,
  args: string[] = [],
  extra: Record<string, string> = {},
  required = true,
) {
  const environment = { ...pg, ...extra };
  const result = Bun.spawnSync(
    [
      "docker",
      "run",
      "--rm",
      "--network",
      "host",
      "--user",
      `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
      ...Object.keys(environment).flatMap((k) => ["-e", k]),
      "-v",
      `${directory}:/backups`,
      "-v",
      `${directory}/identity:/run/secrets/backup-key:ro`,
      "--entrypoint",
      entry,
      image,
      ...args,
    ],
    { env: { ...process.env, ...environment }, stdout: "pipe", stderr: "pipe" },
  );
  if (required && result.exitCode)
    throw new Error(`${entry} failed: ${result.stderr.toString().slice(0, 600)}`);
  return result;
}
// Create the key first without mounting the not-yet-existing key path.
const keygen = Bun.spawnSync(
  [
    "docker",
    "run",
    "--rm",
    "--user",
    `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
    "-v",
    `${directory}:/backups`,
    "--entrypoint",
    "age-keygen",
    image,
    "-o",
    "/backups/identity",
  ],
  { stdout: "pipe", stderr: "pipe" },
);
if (keygen.exitCode) throw new Error("Key generation failed");
const recipient = container("age-keygen", ["-y", "/run/secrets/backup-key"])
  .stdout.toString()
  .trim();
const backupEnv = { BACKUP_AGE_RECIPIENT: recipient };
const db = createDb({ DATABASE_URL: source.toString() });
const deletedId = crypto.randomUUID(),
  survivorId = crypto.randomUUID(),
  receiptId = crypto.randomUUID();
try {
  for (const id of [deletedId, survivorId]) {
    await db
      .insert(user)
      .values({ id, name: "Restore fixture", email: `${id}@example.test`, emailVerified: true });
    await db.insert(userProfile).values({ userId: id });
  }
  const publishedBefore = await db.$client.query(
    "select count(*)::int n from question_version where status='published'",
  );
  const [version] = await db
    .select({ id: questionVersion.questionId })
    .from(questionVersion)
    .limit(1);
  if (!version) throw new Error("Run after a synthetic test bank has been seeded");
  await db.insert(privateNote).values({
    userId: deletedId,
    questionId: version.id,
    body: "Synthetic deleted restore fixture",
  });
  container("/usr/local/bin/backup-once.sh", [], backupEnv);
  const file = (await readdir(directory)).find((n) => n.endsWith(".dump.age"));
  if (!file) throw new Error("Missing encrypted archive");
  const header = (await readFile(resolve(directory, file))).subarray(0, 22).toString();
  if (!header.startsWith("age-encryption.org/v1")) throw new Error("Archive is not age encrypted");
  await db.transaction((tx) => purgePersonalData(tx, deletedId, receiptId, new Date()));
  container("/usr/local/bin/ledger-once.sh", [], backupEnv);
  container("/usr/local/bin/health.sh");
  const encrypted = await readFile(resolve(directory, file));
  for (const kind of ["expired", "corrupt"] as const) {
    const badFile = `sibol-${kind}.dump.age`;
    const digest = createHash("sha256").update(encrypted).digest("hex");
    const payload = Buffer.from(encrypted);
    if (kind === "corrupt") payload[payload.length - 1] = (payload[payload.length - 1] ?? 0) ^ 1;
    await writeFile(resolve(directory, badFile), payload, { mode: 0o600 });
    await writeFile(resolve(directory, `${badFile}.sha256`), `${digest}  /backups/${badFile}\n`);
    if (kind === "expired") {
      const old = new Date(Date.now() - 31 * 86400000);
      await utimes(resolve(directory, badFile), old, old);
    }
    if (
      !container(
        "/usr/local/bin/restore-new.sh",
        [],
        { RESTORE_DATABASE: target, BACKUP_FILE: badFile },
        false,
      ).exitCode
    )
      throw new Error(`Restore accepted a ${kind} archive`);
    if (kind === "corrupt") {
      await unlink(resolve(directory, badFile));
      await unlink(resolve(directory, `${badFile}.sha256`));
    }
  }
  container("/usr/local/bin/backup-once.sh", [], backupEnv);
  if ((await readdir(directory)).some((n) => n.startsWith("sibol-expired.dump.age")))
    throw new Error("Expired ciphertext or sidecar survived retention pruning");
  const archivesBefore = (await readdir(directory)).filter((n) => n.endsWith(".dump.age")).length;
  if (
    !container(
      "/usr/local/bin/backup-once.sh",
      [],
      { ...backupEnv, PGDATABASE: "sibol_missing_fixture_test" },
      false,
    ).exitCode
  )
    throw new Error("Missing database unexpectedly backed up");
  const names = await readdir(directory);
  if (
    names.some((n) => n.startsWith(".partial-")) ||
    names.filter((n) => n.endsWith(".dump.age")).length !== archivesBefore
  )
    throw new Error("Failed backup left a successful-looking archive");
  container("/usr/local/bin/restore-new.sh", [], { RESTORE_DATABASE: target, BACKUP_FILE: file });
  if (
    !container(
      "/usr/local/bin/restore-new.sh",
      [],
      { RESTORE_DATABASE: target, BACKUP_FILE: file },
      false,
    ).exitCode
  )
    throw new Error("Restore unexpectedly overwrote an existing database");
  if (
    !container(
      "/usr/local/bin/restore-new.sh",
      [],
      { RESTORE_DATABASE: "sibol", BACKUP_FILE: file },
      false,
    ).exitCode
  )
    throw new Error("Live target guard failed");
  const ledger = container("age", [
    "--decrypt",
    "--identity",
    "/run/secrets/backup-key",
    "/backups/deletions.json.age",
  ]).stdout;
  const reconciliation = Bun.spawnSync([process.execPath, "scripts/reconcile-deletions.ts"], {
    env: { ...process.env, ...pg, RESTORE_DATABASE: target },
    stdin: ledger,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (reconciliation.exitCode)
    throw new Error(`Reconciliation failed: ${reconciliation.stderr.toString().slice(0, 500)}`);
  const restoredUrl = new URL(source);
  restoredUrl.pathname = `/${target}`;
  const restored = createDb({ DATABASE_URL: restoredUrl.toString() });
  try {
    if ((await restored.select().from(userProfile).where(eq(userProfile.userId, deletedId))).length)
      throw new Error("Deleted owner resurrected");
    if ((await restored.select().from(privateNote).where(eq(privateNote.userId, deletedId))).length)
      throw new Error("Deleted note resurrected");
    if (
      !(await restored.select().from(userProfile).where(eq(userProfile.userId, survivorId))).length
    )
      throw new Error("Surviving owner lost");
    const publishedAfter = await restored.$client.query(
      "select count(*)::int n from question_version where status='published'",
    );
    if (publishedBefore.rows[0].n !== publishedAfter.rows[0].n)
      throw new Error("Published content changed");
    const sessions = await restored.$client.query("select count(*)::int n from session");
    if (sessions.rows[0].n) throw new Error("Restored sessions remain valid");
    const report = {
      measuredAt: new Date().toISOString(),
      encrypted: true,
      targetDatabase: target,
      archive: file,
      deletionReapplied: true,
      survivorPreserved: true,
      publishedVersions: publishedAfter.rows[0].n,
      sessionsRevoked: true,
      rejectsExistingAndLiveTargets: true,
      rejectsExpiredAndCorruptArchives: true,
      failedDumpLeavesNoArchive: true,
      retentionPrunedExpiredCiphertext: true,
      elapsedSeconds: Math.round((performance.now() - started) / 1000),
      rpoHours: 24,
      rtoHours: 4,
      scope:
        "Local PostgreSQL 17 synthetic fixture rehearsal; offline target retained for inspection. No production cutover.",
    };
    await writeFile(".cache/verification/restore-report.json", JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await restored.$client.end();
  }
} finally {
  await db.$client.end();
}
