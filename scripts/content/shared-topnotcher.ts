import {
  type QuestionInput,
  type QuestionMedia,
  questionInput,
} from "@sibol-cse/api/learning-contracts";
import type { ProviderSnapshotInput } from "@sibol-cse/api/services/provider-content";
import { providerTopics } from "@sibol-cse/api/study-catalog";
import { z } from "zod";
import { digest, type Permission, providerQuestion, type StagedQuestion } from "./topnotcher";

export type ImportedAsset = { src: string; width?: number; height?: number; archivalOnly: boolean };
export type SourceAnnotation = {
  topicId?: string;
  classificationReason?: string;
  holdReason?: string;
  language?: "english" | "filipino";
  difficulty?: "easy" | "medium" | "hard";
  prompt?: string;
  passage?: string | null;
  explanation?: string;
  image?: { alt: string; descriptionReviewed: boolean };
  choices?: Record<string, { alt: string; descriptionReviewed: boolean }>;
};
const sourceQuestion = providerQuestion.extend({
  instruction: z.string().max(12000).nullish(),
  items: z
    .array(
      z
        .object({
          id: z.string().min(1).max(1000),
          text: z.string().max(100000),
          image: z.string().nullish(),
        })
        .passthrough(),
    )
    .max(12)
    .optional(),
  group: z.string().max(500).nullish(),
});
export function normalizeSharedQuestion(
  item: StagedQuestion,
  permission: Permission,
  assets: Record<string, ImportedAsset>,
  annotation: SourceAnnotation = {},
): { question: QuestionInput; fingerprint: string; holds: string[] } {
  if (item.conflict) throw new Error("Conflicting provider content requires reconciliation.");
  if (annotation.holdReason) throw new Error(annotation.holdReason);
  const source = providerTopics.find(
    (t) => t.category === item.category && t.subcategory === item.subcategory,
  );
  if (!source) throw new Error("Unknown provider category/subcategory.");
  const topicId = annotation.topicId ?? source.topicId;
  if (!topicId) throw new Error("Assign an item-specific native topic before importing.");
  const q = sourceQuestion.parse(item.raw);
  if (!["choice", "error", "order"].includes(q.type))
    throw new Error("Unsupported provider question format.");
  const holds: string[] = [];
  const media = (
    url: string | null | undefined,
    description?: { alt: string; descriptionReviewed: boolean },
  ): QuestionMedia | null => {
    if (!url) return null;
    const asset = assets[url];
    if (!asset) throw new Error("Required source image is missing from the registered asset map.");
    if (asset.archivalOnly)
      throw new Error(
        "Original GIF retained in the source archive; approve a static native image before using this question.",
      );
    if (!description?.descriptionReviewed)
      holds.push("Image descriptions require editorial review before publication.");
    return {
      src: asset.src,
      width: asset.width,
      height: asset.height,
      alt: description?.alt ?? "Description pending editorial review.",
      descriptionReviewed: description?.descriptionReviewed ?? false,
    };
  };
  const imageIdentity = (url: string | null | undefined) =>
    url ? (assets[url]?.src ?? url) : null;
  const options = (q.choices ?? []).map((c) => ({
    sourceId: c.id,
    text: c.text.trim(),
    image: imageIdentity(c.image),
    url: c.image,
  }));
  if (new Set(options.map((c) => c.sourceId)).size !== options.length)
    throw new Error("Duplicate provider choice IDs.");
  if (new Set(options.map((c) => JSON.stringify([c.text, c.image]))).size !== options.length)
    throw new Error("Duplicate-looking choices have ambiguous answer mappings.");
  const ordered = q.items ?? [];
  if (ordered.some((i) => i.image))
    throw new Error("Ordering-item images need an approved format adaptation.");
  if (
    new Set(ordered.map((i) => i.id)).size !== ordered.length ||
    new Set(ordered.map((i) => i.text.trim())).size !== ordered.length
  )
    throw new Error("Ordering item IDs and content must be unique.");
  const choiceId = (c: (typeof options)[number]) =>
    q.type === "error" ? c.sourceId : `c${digest(JSON.stringify([c.text, c.image])).slice(0, 24)}`;
  if (q.type === "error" && options.some((c) => !/^[a-z]$/i.test(c.sourceId)))
    throw new Error("Error-recognition labels require an explicit reviewed mapping.");
  const orderId = (i: (typeof ordered)[number]) => `o${digest(i.text.trim()).slice(0, 24)}`;
  const correct =
    typeof q.correct === "string" ? options.find((c) => c.sourceId === q.correct) : null;
  if (q.type !== "order" && !correct) throw new Error("The provider key must identify one choice.");
  if (
    q.type === "order" &&
    (!Array.isArray(q.correct) ||
      q.correct.length !== ordered.length ||
      new Set(q.correct).size !== ordered.length ||
      q.correct.some((id) => !ordered.some((i) => i.id === id)))
  )
    throw new Error("The provider ordering key must contain every item ID exactly once.");
  const identity = {
    kind: q.type,
    prompt: annotation.prompt ?? q.text,
    instruction: q.instruction || null,
    passage: annotation.passage === undefined ? q.passage || null : annotation.passage,
    highlight: q.highlight || null,
    image: imageIdentity(q.image),
    choices: options
      .map((c) => ({
        text: c.text,
        image: c.image,
        label: q.type === "error" ? c.sourceId.toUpperCase() : null,
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    items: ordered.map((i) => i.text.trim()).sort(),
  };
  const contentHash = digest(JSON.stringify(identity));
  const native = questionInput.parse({
    externalId: `topnotcher-shared-${contentHash.slice(0, 48)}`,
    level: source.levels[0],
    levels: [...source.levels],
    kind: q.type,
    topicId,
    language: annotation.language ?? "english",
    difficulty: annotation.difficulty ?? "medium",
    prompt: identity.prompt,
    instruction: identity.instruction,
    passage: identity.passage,
    highlight: identity.highlight,
    media: media(q.image, annotation.image),
    choices:
      q.type === "order"
        ? []
        : options
            .map((c) => ({
              id: choiceId(c),
              label: q.type === "error" ? c.sourceId.toUpperCase() : undefined,
              text:
                c.text ||
                (c.url
                  ? q.type === "error"
                    ? `Diagram ${c.sourceId.toUpperCase()}`
                    : "Diagram option"
                  : ""),
              media: media(c.url, annotation.choices?.[c.sourceId]),
            }))
            .sort((a, b) => a.id.localeCompare(b.id)),
    answerChoiceId: correct && q.type !== "order" ? choiceId(correct) : null,
    orderItems:
      q.type === "order"
        ? ordered
            .map((i) => ({ id: orderId(i), text: i.text.trim(), label: i.id }))
            .sort((a, b) => a.id.localeCompare(b.id))
        : [],
    answerOrder:
      q.type === "order" && Array.isArray(q.correct)
        ? q.correct.map((id) => {
            const found = ordered.find((i) => i.id === id);
            if (!found) throw new Error("Missing order key item.");
            return orderId(found);
          })
        : null,
    explanation: annotation.explanation ?? q.explanation,
    provider: {
      name: "topnotcher",
      questionId: q.id,
      category: item.category,
      subcategory: item.subcategory,
      group: q.group || undefined,
    },
    source: {
      title: `Topnotcher PH: ${item.subcategory}`,
      author: permission.attribution,
      rights: "permitted",
      rightsStatement: `${permission.attestation} Reference: ${permission.reference}.`,
      url: "https://topnotcher.ph/csc-civil-service-exam-reviewer/",
      references: ["https://topnotcher.ph/wp-json/tph-cse/v1/"],
    },
  });
  const { externalId: _id, source: _source, provider: _provider, ...revision } = native;
  const fingerprint = digest(JSON.stringify(revision));
  if (annotation.classificationReason?.includes("Source General Information bucket"))
    holds.push(
      "Source category differs from the proposed native topic; confirm the item-specific classification.",
    );
  return { question: native, fingerprint, holds: [...new Set(holds)] };
}
export function prepareSourceSnapshot(
  item: StagedQuestion,
  permission: Permission,
  assets: Record<string, ImportedAsset>,
  annotation: SourceAnnotation = {},
): ProviderSnapshotInput {
  const source = providerTopics.find(
    (t) => t.category === item.category && t.subcategory === item.subcategory,
  );
  if (!source) throw new Error("Unknown provider topic.");
  const result: ProviderSnapshotInput = {
    sourceKey: item.key,
    providerQuestionId: item.id,
    category: item.category,
    subcategory: item.subcategory,
    levels: [...source.levels],
    topicId: annotation.topicId ?? source.topicId,
    raw: item.raw,
    fingerprint: digest(JSON.stringify(item.raw)),
    native: null,
    heldReasons: [],
  };
  try {
    const converted = normalizeSharedQuestion(item, permission, assets, annotation);
    result.native = converted.question;
    result.fingerprint = converted.fingerprint;
    result.heldReasons = converted.holds;
  } catch (error) {
    result.heldReasons = [
      error instanceof z.ZodError
        ? `Native validation: ${error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ")
            .slice(0, 900)}`
        : error instanceof Error
          ? error.message.slice(0, 900)
          : "Needs editorial review.",
    ];
  }
  return result;
}
