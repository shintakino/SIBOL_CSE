import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { questionInput } from "@sibol-cse/api/learning-contracts";
import { commitImport, validateImport } from "@sibol-cse/api/services/content";
import { createDb } from "@sibol-cse/db";
import { question, user, userProfile } from "@sibol-cse/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { digest } from "./content/topnotcher";

const { values } = parseArgs({
  options: {
    manifest: { type: "string" },
    "admin-email": { type: "string" },
    commit: { type: "boolean", default: false },
  },
});
if (!values.manifest || !values["admin-email"])
  throw new Error(
    "Usage: pnpm content:import --manifest preparation-professional.json --admin-email EMAIL [--commit]. Requires DATABASE_URL; defaults to a read-only preview.",
  );
const manifestPath = resolve(values.manifest);
const manifest = z
  .object({
    permissionHash: z.string().regex(/^[a-f0-9]{64}$/),
    level: z.enum(["professional", "subprofessional"]),
    batches: z
      .array(
        z.object({
          filename: z.string().regex(/^import-\d{4}\.json$/),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
          bytes: z
            .number()
            .int()
            .max(512 * 1024),
          rows: z.number().int().min(1).max(100),
        }),
      )
      .max(1000),
  })
  .parse(JSON.parse(await readFile(manifestPath, "utf8")));
const parsed = [];
const seen = new Set<string>();
// Verify the complete manifest before connecting or creating any import batch.
for (const batch of manifest.batches) {
  const path = resolve(dirname(manifestPath), `drafts-${manifest.level}`, batch.filename);
  const payload = await readFile(path, "utf8");
  if (digest(payload) !== batch.sha256 || Buffer.byteLength(payload) !== batch.bytes)
    throw new Error("Draft batch hash or size differs from manifest.");
  const rows = z.array(questionInput).min(1).max(100).parse(JSON.parse(payload));
  if (rows.length !== batch.rows) throw new Error("Draft batch row count differs from manifest.");
  for (const row of rows) {
    if (row.level !== manifest.level || seen.has(row.externalId))
      throw new Error("Duplicate ID or level mismatch in prepared batches.");
    seen.add(row.externalId);
  }
  parsed.push({ sourceHash: batch.sha256, rows });
}
const db = createDb({ DATABASE_URL: z.url().parse(process.env.DATABASE_URL), DB_POOL_MAX: 2 });
try {
  const [actor] = await db
    .select({ id: user.id })
    .from(user)
    .innerJoin(userProfile, eq(userProfile.userId, user.id))
    .where(and(eq(user.email, values["admin-email"].toLowerCase()), eq(userProfile.role, "admin")));
  if (!actor) throw new Error("An existing administrator is required.");
  const receipt = {
    manifestHash: digest(await readFile(manifestPath)),
    permissionHash: manifest.permissionHash,
    level: manifest.level,
    existingSkipped: 0,
    newDrafts: 0,
    committed: !!values.commit,
    batches: [] as { sourceHash: string; payloadHash: string; batchId: string; rows: number }[],
  };
  for (const batch of parsed) {
    const existing = await db
      .select({ externalId: question.externalId })
      .from(question)
      .where(
        inArray(
          question.externalId,
          batch.rows.map((r) => r.externalId),
        ),
      );
    const ids = new Set(existing.map((q) => q.externalId));
    const rows = batch.rows.filter((r) => !ids.has(r.externalId));
    receipt.existingSkipped += existing.length;
    if (!rows.length) continue;
    receipt.newDrafts += rows.length;
    if (!values.commit) continue;
    // These existing services enforce administrator access and create drafts only.
    const payload = JSON.stringify(rows);
    const preview = await validateImport(db, actor.id, "json", payload);
    if (!preview.valid || !preview.batchId)
      throw new Error(
        "Native import validation failed. Inspect the administrator import screen; no question content was logged.",
      );
    await commitImport(db, actor.id, preview.batchId);
    receipt.batches.push({
      sourceHash: batch.sourceHash,
      payloadHash: digest(payload),
      batchId: preview.batchId,
      rows: rows.length,
    });
    // Persist after each committed batch so a partial failure can resume safely.
    await writeFile(
      resolve(dirname(manifestPath), `import-receipt-${manifest.level}.json`),
      JSON.stringify(receipt, null, 2),
      { mode: 0o600 },
    );
  }
  console.log(
    JSON.stringify({
      level: receipt.level,
      newDrafts: receipt.newDrafts,
      existingSkipped: receipt.existingSkipped,
      committed: receipt.committed,
      published: 0,
    }),
  );
} finally {
  await db.$client.end();
}
