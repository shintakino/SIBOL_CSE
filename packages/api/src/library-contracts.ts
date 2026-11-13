import { z } from "zod";
import { entityId, plain } from "./learning-contracts";
export const targetInput = z
  .object({ kind: z.enum(["lesson", "question"]), id: entityId })
  .strict();
export type Target = z.infer<typeof targetInput>;
export const libraryQuery = z
  .object({
    query: z.string().trim().max(120).default(""),
    topicId: entityId.optional(),
    kind: z.enum(["all", "lesson", "question"]).default("all"),
    savedOnly: z.boolean().default(false),
    page: z.number().int().min(0).max(10000).default(0),
  })
  .strict()
  .default({ query: "", kind: "all", savedOnly: false, page: 0 });
export const noteWrite = z
  .object({
    target: targetInput,
    body: plain(10000),
    revision: z.number().int().min(0),
    mutationId: z.uuid(),
  })
  .strict();
export const noteDelete = z
  .object({ target: targetInput, revision: z.number().int().min(0), mutationId: z.uuid() })
  .strict();
export const displayInput = z
  .object({
    theme: z.enum(["light", "dark"]),
    motion: z.enum(["system", "reduce"]),
    inAppReminders: z.boolean(),
    futureEmailOptIn: z.boolean(),
    revision: z.number().int().min(0),
  })
  .strict();
export const deletionInput = z
  .object({ password: z.string().min(1).max(128), confirmation: z.literal("DELETE") })
  .strict();
