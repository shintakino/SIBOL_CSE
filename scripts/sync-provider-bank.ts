import { chmod, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { assetExtension, putContentAsset } from "@sibol-cse/api/services/content-media";
import {
  finalizeProviderBank,
  importProviderSnapshots,
  openProviderBank,
  type ProviderSnapshotInput,
} from "@sibol-cse/api/services/provider-content";
import { createDb } from "@sibol-cse/db";
import { user, userProfile } from "@sibol-cse/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  type ImportedAsset,
  prepareSourceSnapshot,
  type SourceAnnotation,
} from "./content/shared-topnotcher";
import { capturedBatch, digest, mergeBatches, permissionInput } from "./content/topnotcher";

const { values } = parseArgs({
  options: {
    source: { type: "string" },
    out: { type: "string" },
    permission: { type: "string" },
    annotations: { type: "string" },
    "expected-manifest": { type: "string" },
    "admin-email": { type: "string" },
    commit: { type: "boolean", default: false },
    "retire-legacy": { type: "boolean", default: false },
  },
});
if (!values.source || !values.out || !values.permission)
  throw new Error(
    "Usage: pnpm content:sync --source .cache/content-authoring/topnotcher/bank-v1 --out .cache/content-authoring/topnotcher/bank-v2 --permission FILE [--annotations FILE] [--expected-manifest FILE] [--admin-email EMAIL --commit --retire-legacy]. Default: offline preparation only.",
  );
const privateRoot = resolve(".cache/content-authoring");
const source = resolve(values.source),
  out = resolve(values.out);
if (![source, out].every((dir) => dir.startsWith(`${privateRoot}/`)) || source === out)
  throw new Error(
    "Use separate source/output directories under private .cache/content-authoring/.",
  );
await mkdir(out, { recursive: true, mode: 0o700 });
await chmod(out, 0o700);
async function save(name: string, value: unknown) {
  const path = resolve(out, name);
  await writeFile(path, JSON.stringify(value, null, 2), { mode: 0o600 });
  await chmod(path, 0o600);
}
const permissionBytes = await readFile(values.permission, "utf8");
const permission = permissionInput.parse(JSON.parse(permissionBytes)),
  permissionHash = digest(permissionBytes);
if (!permission.scopes.includes("images"))
  throw new Error(
    "This bank contains images; record permission for image storage before synchronization.",
  );
const annotationBytes = values.annotations ? await readFile(values.annotations, "utf8") : "{}";
const annotationSchema = z
  .object({
    topicId: z.string().optional(),
    classificationReason: z.string().optional(),
    holdReason: z.string().optional(),
    language: z.enum(["english", "filipino"]).optional(),
    difficulty: z.enum(["easy", "medium", "hard"]).optional(),
    prompt: z.string().optional(),
    passage: z.string().nullable().optional(),
    explanation: z.string().optional(),
    image: z.object({ alt: z.string(), descriptionReviewed: z.boolean() }).optional(),
    choices: z
      .record(z.string(), z.object({ alt: z.string(), descriptionReviewed: z.boolean() }))
      .optional(),
  })
  .strict();
const annotations: Record<string, SourceAnnotation> = z
  .record(z.string(), annotationSchema)
  .parse(JSON.parse(annotationBytes));
const assetManifestBytes = await readFile(resolve(source, "image-manifest.json"), "utf8");
const assetManifest = z
  .object({
    permissionHash: z.literal(permissionHash),
    assets: z.array(
      z.object({
        url: z.string(),
        file: z.string().regex(/^images\/[a-f0-9]{64}\.(png|jpg|webp|gif)$/),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        mime: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
      }),
    ),
  })
  .parse(JSON.parse(assetManifestBytes));
const assets: Record<string, ImportedAsset> = {};
const assetRows = [];
for (const asset of assetManifest.assets) {
  const bytes = await readFile(resolve(source, asset.file));
  if (digest(bytes) !== asset.sha256 || bytes.length > 5 * 1024 * 1024)
    throw new Error("Image file integrity or size differs from its manifest.");
  const ext = assetExtension(bytes, asset.mime);
  assets[asset.url] = {
    src: `/api/content-media/${asset.sha256}.${ext}`,
    archivalOnly: ext === "gif",
    width: ext === "png" ? bytes.readUInt32BE(16) : undefined,
    height: ext === "png" ? bytes.readUInt32BE(20) : undefined,
  };
  assetRows.push({ ...asset, bytes });
}
const files = (await readdir(source)).filter((name) => /^batch-\d{4}\.json$/.test(name)).sort();
const captures = [],
  captureHashes = [];
for (const file of files) {
  const bytes = await readFile(resolve(source, file), "utf8");
  const batch = capturedBatch.parse(JSON.parse(bytes));
  if (batch.permissionHash !== permissionHash)
    throw new Error("Capture permission differs from the provided record.");
  captures.push(batch);
  captureHashes.push({ file, sha256: digest(bytes) });
}
const topicGroups = new Map<string, typeof captures>();
for (const batch of captures) {
  const key = `${batch.category}/${batch.subcategory}`;
  const group = topicGroups.get(key) ?? [];
  group.push(batch);
  topicGroups.set(key, group);
}
const items = [...topicGroups.values()].flatMap((group) => mergeBatches(group));
const rows = items.map((item) =>
  prepareSourceSnapshot(
    item,
    permission,
    assets,
    annotations[`${item.category}/${item.subcategory}/${item.key}`] ?? annotations[item.key],
  ),
);
// Conflicting keys under a duplicate content identity are never resolved by taking the first answer.
const identities = new Map<string, ProviderSnapshotInput[]>();
for (const row of rows)
  if (row.native) {
    const group = identities.get(row.native.externalId) ?? [];
    group.push(row);
    identities.set(row.native.externalId, group);
  }
