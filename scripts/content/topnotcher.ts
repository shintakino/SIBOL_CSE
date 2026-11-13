import { createHash } from "node:crypto";
import { type QuestionInput, questionInput } from "@sibol-cse/api/learning-contracts";
import { z } from "zod";

export const providerBase = "https://topnotcher.ph/wp-json/tph-cse/v1/";
export const providerSource = "https://topnotcher.ph/civil-service-exam-reviewer/";
export { providerTopics as topicCatalog } from "@sibol-cse/api/study-catalog";

import { providerTopics as topicCatalog } from "@sibol-cse/api/study-catalog";

export const permissionInput = z
  .object({
    provider: z.literal("topnotcher"),
    attestation: z.string().trim().min(10).max(500),
    recordedAt: z.iso.datetime(),
    reference: z.string().trim().min(1).max(250),
    attribution: z.string().trim().min(1).max(200),
    scopes: z.array(z.enum(["questions", "answers", "explanations", "images"])),
    intervalMs: z.number().int().min(2000).max(60000),
    maxRequests: z.number().int().min(1).max(200),
  })
  .strict()
  .refine(
    (p) => (["questions", "answers", "explanations"] as const).every((s) => p.scopes.includes(s)),
    "Permission must cover questions, answers and explanations.",
  );
export type Permission = z.infer<typeof permissionInput>;

export const providerQuestion = z
  .object({
    id: z.string().min(1).max(1000),
    type: z.string().min(1).max(50),
    text: z.string().max(100000).default(""),
    image: z.string().max(4000).nullish(),
    passage: z.string().max(100000).nullish(),
    highlight: z.string().max(10000).nullish(),
    explanation: z.string().max(100000).nullish(),
    correct: z.union([z.string().max(1000), z.array(z.string().max(1000)).max(100)]).optional(),
    choices: z
      .array(
        z
          .object({
            id: z.string().min(1).max(1000),
            text: z.string().max(100000).default(""),
            image: z.string().max(4000).nullish(),
          })
          .passthrough(),
      )
      .max(100)
      .optional(),
  })
  .passthrough();
export const quizResponse = z
  .object({
    exam: z.literal("cse"),
    feedback_mode: z.literal("preloaded"),
    questions: z.array(z.record(z.string(), z.unknown())).min(1).max(50),
  })
  .passthrough();

