import { mockBlueprintVersion, questionIssue } from "@sibol-cse/db/schema";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure as admin, protectedProcedure as learner } from "../index";
import {
  answerInput,
  attemptIdInput,
  createPracticeInput,
  entityId,
  examLevel,
  itemInput,
  lessonInput,
  plain,
  profileInput,
  publishInput,
  questionInput,
  reviewInput,
} from "../learning-contracts";
import * as attempts from "../services/attempts";
import * as catalog from "../services/catalog";
import * as content from "../services/content";
import * as lessons from "../services/lessons";

const idInput = z.object({ id: entityId }).strict();
export const learningRouter = {
  topics: { list: learner.handler(({ context: c }) => content.topicList(c.db)) },
  content: {
    list: admin
      .input(
        z
          .object({
            query: z.string().trim().max(120).default(""),
            page: z.number().int().min(0).max(1000).default(0),
          })
          .strict()
          .default({ query: "", page: 0 }),
      )
      .handler(({ context: c, input: i }) =>
        content.adminContent(c.db, c.session.user.id, i.query, i.page),
      ),
    question: admin
      .input(idInput)
      .handler(({ context: c, input: i }) =>
        content.questionDetails(c.db, c.session.user.id, i.id),
      ),
    createQuestion: admin
      .input(z.object({ question: questionInput, correctionId: entityId.optional() }).strict())
      .handler(({ context: c, input: i }) =>
        content.saveQuestionDraft(c.db, c.session.user.id, i.question, i.correctionId),
      ),
    createLesson: admin
      .input(lessonInput)
      .handler(({ context: c, input: i }) => content.saveLessonDraft(c.db, c.session.user.id, i)),
    review: admin
      .input(reviewInput)
      .handler(({ context: c, input: i }) =>
        content.reviewContent(c.db, c.session.user.id, i.kind, i.versionId, i.checklist),
      ),
    publish: admin
      .input(publishInput)
      .handler(({ context: c, input: i }) =>
        content.publishContent(c.db, c.session.user.id, i.kind, i.versionId, i.erratum),
      ),
    retire: admin
      .input(
        z
          .object({
            kind: z.enum(["question", "lesson"]),
            versionId: entityId,
            reason: plain(2000),
          })
          .strict(),
      )
      .handler(({ context: c, input: i }) =>
        content.retireContent(c.db, c.session.user.id, i.kind, i.versionId, i.reason),
      ),
    setTopicEnabled: admin
      .input(z.object({ id: entityId, enabled: z.boolean() }).strict())
      .handler(async ({ context: c, input: i }) => {
        const { topic, auditEvent } = await import("@sibol-cse/db/schema");
        const { eq, sql } = await import("drizzle-orm");
        return c.db.transaction(async (tx) => {
          const { assertAdmin } = await import("../services/learning-shared");
          await assertAdmin(tx, c.session.user.id);
          await tx.execute(sql`select pg_advisory_xact_lock(712031)`);
          await tx.update(topic).set({ enabled: i.enabled }).where(eq(topic.id, i.id));
          await tx.insert(auditEvent).values({
            actorId: c.session.user.id,
            action: i.enabled ? "topic.enabled" : "topic.disabled",
            targetId: i.id,
          });
          return { updated: true };
        });
      }),
  },
  imports: {
    validate: admin
      .input(
        z.object({ format: z.enum(["json", "csv"]), file: z.string().min(1).max(524288) }).strict(),
      )
      .handler(({ context: c, input: i }) =>
        content.validateImport(c.db, c.session.user.id, i.format, i.file),
      ),
    commit: admin
      .input(idInput)
      .handler(({ context: c, input: i }) => content.commitImport(c.db, c.session.user.id, i.id)),
  },
  profiles: {
    list: admin.handler(async ({ context: c }) => ({
      profiles: await catalog.profileList(c.db),
      blueprints: await c.db
        .select()
        .from(mockBlueprintVersion)
        .orderBy(desc(mockBlueprintVersion.version))
        .limit(100),
    })),
    create: admin
      .input(profileInput)
      .handler(({ context: c, input: i }) => catalog.createProfile(c.db, c.session.user.id, i)),
    activate: admin
      .input(idInput)
      .handler(({ context: c, input: i }) =>
        catalog.activateProfile(c.db, c.session.user.id, i.id),
      ),
    inventory: admin
      .input(z.object({ level: examLevel }).strict())
      .handler(({ context: c, input: i }) => catalog.inventory(c.db, i.level)),
    launch: admin
      .input(z.object({ level: examLevel }).strict())
      .handler(({ context: c, input: i }) => catalog.launchLevel(c.db, c.session.user.id, i.level)),
  },
  blueprints: {
    create: admin
      .input(
        z
          .object({
            profileId: entityId,
            quotas: z.record(entityId, z.number().int().min(0).max(500)),
          })
          .strict(),
      )
      .handler(({ context: c, input: i }) =>
        catalog.createBlueprint(c.db, c.session.user.id, i.profileId, i.quotas),
      ),
    buildForms: admin
      .input(idInput)
      .handler(({ context: c, input: i }) => catalog.buildForms(c.db, c.session.user.id, i.id)),
  },
  issues: {
    list: admin.handler(({ context: c }) =>
      c.db
        .select({
          id: questionIssue.id,
          versionId: questionIssue.questionVersionId,
          category: questionIssue.category,
          description: questionIssue.description,
          status: questionIssue.status,
          resolution: questionIssue.resolution,
        })
        .from(questionIssue)
        .orderBy(desc(questionIssue.createdAt))
        .limit(100),
    ),
    resolve: admin
      .input(z.object({ id: entityId, resolution: plain(2000), quarantine: z.boolean() }).strict())
      .handler(({ context: c, input: i }) =>
        content.resolveIssue(c.db, c.session.user.id, i.id, i.resolution, i.quarantine),
      ),
    report: learner
      .input(
        itemInput
          .extend({
            category: z.enum(["wrong_answer", "unclear", "typo", "rights"]),
            description: plain(2000),
          })
          .strict(),
      )
      .handler(({ context: c, input: i }) =>
        attempts.reportIssue(
          c.db,
          c.session.user.id,
          i.attemptId,
          i.itemId,
          i.category,
          i.description,
        ),
      ),
  },
  lessons: {
    list: learner.handler(({ context: c }) => lessons.listLessons(c.db, c.session.user.id)),
    get: learner
      .input(z.object({ slug: z.string().max(120), latest: z.boolean().default(false) }).strict())
      .handler(({ context: c, input: i }) =>
        lessons.getLesson(c.db, c.session.user.id, i.slug, i.latest),
      ),
    saveProgress: learner
      .input(
        z
          .object({
            versionId: entityId,
            location: z.enum(["concept", "workedExample", "commonMistake", "technique"]),
            revision: z.number().int().min(0),
            complete: z.boolean().default(false),
          })
          .strict(),
      )
      .handler(({ context: c, input: i }) =>
        lessons.saveLessonProgress(
          c.db,
          c.session.user.id,
          i.versionId,
          i.location,
          i.revision,
          i.complete,
        ),
      ),
  },
  practice: {
    create: learner
      .input(createPracticeInput)
      .handler(({ context: c, input: i }) =>
        attempts.createAttempt(c.db, c.session.user.id, "practice", i),
      ),
  },
  diagnostic: {
    options: learner.handler(({ context: c }) =>
      attempts.diagnosticOptions(c.db, c.session.user.id),
    ),
    create: learner
      .input(z.object({ requestId: z.uuid() }).strict())
      .handler(({ context: c, input: i }) =>
        attempts.createAttempt(c.db, c.session.user.id, "diagnostic", i),
      ),
    skip: learner.handler(({ context: c }) => attempts.skipDiagnostic(c.db, c.session.user.id)),
  },
  attempts: {
    clock: learner
      .input(attemptIdInput)
      .handler(({ context: c, input: i }) =>
        attempts.attemptClock(c.db, c.session.user.id, i.attemptId),
      ),
    delete: learner
      .input(attemptIdInput)
      .handler(({ context: c, input: i }) =>
        attempts.deleteAttempt(c.db, c.session.user.id, i.attemptId),
      ),
    list: learner.handler(({ context: c }) => attempts.listAttempts(c.db, c.session.user.id)),
    get: learner
      .input(attemptIdInput)
      .handler(({ context: c, input: i }) =>
        attempts.getAttempt(c.db, c.session.user.id, i.attemptId),
      ),
    saveAnswer: learner
      .input(answerInput)
      .handler(({ context: c, input: i }) => attempts.saveAnswer(c.db, c.session.user.id, i)),
    commit: learner
      .input(itemInput.extend({ revision: z.number().int().min(0) }).strict())
      .handler(({ context: c, input: i }) =>
        attempts.commitAnswer(c.db, c.session.user.id, i.attemptId, i.itemId, i.revision),
      ),
    setFlag: learner
      .input(itemInput.extend({ flagged: z.boolean() }).strict())
      .handler(({ context: c, input: i }) =>
        attempts.flagItem(c.db, c.session.user.id, i.attemptId, i.itemId, i.flagged),
      ),
    submit: learner
      .input(attemptIdInput)
      .handler(({ context: c, input: i }) =>
        attempts.submitAttempt(c.db, c.session.user.id, i.attemptId),
      ),
    results: learner
      .input(attemptIdInput)
      .handler(({ context: c, input: i }) =>
        attempts.results(c.db, c.session.user.id, i.attemptId),
      ),
  },
  studyTools: {
    get: learner
      .input(itemInput)
      .handler(({ context: c, input: i }) =>
        attempts.personalTools(c.db, c.session.user.id, i.attemptId, i.itemId),
      ),
    save: learner
      .input(
        itemInput
          .extend({
            kind: z.enum(["note", "bookmark"]),
            value: z.union([z.string().max(10000), z.boolean()]),
            revision: z.number().int().min(0).default(0),
            mutationId: z.uuid().optional(),
          })
          .strict(),
      )
      .handler(({ context: c, input: i }) =>
        attempts.savePersonalTool(
          c.db,
          c.session.user.id,
          i.attemptId,
          i.itemId,
          i.kind,
          i.value,
          i.revision,
          i.mutationId,
        ),
      ),
  },
};