for (const group of identities.values()) {
  const responses = new Set(
    group.map((row) => {
      const q = row.native;
      return JSON.stringify(q?.kind === "order" ? q.answerOrder : q?.answerChoiceId);
    }),
  );
  const scopes = new Set(group.map((row) => JSON.stringify(row.native?.levels)));
  if (responses.size > 1 || scopes.size > 1)
    for (const row of group) {
      row.native = null;
      row.heldReasons.push(
        "Duplicate-looking source questions have conflicting answer keys or track scopes; reconcile before import.",
      );
    }
}
const expectedBytes = values["expected-manifest"]
  ? await readFile(values["expected-manifest"], "utf8")
  : null;
const expected = expectedBytes
  ? z
      .object({
        mode: z.enum(["export", "feed"]),
        expectedIds: z.record(z.string(), z.array(z.string().min(1).max(1000)).max(100000)),
      })
      .strict()
      .parse(JSON.parse(expectedBytes))
  : null;
const manifestHash = digest(
  JSON.stringify({
    normalizerVersion: 1,
    captures: captureHashes,
    imageManifestHash: digest(assetManifestBytes),
    annotationHash: digest(annotationBytes),
    permissionHash,
    expectedManifestHash: expectedBytes ? digest(expectedBytes) : null,
  }),
);
const nativeIds = new Set(rows.flatMap((r) => (r.native ? [r.native.externalId] : [])));
const summary = {
  manifestHash,
  sourceIds: new Set(rows.map((r) => r.providerQuestionId)).size,
  topicMemberships: rows.length,
  uniqueNativeQuestions: nativeIds.size,
  assets: assetRows.length,
  blockedSourceRecords: rows.filter((r) => !r.native).length,
  sourcesNeedingReview: rows.filter((r) => r.heldReasons.length).length,
  formats: Object.fromEntries(
    ["choice", "error", "order"].map((kind) => [
      kind,
      new Set(rows.filter((r) => r.native?.kind === kind).map((r) => r.native?.externalId)).size,
    ]),
  ),
  tracks: Object.fromEntries(
    ["professional", "subprofessional"].map((level) => [
      level,
      new Set(
        rows
          .filter((r) => r.native?.levels?.includes(level as "professional"))
          .map((r) => r.native?.externalId),
      ).size,
    ]),
  ),
  completeBankVerified: false,
  published: 0,
};
await save("summary.json", summary);
await save("source-records.json", rows);
await save("asset-map.json", assets);
console.log(JSON.stringify(summary));
if (values.commit) {
  if (!values["admin-email"])
    throw new Error("An existing administrator email is required to commit.");
  const db = createDb({ DATABASE_URL: z.url().parse(process.env.DATABASE_URL), DB_POOL_MAX: 2 });
  try {
    const [actor] = await db
      .select({ id: user.id })
      .from(user)
      .innerJoin(userProfile, eq(userProfile.userId, user.id))
      .where(
        and(eq(user.email, values["admin-email"].toLowerCase()), eq(userProfile.role, "admin")),
      );
    if (!actor) throw new Error("Administrator not found.");
    const opened = await openProviderBank(db, actor.id, {
      manifestHash,
      permissionHash,
      mode: expected?.mode ?? "api_sample",
      expectedIds: expected?.expectedIds ?? null,
      report: {
        mediaMap: assets,
        assets: assetRows.length,
        sourceCaptureHashes: captureHashes,
        annotationHash: digest(annotationBytes),
        defaults:
          "English/medium and image descriptions remain draft placeholders until editorial review.",
        observedTopics: topicGroups.size,
      },
    });
    for (const image of assetRows)
      await putContentAsset(db, actor.id, {
        mime: image.mime,
        dataBase64: image.bytes.toString("base64"),
      });
    const receipts: Awaited<ReturnType<typeof importProviderSnapshots>>[] = [];
    let batch: ProviderSnapshotInput[] = [];
    const flush = async () => {
      if (!batch.length) return;
      receipts.push(await importProviderSnapshots(db, actor.id, opened.id, batch));
      batch = [];
      await save("import-progress.json", { bankId: opened.id, manifestHash, batches: receipts });
    };
    for (const row of rows) {
      if (batch.length >= 50 || Buffer.byteLength(JSON.stringify([...batch, row])) > 512 * 1024)
        await flush();
      batch.push(row);
    }
    await flush();
    const result = await finalizeProviderBank(db, actor.id, opened.id, !!values["retire-legacy"]);
    await save("import-receipt.json", {
      bankId: opened.id,
      manifestHash,
      batches: receipts,
      ...result,
    });
    console.log(JSON.stringify({ bankId: opened.id, ...result, published: 0 }));
  } finally {
    await db.$client.end();
  }
}
