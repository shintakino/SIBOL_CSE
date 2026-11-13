import { chmod, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import {
  allowedImageUrl,
  annotationsInput,
  type CapturedBatch,
  capturedBatch,
  digest,
  draftBatches,
  mergeBatches,
  permissionInput,
  providerBase,
  quizResponse,
  rasterExtension,
  reviewHtml,
  toDraft,
  topicCatalog,
} from "./content/topnotcher";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    permission: { type: "string" },
    out: { type: "string" },
    rounds: { type: "string", default: "6" },
    "interval-ms": { type: "string" },
    "image-interval-ms": { type: "string", default: "1000" },
    annotations: { type: "string" },
    level: { type: "string", default: "professional" },
  },
});
const command = positionals[0];
if (
  !["collect", "prepare", "images", "review"].includes(command ?? "") ||
  !values.permission ||
  !values.out
)
  throw new Error(
    "Usage: pnpm content:topnotcher <collect|images|prepare|review> --permission FILE --out .cache/content-authoring/NAME [--rounds 6] [--level professional|subprofessional] [--annotations FILE]",
  );
// Bank text/keys and provider media must never enter the public source repository.
const root = resolve(".cache/content-authoring");
const dir = resolve(values.out);
if (!dir.startsWith(`${root}/`))
  throw new Error("Output must be inside ignored .cache/content-authoring/.");
const permissionBytes = await readFile(values.permission, "utf8");
const permission = permissionInput.parse(JSON.parse(permissionBytes));
const permissionHash = digest(permissionBytes);
await mkdir(dir, { recursive: true, mode: 0o700 });
await chmod(dir, 0o700);
async function save(name: string, value: unknown) {
  const path = resolve(dir, name);
  if (!path.startsWith(`${dir}/`)) throw new Error("Invalid artifact path.");
  const partial = `${path}.partial-${process.pid}`;
  try {
    await writeFile(partial, JSON.stringify(value, null, 2), { mode: 0o600 });
    await rename(partial, path);
  } finally {
    await rm(partial, { force: true });
  }
}
async function loadBatches(): Promise<CapturedBatch[]> {
  const files = (await readdir(dir)).filter((f) => /^batch-\d{4}\.json$/.test(f)).sort();
  const batches: CapturedBatch[] = [];
  for (const file of files) {
    const batch = capturedBatch.parse(JSON.parse(await readFile(resolve(dir, file), "utf8")));
    if (batch.permissionHash !== permissionHash)
      throw new Error("Captured permission hash differs; use the original permission record.");
    batches.push(batch);
  }
  return batches;
}
// Both provider responses and images are streamed with a byte budget. No redirects.
async function boundedBody(response: Response, max: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Upstream response has no body.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > max) throw new Error("Upstream response exceeds the byte limit.");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
const intervalMs = values["interval-ms"]
  ? z.coerce.number().int().min(permission.intervalMs).max(60000).parse(values["interval-ms"])
  : Math.max(permission.intervalMs, 15000);
