import { z } from "zod";
import { providerTopics } from "./study-catalog";

export const entityId = z.string().min(1).max(100);
export const examLevel = z.enum(["professional", "subprofessional"]);
export const plain = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((v) => !/<\/?[a-z!][^>]*>/i.test(v), "Use plain text, not HTML.");
export const localMedia = z
  .object({
    src: z
      .string()
      .regex(
        /^(?:\/media\/[a-zA-Z0-9_/-]+\.(?:png|jpe?g|webp)|\/api\/content-media\/[a-f0-9]{64}\.(?:png|jpg|webp))$/,
      ),
    alt: plain(300),
    descriptionReviewed: z.boolean().optional(),
    width: z.number().int().min(1).max(10000).optional(),
    height: z.number().int().min(1).max(10000).optional(),
  })
  .strict()
  .refine(
    (image) =>
      image.descriptionReviewed !== true || !/pending.*review|review.*pending/i.test(image.alt),
    "Replace the pending description before marking it reviewed.",
  );
export type QuestionMedia = z.infer<typeof localMedia>;
const optionId = z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/);
export const studyFilterInput = z
  .object({
    area: z
      .enum(["all", "verbal", "numerical", "analytical", "general", "clerical"])
      .default("all"),
    topicId: entityId.default("mixed"),
    providerSubcategory: z.string().min(1).max(100).nullable().default(null),
  })
  .strict();
export type StudyFilter = z.infer<typeof studyFilterInput>;
export const contentBlock = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: plain(12000) }).strict(),
  z.object({ type: z.literal("math"), text: plain(1000) }).strict(),
  z
    .object({
      type: z.literal("table"),
      caption: plain(300),
      headers: z.array(plain(100)).min(1).max(8),
      rows: z
        .array(z.array(plain(500)).min(1).max(8))
        .min(1)
        .max(30),
    })
    .strict()
    .refine(
      (v) => v.rows.every((r) => r.length === v.headers.length),
      "Table rows must match headers.",
    ),
  z
    .object({
      type: z.literal("diagram"),
      caption: plain(300),
      steps: z.array(plain(500)).min(2).max(12),
    })
    .strict(),
  z
    .object({
      type: z.literal("media"),
      ...localMedia.shape,
      src: z.string().regex(/^\/media\/[a-zA-Z0-9_/-]+\.(png|jpe?g|webp)$/),
    })
    .strict(),
]);
const section = z.array(contentBlock).min(1).max(20);
export const lessonStructure = z
  .object({ concept: section, workedExample: section, commonMistake: section, technique: section })
  .strict();
export const sourceInput = z
  .object({
    title: plain(200),
    author: plain(200),
    rights: z.enum(["original", "licensed", "permitted"]),
    rightsStatement: plain(1000),
    url: z
      .url()
      .refine((v) => new URL(v).protocol === "https:", "Use HTTPS references.")
      .nullable(),
    references: z
      .array(z.url().refine((v) => new URL(v).protocol === "https:"))
      .max(10)
      .default([]),
  })
  .strict();