export function digest(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
export function providerKey(id: string): string {
  return digest(id).slice(0, 48);
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export function questionFingerprint(raw: Record<string, unknown>): string {
  const value = { ...raw };
  // Provider shuffle order is not a content change; IDs and answer keys remain significant.
  for (const field of ["choices", "items"]) {
    const entries = value[field];
    if (Array.isArray(entries))
      value[field] = [...entries].sort((a, b) => String(a?.id).localeCompare(String(b?.id)));
  }
  return digest(JSON.stringify(canonical(value)));
}

export const capturedBatch = z
  .object({
    provider: z.literal("topnotcher"),
    permissionHash: z.string().regex(/^[a-f0-9]{64}$/),
    category: z.string(),
    subcategory: z.string(),
    fetchedAt: z.iso.datetime(),
    questions: z.array(z.record(z.string(), z.unknown())).min(1).max(50),
  })
  .strict();
export type CapturedBatch = z.infer<typeof capturedBatch>;
export type StagedQuestion = {
  key: string;
  id: string;
  category: string;
  subcategory: string;
  raw: Record<string, unknown>;
  conflict: boolean;
};
export function mergeBatches(batches: CapturedBatch[]): StagedQuestion[] {
  const all = new Map<string, StagedQuestion>();
  for (const batch of batches) {
    if (
      !topicCatalog.some(
        (t) => t.category === batch.category && t.subcategory === batch.subcategory,
      )
    )
      throw new Error("Capture contains an unknown provider topic.");
    for (const raw of batch.questions) {
      const id = z.string().min(1).parse(raw.id);
      const key = providerKey(id);
      const previous = all.get(key);
      if (previous) {
        if (
          questionFingerprint(previous.raw) !== questionFingerprint(raw) ||
          previous.category !== batch.category ||
          previous.subcategory !== batch.subcategory
        )
          previous.conflict = true;
      } else
        all.set(key, {
          key,
          id,
          category: batch.category,
          subcategory: batch.subcategory,
          raw,
          conflict: false,
        });
    }
  }
  return [...all.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function allowedImageUrl(raw: string): URL {
  const url = new URL(raw, "https://topnotcher.ph/");
  if (
    url.protocol !== "https:" ||
    !["topnotcher.ph", "www.topnotcher.ph"].includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    !url.pathname.startsWith("/wp-content/uploads/") ||
    url.search ||
    url.hash
  )
    throw new Error("Only direct HTTPS Topnotcher upload images are allowed.");
  return url;
}
export function rasterExtension(bytes: Uint8Array, mime: string): "png" | "jpg" | "webp" | "gif" {
  const starts = (...values: number[]) => values.every((v, i) => bytes[i] === v);
  if (mime === "image/png" && starts(137, 80, 78, 71, 13, 10, 26, 10)) return "png";
  if (mime === "image/jpeg" && starts(255, 216, 255)) return "jpg";
  const header = new TextDecoder().decode(bytes.slice(0, 6));
  if (mime === "image/gif" && ["GIF87a", "GIF89a"].includes(header)) return "gif";
  if (
    mime === "image/webp" &&
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  )
    return "webp";
  throw new Error("Image MIME/signature is not a supported PNG, JPEG, WebP or archival GIF.");
}

export const annotationsInput = z.record(
  z.string(),
  z
    .object({
      topicId: z.string().optional(),
      language: z.enum(["english", "filipino"]).optional(),
      difficulty: z.enum(["easy", "medium", "hard"]).optional(),
      prompt: z.string().optional(),
      passage: z.string().nullable().optional(),
      explanation: z.string().optional(),
      image: z.object({ src: z.string(), alt: z.string() }).optional(),
    })
    .strict(),
);
export type Annotation = z.infer<typeof annotationsInput>[string];
export function toDraft(
  item: StagedQuestion,
  level: "professional" | "subprofessional",
  permission: Permission,
  annotation: Annotation = {},
): QuestionInput {
  if (item.conflict)
    throw new Error(
      "Provider ID has conflicting content or topic assignments; reconcile snapshots.",
    );
  const t = topicCatalog.find(
    (t) => t.category === item.category && t.subcategory === item.subcategory,
  );
  if (!t || !(t.levels as readonly string[]).includes(level))
    throw new Error("Topic does not support this track.");
  const q = providerQuestion.parse(item.raw);
  if (!["choice", "error"].includes(q.type))
    throw new Error("Question type requires player adaptation; preserved in staging.");
  if (q.choices?.some((c) => c.image))
    throw new Error("Image choices require player adaptation; preserved in staging.");
  if (q.image && !annotation.image)
    throw new Error("Question image needs reviewed alt text and a deployed local media path.");
  if (!q.image && annotation.image)
    throw new Error("Image annotation does not match the captured question.");
  if (typeof q.correct !== "string") throw new Error("Missing single-choice provider answer key.");
  if (!q.choices?.length) throw new Error("Missing provider choices.");
  if (new Set(q.choices.map((c) => c.id)).size !== q.choices.length)
    throw new Error("Duplicate provider choice IDs.");
  const index = q.choices.findIndex((c) => c.id === q.correct);
  if (index < 0) throw new Error("Provider key does not identify a choice.");
  const topicId = annotation.topicId ?? t.topicId;
  // General information must be mapped to one of the four actual native topics.
  if (
    !topicId ||
    (t.category === "general_information" &&
      ![
        "general-constitution",
        "general-public-service-ethics",
        "general-peace-and-human-rights",
        "general-environmental-protection",
      ].includes(topicId)) ||
    (t.category !== "general_information" && topicId !== t.topicId)
  )
    throw new Error("An item-specific native topic assignment is required.");
  const prompt =
    annotation.prompt ?? (q.highlight ? `${q.text}\n\nHighlighted text: ${q.highlight}` : q.text);
  return questionInput.parse({
    externalId: `topnotcher-${level}-${item.key}`,
    level,
    topicId,
    language: annotation.language ?? "english",
    difficulty: annotation.difficulty ?? "medium",
    prompt,
    passage: annotation.passage === undefined ? q.passage || null : annotation.passage,
    choices: q.choices.map((c, i) => ({ id: `c${i + 1}`, text: c.text })),
    answerChoiceId: `c${index + 1}`,
    explanation: annotation.explanation ?? q.explanation,
    media: annotation.image ?? null,
    source: {
      title: `Topnotcher PH: ${t.subcategory}`,
      author: permission.attribution,
      rights: "permitted",
      rightsStatement: `${permission.attestation} Reference: ${permission.reference}. Provider item SHA-256: ${digest(item.id)}.`,
      url: providerSource,
      references: [providerBase],
    },
  });
}

export function draftBatches(rows: QuestionInput[]): string[] {
  const batches: string[] = [];
  let current: QuestionInput[] = [];
  for (const row of rows) {
    const candidate = [...current, row];
    if (candidate.length > 100 || Buffer.byteLength(JSON.stringify(candidate)) > 512 * 1024) {
      if (!current.length) throw new Error("One question exceeds the native import byte limit.");
      batches.push(JSON.stringify(current));
      current = [row];
      if (Buffer.byteLength(JSON.stringify(current)) > 512 * 1024)
        throw new Error("One question exceeds the native import byte limit.");
    } else current = candidate;
  }
  if (current.length) batches.push(JSON.stringify(current));
  return batches;
}

export function reviewHtml(
  items: StagedQuestion[],
  images: { url: string; file: string }[],
): string {
  const escapeText = (value: unknown) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
    );
  const media = new Map(
    images
      .filter((a) => /^images\/[a-f0-9]{64}\.(png|jpg|webp|gif)$/.test(a.file))
      .map((a) => [a.url, a.file]),
  );
  const image = (url: unknown) => {
    if (typeof url !== "string" || !url) return "";
    const file = media.get(url);
    if (!file) return "<p><strong>Image not downloaded; review the image manifest.</strong></p>";
    if (file.endsWith(".gif"))
      return `<p><a href="${escapeText(file)}">Open original GIF for review (may animate; requires native media adaptation).</a></p>`;
    return `<figure><img src="${escapeText(file)}" alt="Provider image for editorial review; a meaningful learner description is still required." loading="lazy"></figure>`;
  };
  const records = (raw: unknown): Record<string, unknown>[] =>
    Array.isArray(raw)
      ? raw.filter(
          (v): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v),
        )
      : [];
  const articles = items
    .map((item, i) => {
      const q = item.raw;
      const options = records(q.choices)
        .map(
          (c) =>
            `<li><code>${escapeText(c.id)}</code>: ${escapeText(c.text)}${image(c.image)}</li>`,
        )
        .join("");
      const ordering = records(q.items)
        .map(
          (c) =>
            `<li><code>${escapeText(c.id)}</code>: ${escapeText(c.text)}${image(c.image)}</li>`,
        )
        .join("");
      return `<article id="${item.key}"><h2>${i + 1}. ${escapeText(item.subcategory)}</h2><p>Provider ID: <code>${escapeText(item.id)}</code> · Type: ${escapeText(q.type)}${item.conflict ? " · CONFLICT: reconcile snapshots" : ""}</p><p>Annotation key: <code>${item.key}</code></p><blockquote>${escapeText(q.passage)}</blockquote>${image(q.image)}<p>${escapeText(q.text)}</p>${q.highlight ? `<p>Highlighted text: ${escapeText(q.highlight)}</p>` : ""}<ol>${options || ordering}</ol><p><strong>Provider key (unreviewed):</strong> <code>${escapeText(Array.isArray(q.correct) ? JSON.stringify(q.correct) : q.correct)}</code></p><p><strong>Provider explanation (unreviewed):</strong> ${escapeText(q.explanation)}</p></article>`;
    })
    .join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' file:; style-src 'unsafe-inline'"><title>Private Topnotcher content review</title><style>body{max-width:60rem;margin:2rem auto;padding:1rem;font:1rem/1.6 system-ui;background:#f8f7f3;color:#202b26}article{background:white;padding:1.5rem;margin:2rem 0;border:1px solid #dedfd6;border-radius:1rem}p,blockquote,li{white-space:pre-wrap;overflow-wrap:anywhere}img{max-width:100%;height:auto}figure{margin:1rem 0}code{overflow-wrap:anywhere}</style></head><body><h1>Private Topnotcher review pack</h1><p>${items.length} unique provider IDs. All keys and explanations below are provider-supplied and unreviewed. This pack includes unsupported question types and held items. Collection does not certify a complete bank or grant publication approval. Images are private local review copies; native player support and accessible descriptions need separate review. Attribution: Topnotcher PH.</p>${articles}</body></html>`;
}
