import { z } from "zod";
import { protectedProcedure as learner } from "../index";
import { entityId, plain, studyFilterInput } from "../learning-contracts";
import { allocationInput, mockInput, reviewQueryInput, taskIdInput } from "../loop-contracts";
import { dashboardGet, setDedication } from "../services/dashboard";
import { mockOptions, startMock } from "../services/mocks";
import { completeTask, generatePlan, planGet } from "../services/planner";
import { progressSummary } from "../services/progress";
import { reviewNotebook, reviewTomorrow, startReview } from "../services/reviews";
export const studyLoopRouter = {
  review: {
    listDue: learner
      .input(reviewQueryInput)
      .handler(({ context: c, input: { page, ...filters } }) =>
        reviewNotebook(c.db, c.session.user.id, page, filters),
      ),
    start: learner
      .input(
        z
          .object({
            requestId: z.uuid(),
            count: z.number().int().min(1).max(20).default(10),
            area: studyFilterInput.shape.area.optional(),
            topicId: entityId.optional(),
            providerSubcategory: studyFilterInput.shape.providerSubcategory.optional(),
          })
          .strict(),
      )
      .handler(({ context: c, input: i }) =>
        startReview(c.db, c.session.user.id, i.requestId, i.count, {
          area: i.area,
          topicId: i.topicId,
          providerSubcategory: i.providerSubcategory,
        }),
      ),
    tomorrow: learner
      .input(z.object({ questionId: entityId, requestId: z.uuid() }).strict())
      .handler(({ context: c, input: i }) =>
        reviewTomorrow(c.db, c.session.user.id, i.questionId, i.requestId),
      ),
  },
  plan: {
    get: learner.handler(({ context: c }) => planGet(c.db, c.session.user.id)),
    generate: learner
      .input(z.object({ requestId: z.uuid(), allocation: allocationInput.optional() }).strict())
      .handler(({ context: c, input: i }) =>
        generatePlan(c.db, c.session.user.id, i.requestId, i.allocation),
      ),
    completeTask: learner
      .input(taskIdInput)
      .handler(({ context: c, input: i }) => completeTask(c.db, c.session.user.id, i.id)),
  },
  dashboard: {
    get: learner.handler(({ context: c }) => dashboardGet(c.db, c.session.user.id)),
    setDedication: learner
      .input(z.object({ dedication: plain(200).nullable() }).strict())
      .handler(({ context: c, input: i }) => setDedication(c.db, c.session.user.id, i.dedication)),
  },
  mocks: {
    list: learner.handler(({ context: c }) => mockOptions(c.db, c.session.user.id)),
    start: learner
      .input(mockInput)
      .handler(({ context: c, input: i }) => startMock(c.db, c.session.user.id, i)),
  },
  progress: {
    summary: learner.handler(({ context: c }) => progressSummary(c.db, c.session.user.id)),
  },
};
