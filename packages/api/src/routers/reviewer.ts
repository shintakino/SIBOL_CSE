import { z } from "zod";
import { protectedProcedure } from "../index";
import { itemInput } from "../learning-contracts";
import { reviewerStartInput } from "../reviewer-contracts";
import { reviewerBookmark, reviewerSummary, startReviewer } from "../services/reviewer";

export const reviewerRouter = {
  reviewer: {
    bookmark: protectedProcedure
      .input(itemInput.extend({ saved: z.boolean().optional() }).strict())
      .handler(({ context: c, input: i }) =>
        reviewerBookmark(c.db, c.session.user.id, i.attemptId, i.itemId, i.saved),
      ),
    summary: protectedProcedure.handler(({ context: c }) =>
      reviewerSummary(c.db, c.session.user.id),
    ),
    start: protectedProcedure
      .input(reviewerStartInput)
      .handler(({ context: c, input }) => startReviewer(c.db, c.session.user.id, input)),
  },
};
