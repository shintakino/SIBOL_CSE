import { z } from "zod";
import { entityId, studyFilterInput } from "./learning-contracts";
export const reviewQueryInput = z
  .object({
    page: z.number().int().min(0).max(10000).default(0),
    area: studyFilterInput.shape.area.optional(),
    topicId: entityId.optional(),
    providerSubcategory: studyFilterInput.shape.providerSubcategory.optional(),
  })
  .strict()
  .default({ page: 0 });
export const pageInput = z
  .object({ page: z.number().int().min(0).max(10000).default(0) })
  .strict()
  .default({ page: 0 });
export const allocationInput = z
  .object({
    review: z.number().int().min(0).max(100),
    priority: z.number().int().min(0).max(100),
    mixed: z.number().int().min(0).max(100),
  })
  .strict()
  .refine((v) => v.review + v.priority + v.mixed === 100, "Percentages must total 100.");
export const mockInput = z
  .object({
    requestId: z.uuid(),
    kind: z.enum(["short", "full"]),
    mode: z.enum(["strict_mock", "timed_practice"]),
    count: z.union([z.literal(10), z.literal(20), z.literal(30)]).default(10),
    multiplier: z.union([z.literal(100), z.literal(150), z.literal(200)]).default(100),
    area: studyFilterInput.shape.area.optional(),
    topicId: entityId.optional(),
    providerSubcategory: studyFilterInput.shape.providerSubcategory.optional(),
  })
  .strict();
export const taskIdInput = z.object({ id: entityId }).strict();