export const questionInput = z
  .object({
    externalId: z.string().trim().min(1).max(100),
    level: examLevel,
    levels: z.array(examLevel).min(1).max(2).optional(),
    kind: z.enum(["choice", "error", "order"]).default("choice"),
    instruction: plain(12000).nullable().default(null),
    highlight: plain(2000).nullable().default(null),
    orderItems: z
      .array(z.object({ id: optionId, text: plain(4000), label: plain(40).optional() }).strict())
      .max(12)
      .default([]),
    answerOrder: z.array(optionId).min(2).max(12).nullable().default(null),
    provider: z
      .object({
        name: z.literal("topnotcher"),
        questionId: z.string().min(1).max(1000),
        category: z.string().min(1).max(100),
        subcategory: z.string().min(1).max(100),
        group: z.string().max(500).optional(),
      })
      .strict()
      .nullable()
      .default(null),
    topicId: entityId,
    language: z.enum(["english", "filipino"]),
    difficulty: z.enum(["easy", "medium", "hard"]),
    prompt: plain(12000),
    choices: z
      .array(
        z
          .object({
            id: optionId,
            text: plain(4000),
            label: plain(40).nullable().optional(),
            media: localMedia.nullable().optional(),
          })
          .strict(),
      )
      .max(6),
    answerChoiceId: z.string().min(1).max(40).nullable().default(null),
    explanation: plain(12000),
    passage: plain(20000).nullable().default(null),
    media: localMedia.nullable().default(null),
    distractorExplanations: z.record(z.string(), plain(4000)).default({}),
    source: sourceInput,
  })
  .strict()
  .superRefine((v, c) => {
    if (v.levels && (new Set(v.levels).size !== v.levels.length || !v.levels.includes(v.level)))
      c.addIssue({
        code: "custom",
        message: "Supported levels must be unique and include the primary level.",
      });
    if (
      v.provider &&
      !providerTopics.some(
        (t) =>
          t.category === v.provider?.category &&
          t.subcategory === v.provider.subcategory &&
          (v.levels ?? [v.level]).every((level) => (t.levels as readonly string[]).includes(level)),
      )
    )
      c.addIssue({
        code: "custom",
        message: "Provider category/subcategory must support all selected tracks.",
      });
    if (v.kind === "order") {
      const ids = v.orderItems.map((i) => i.id);
      if (
        ids.length < 2 ||
        new Set(ids).size !== ids.length ||
        !v.answerOrder ||
        v.answerOrder.length !== ids.length ||
        new Set(v.answerOrder).size !== ids.length ||
        v.answerOrder.some((id) => !ids.includes(id)) ||
        v.answerChoiceId !== null ||
        v.choices.length
      )
        c.addIssue({
          code: "custom",
          message:
            "Ordering keys must contain every unique item exactly once, without single-choice fields.",
        });
    } else if (
      v.choices.length < 2 ||
      v.orderItems.length ||
      v.answerOrder !== null ||
      !v.choices.some((x) => x.id === v.answerChoiceId)
    ) {
      c.addIssue({
        code: "custom",
        message:
          "Choice questions require two or more choices and one matching key, without ordering fields.",
      });
    }
    if (new Set(v.choices.map((x) => x.id)).size !== v.choices.length)
      c.addIssue({ code: "custom", message: "Choice IDs must be unique." });
    if (Object.keys(v.distractorExplanations).some((id) => !v.choices.some((x) => x.id === id)))
      c.addIssue({ code: "custom", message: "Distractor explanations must refer to choices." });
  });
export const lessonInput = z
  .object({
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(120),
    title: plain(200),
    topicId: entityId,
    levels: z.array(examLevel).min(1).max(2),
    structure: lessonStructure,
    source: sourceInput,
  })
  .strict();
export const reviewInput = z
  .object({
    kind: z.enum(["question", "lesson"]),
    versionId: entityId,
    checklist: z
      .object({
        accurate: z.literal(true),
        explanation: z.literal(true),
        rights: z.literal(true),
        alignment: z.literal(true),
        accessible: z.literal(true),
      })
      .strict(),
  })
  .strict();
export const publishInput = z
  .object({
    kind: z.enum(["question", "lesson"]),
    versionId: entityId,
    erratum: plain(2000).nullable().default(null),
  })
  .strict();
export const profileInput = z
  .object({
    level: examLevel,
    itemCount: z.number().int().min(1).max(500),
    durationMinutes: z.number().int().min(1).max(600),
    diagnosticCount: z.number().int().min(1).max(120).default(30),
    sourceUrl: z
      .url()
      .refine(
        (v) => new URL(v).protocol === "https:" && /(^|\.)csc\.gov\.ph$/.test(new URL(v).hostname),
        "Use an official CSC HTTPS source.",
      ),
    sourceTitle: plain(300),
    publishedOn: z.iso.date().nullable(),
    verifiedOn: z.iso.date(),
    announcementChecked: z.literal(true),
    edqExcluded: z.literal(true),
  })
  .strict();
export const createPracticeInput = z
  .object({
    topicId: entityId,
    area: studyFilterInput.shape.area.optional(),
    providerSubcategory: studyFilterInput.shape.providerSubcategory.optional(),
    difficulty: z.enum(["any", "easy", "medium", "hard"]),
    count: z.union([z.literal(5), z.literal(10), z.literal(20)]),
    unseenFirst: z.boolean(),
    requestId: z.uuid(),
  })
  .strict();
export const answerInput = z
  .object({
    attemptId: entityId,
    itemId: entityId,
    selectedChoiceId: z.string().max(40).nullable(),
    selectedOrder: z.array(optionId).min(2).max(12).nullable().optional(),
    expectedRevision: z.number().int().min(0),
    mutationId: z.uuid(),
    confidence: z.enum(["guessed", "unsure", "confident"]).nullable().default(null),
  })
  .strict();
export const attemptIdInput = z.object({ attemptId: entityId }).strict();
export const itemInput = z.object({ attemptId: entityId, itemId: entityId }).strict();
export type QuestionInput = z.infer<typeof questionInput>;
export type LessonInput = z.infer<typeof lessonInput>;
export type LessonStructure = z.infer<typeof lessonStructure>;
export type ContentBlock = z.infer<typeof contentBlock>;
export type SourceInput = z.infer<typeof sourceInput>;
export type AnswerInput = z.infer<typeof answerInput>;
export type PracticeInput = z.infer<typeof createPracticeInput>;