const pause = () => new Promise((done) => setTimeout(done, intervalMs));
const batches = await loadBatches();
if (command === "collect") {
  const rounds = z.coerce.number().int().min(1).max(10).parse(values.rounds);
  // Count failed requests against a persisted lifetime budget too.
  const requestFile = resolve(dir, "requests.json");
  const state = (await Bun.file(requestFile).exists())
    ? z
        .object({
          permissionHash: z.string(),
          attempts: z.number().int().nonnegative(),
          retryAt: z.iso.datetime().nullable().optional(),
        })
        .parse(await Bun.file(requestFile).json())
    : { permissionHash, attempts: 0, retryAt: null };
  if (state.permissionHash !== permissionHash)
    throw new Error("Request budget belongs to a different permission record.");
  if (state.retryAt && Date.parse(state.retryAt) > Date.now())
    throw new Error(`Provider cooldown remains active until ${state.retryAt}.`);
  let requests = state.attempts;
  const errors: { subcategory: string; status: number | null; reason: string }[] = [];
  const summary = [];
  let stop = false;
  for (const topic of topicCatalog) {
    const previous = batches.filter(
      (b) => b.category === topic.category && b.subcategory === topic.subcategory,
    );
    const seen = new Set(previous.flatMap((b) => b.questions.map((q) => String(q.id))));
    let noNew = 0;
    let completed = previous.length;
    for (let round = completed; round < rounds && noNew < 3 && !stop; round++) {
      if (requests >= permission.maxRequests) {
        stop = true;
        break;
      }
      await pause();
      requests++;
      await save("requests.json", { permissionHash, attempts: requests });
      try {
        const response = await fetch(`${providerBase}quiz`, {
          method: "POST",
          redirect: "error",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": "SibolPermittedContentImport/1.0",
          },
          body: JSON.stringify({
            exam: "cse",
            category: topic.category,
            subcategory: topic.subcategory,
            count: 50,
            feedback_mode: "preloaded",
          }),
          signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) {
          if (response.status === 429 || response.status === 503) {
            const retry = response.headers.get("retry-after");
            const until =
              retry && /^\d+$/.test(retry)
                ? Date.now() + Number(retry) * 1000
                : retry
                  ? Date.parse(retry)
                  : Number.NaN;
            const retryAt = new Date(
              Math.max(Date.now() + 60000, Number.isFinite(until) ? until : 0),
            ).toISOString();
            await save("requests.json", { permissionHash, attempts: requests, retryAt });
          }
          errors.push({
            subcategory: topic.subcategory,
            status: response.status,
            reason: "Provider HTTP error; collection stopped without retrying.",
          });
          await response.body?.cancel();
          stop = true;
          break;
        }
        const data = quizResponse.parse(
          JSON.parse(new TextDecoder().decode(await boundedBody(response, 2 * 1024 * 1024))),
        );
        for (const q of data.questions) z.string().min(1).max(1000).parse(q.id);
        const fresh = data.questions.filter((q) => !seen.has(String(q.id)));
        const batch = capturedBatch.parse({
          provider: "topnotcher",
          permissionHash,
          category: topic.category,
          subcategory: topic.subcategory,
          fetchedAt: new Date().toISOString(),
          questions: data.questions,
        });
        // Provider attempt tokens are intentionally not persisted.
        await save(`batch-${String(batches.length + 1).padStart(4, "0")}.json`, batch);
        batches.push(batch);
        for (const q of data.questions) seen.add(String(q.id));
        completed++;
        noNew = fresh.length ? 0 : noNew + 1;
        console.log(
          JSON.stringify({
            topic: topic.subcategory,
            batch: completed,
            received: data.questions.length,
            newIds: fresh.length,
            uniqueIds: seen.size,
          }),
        );
      } catch {
        errors.push({
          subcategory: topic.subcategory,
          status: null,
          reason:
            "Request or response validation failed; collection stopped. No upstream body logged.",
        });
        stop = true;
      }
    }
    summary.push({
      category: topic.category,
      subcategory: topic.subcategory,
      batches: completed,
      uniqueQuestions: seen.size,
      stopped:
        noNew >= 3 ? "three batches without new IDs" : "request/round budget or provider error",
    });
  }
  const items = mergeBatches(batches);
  const report = {
    provider: "topnotcher",
    permissionHash,
    updatedAt: new Date().toISOString(),
    requests,
    uniqueQuestions: items.length,
    conflictingIds: items.filter((q) => q.conflict).length,
    completeBankVerified: false,
    completenessReason:
      "Random quiz sampling has no total count or enumeration endpoint. Neither request budgets nor duplicate-only responses prove completeness.",
    topics: summary,
    errors,
  };
  await save("collection-report.json", report);
  console.log(
    JSON.stringify({
      uniqueQuestions: report.uniqueQuestions,
      conflictingIds: report.conflictingIds,
      completeBankVerified: false,
      errors: errors.length,
    }),
  );
  if (errors.length) process.exitCode = 1;
}
if (command === "images") {
  if (!permission.scopes.includes("images")) throw new Error("Permission does not cover images.");
  const urls = new Set<string>();
  for (const item of mergeBatches(batches)) {
    // Collect question and choice images even for types which need player adaptation.
    const raw = item.raw;
    if (typeof raw.image === "string" && raw.image) urls.add(raw.image);
    if (Array.isArray(raw.choices))
      for (const c of raw.choices) if (typeof c.image === "string" && c.image) urls.add(c.image);
    if (Array.isArray(raw.items))
      for (const i of raw.items) if (typeof i.image === "string" && i.image) urls.add(i.image);
  }
  const assets: { url: string; file: string; sha256: string; mime: string }[] = [];
  const failures: { url: string; reason: string }[] = [];
  const imageInterval = z.coerce
    .number()
    .int()
    .min(1000)
    .max(60000)
    .parse(values["image-interval-ms"]);
  let downloadedBytes = 0;
  let attempted = 0;
  let rateLimited = false;
  const previousManifest = resolve(dir, "image-manifest.json");
  if (await Bun.file(previousManifest).exists()) {
    const previous = z
      .object({
        permissionHash: z.literal(permissionHash),
        assets: z.array(
          z.object({
            url: z.string(),
            file: z.string().regex(/^images\/[a-f0-9]{64}\.(png|jpg|webp|gif)$/),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
            mime: z.string(),
          }),
        ),
      })
      .parse(await Bun.file(previousManifest).json());
    for (const asset of previous.assets) {
      if (!urls.has(asset.url)) continue;
      try {
        const bytes = await readFile(resolve(dir, asset.file));
        if (
          digest(bytes) !== asset.sha256 ||
          !asset.file.endsWith(`.${rasterExtension(bytes, asset.mime)}`)
        )
          continue;
        assets.push(asset);
        downloadedBytes += bytes.length;
        attempted++;
      } catch {
        /* Missing or corrupt staged files are fetched again within the same bounds. */
      }
    }
  }
  await mkdir(resolve(dir, "images"), { recursive: true, mode: 0o700 });
  for (const raw of [...urls].sort()) {
    if (assets.some((a) => a.url === raw)) continue;
    if (attempted >= 500 || downloadedBytes >= 128 * 1024 * 1024) break;
    attempted++;
    try {
      const url = allowedImageUrl(raw);
      await new Promise((done) => setTimeout(done, imageInterval));
      const response = await fetch(url, {
        redirect: "error",
        signal: AbortSignal.timeout(20000),
        headers: {
          Accept: "image/png,image/jpeg,image/webp,image/gif",
          "User-Agent": "SibolPermittedContentImport/1.0",
        },
      });
      if (!response.ok) {
        rateLimited = response.status === 429 || response.status === 503;
        await response.body?.cancel();
        throw new Error("Image HTTP error.");
      }
      const bytes = await boundedBody(response, 5 * 1024 * 1024);
      const mime = response.headers.get("content-type")?.split(";")[0] ?? "";
      const ext = rasterExtension(bytes, mime);
      if (downloadedBytes + bytes.length > 128 * 1024 * 1024) break;
      downloadedBytes += bytes.length;
      const sha256 = digest(bytes);
      const file = `images/${sha256}.${ext}`;
      await writeFile(resolve(dir, file), bytes, { mode: 0o600 });
      assets.push({ url: raw, file, sha256, mime });
    } catch {
      failures.push({
        url: raw,
        reason:
          "Image blocked, unavailable, oversized, timed out or not a supported raster. Review manually.",
      });
    }
    await save("image-manifest.json", {
      permissionHash,
      assets,
      failures,
      deferred: urls.size - attempted,
      rateLimited,
      publicDeploymentReady: false,
    });
    if (attempted % 25 === 0)
      console.log(
        JSON.stringify({
          imageUrls: urls.size,
          attempted,
          downloaded: assets.length,
          failures: failures.length,
        }),
      );
    if (rateLimited) break;
  }
  await save("image-manifest.json", {
    permissionHash,
    assets,
    failures,
    deferred: urls.size - attempted,
    rateLimited,
    publicDeploymentReady: false,
  });
  console.log(
    JSON.stringify({
      imageUrls: urls.size,
      downloaded: assets.length,
      failures: failures.length,
      deferred: urls.size - attempted,
      rateLimited,
      publicDeploymentReady: false,
    }),
  );
}
if (command === "prepare") {
  const level = z.enum(["professional", "subprofessional"]).parse(values.level);
  const annotations = annotationsInput.parse(
    values.annotations ? JSON.parse(await readFile(values.annotations, "utf8")) : {},
  );
  const items = mergeBatches(batches);
  const rows = [];
  const held: { key: string; subcategory: string; reason: string }[] = [];
  let notForTrack = 0;
  for (const item of items) {
    const topic = topicCatalog.find(
      (t) => t.category === item.category && t.subcategory === item.subcategory,
    );
    if (!topic || !(topic.levels as readonly string[]).includes(level)) {
      notForTrack++;
      continue;
    }
    try {
      rows.push(toDraft(item, level, permission, annotations[item.key]));
    } catch (error) {
      held.push({
        key: item.key,
        subcategory: item.subcategory,
        reason:
          error instanceof z.ZodError
            ? "Does not meet native content contract (for example HTML, missing explanation, invalid text or choices); editorial annotation required."
            : error instanceof Error
              ? error.message
              : "Needs editorial review.",
      });
    }
  }
  const output = resolve(dir, `drafts-${level}`);
  await mkdir(output, { recursive: true, mode: 0o700 });
  // Remove stale generated batches when annotations/counts change; captures are immutable.
  const old = (await readdir(output)).filter((f) => /^import-\d{4}\.json$/.test(f));
  const payloads = draftBatches(rows);
  const manifest = [];
  for (let i = 0; i < payloads.length; i++) {
    const payload = payloads[i];
    if (!payload) continue;
    const filename = `import-${String(i + 1).padStart(4, "0")}.json`;
    await writeFile(resolve(output, filename), payload, { mode: 0o600 });
    manifest.push({
      filename,
      sha256: digest(payload),
      bytes: Buffer.byteLength(payload),
      rows: JSON.parse(payload).length,
    });
  }
  const { unlink } = await import("node:fs/promises");
  for (const file of old)
    if (!manifest.some((m) => m.filename === file)) await unlink(resolve(output, file));
  const report = {
    permissionHash,
    level,
    stagedQuestions: items.length,
    notForTrack,
    importableDrafts: rows.length,
    heldForAdaptation: held.length,
    editorialDefaults:
      "English and medium are draft placeholders unless annotated. Human language/difficulty, key, rights and explanation review is required. Nothing is published.",
    batches: manifest,
    held,
  };
  await save(`preparation-${level}.json`, report);
  console.log(
    JSON.stringify({
      level,
      stagedQuestions: items.length,
      importableDrafts: rows.length,
      heldForAdaptation: held.length,
      batches: manifest.length,
      published: 0,
    }),
  );
}
if (command === "review") {
  const path = resolve(dir, "image-manifest.json");
  const manifest = (await Bun.file(path).exists())
    ? z
        .object({
          permissionHash: z.literal(permissionHash),
          assets: z.array(z.object({ url: z.string(), file: z.string() })),
        })
        .parse(await Bun.file(path).json())
    : { assets: [] };
  await writeFile(resolve(dir, "review.html"), reviewHtml(mergeBatches(batches), manifest.assets), {
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      reviewPackCreated: true,
      questions: mergeBatches(batches).length,
      downloadedImages: manifest.assets.length,
    }),
  );
}
