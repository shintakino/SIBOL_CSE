import { z } from "zod";
import { entityId, studyFilterInput } from "./learning-contracts";

export const reviewerStartInput = studyFilterInput
  .extend({
    mode: z.enum(["daily", "quick10", "topic", "missed", "bookmarks", "retake"]),
    requestId: z.uuid(),
    attemptId: entityId.optional(),
  })
  .strict();
export type ReviewerStartInput = z.infer<typeof reviewerStartInput>;
