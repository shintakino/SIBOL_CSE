import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

const instant = (name: string) => timestamp(name, { withTimezone: true });
const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const owner = () =>
  text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });
const created = () => instant("created_at").notNull().defaultNow();
export const role = pgEnum("role", ["learner", "admin"]);
export const level = pgEnum("exam_level", ["professional", "subprofessional"]);
export const language = pgEnum("explanation_language", ["english", "filipino"]);
export const publicationStatus = pgEnum("publication_status", [
  "draft",
  "reviewed",
  "published",
  "retired",
  "quarantined",
]);
export const attemptStatus = pgEnum("attempt_status", [
  "in_progress",
  "submitted",
  "expired",
  "abandoned",
]);

export const userProfile = pgTable("user_profile", {
  userId: owner().primaryKey(),
  role: role().notNull().default("learner"),
  timezone: text().notNull().default("Asia/Manila"),
  language: language().notNull().default("english"),
  onboardedAt: instant("onboarded_at"),
  diagnosticDecision: text("diagnostic_decision").notNull().default("pending"),
  dedication: text(),
  assessmentRevision: integer("assessment_revision").notNull().default(0),
  createdAt: created(),
});
export const studyPreferences = pgTable(
  "study_preferences",
  {
    userId: owner().primaryKey(),
    level: level().notNull(),
    targetDate: date("target_date"),
    days: integer().array().notNull(),
    dailyMinutes: integer("daily_minutes").notNull(),
    revision: integer().notNull().default(1),
    updatedAt: instant("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("preference_budget", sql`${t.dailyMinutes} between 5 and 240`),
    check(
      "preference_days",
      sql`cardinality(${t.days}) between 1 and 7 and ${t.days} <@ ARRAY[0,1,2,3,4,5,6]`,
    ),
    check("preference_revision", sql`${t.revision} > 0`),
  ],
);
export const invitation = pgTable(
  "invitation",
  {
    id: id(),
    email: text().notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: instant("expires_at").notNull(),
    acceptedAt: instant("accepted_at"),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => user.id),
    createdAt: created(),
  },
  (t) => [
    check("invitation_email_normalized", sql`${t.email} = lower(trim(${t.email}))`),
    index("invitation_email_idx").on(t.email),
  ],
);
export const auditEvent = pgTable("audit_event", {
  id: id(),
  actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
  action: text().notNull(),
  targetId: text("target_id").notNull(),
  createdAt: created(),
});
export const requestLimit = pgTable("request_limit", {
  key: text().primaryKey(),
  count: integer().notNull(),
  windowStart: instant("window_start").notNull(),
});
export const examProfileVersion = pgTable(
  "exam_profile_version",
  {
    id: id(),
    level: level().notNull(),
    version: integer().notNull(),
    itemCount: integer("item_count").notNull(),
    diagnosticCount: integer("diagnostic_count").notNull().default(30),
    durationMinutes: integer("duration_minutes").notNull(),
    active: boolean().notNull().default(false),
    sourceUrl: text("source_url"),
    sourceTitle: text("source_title"),
    publishedOn: date("published_on"),
    verifiedAt: instant("verified_at"),
    reviewerId: text("reviewer_id").references(() => user.id),
  },
  (t) => [
    unique().on(t.level, t.version),
    check(
      "profile_positive",
      sql`${t.version} > 0 and ${t.itemCount} > 0 and ${t.durationMinutes} > 0`,
    ),
    check(
      "active_profile_verified",
      sql`not ${t.active} or (${t.sourceUrl} is not null and ${t.sourceTitle} is not null and ${t.verifiedAt} is not null and ${t.reviewerId} is not null)`,
    ),
    uniqueIndex("one_active_profile_per_level").on(t.level).where(sql`${t.active}`),
  ],
);
export const topic = pgTable(
  "topic",
  {
    id: id(),
    slug: text().notNull().unique(),
    title: text().notNull(),
    parentId: text("parent_id"),
    levels: level().array().notNull(),
    area: text(),
    enabled: boolean().notNull().default(true),
  },
  (t) => [foreignKey({ columns: [t.parentId], foreignColumns: [t.id] })],
);
export const lesson = pgTable("lesson", { id: id(), slug: text().notNull().unique() });
export const lessonVersion = pgTable(
  "lesson_version",
  {
    id: id(),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lesson.id),
    version: integer().notNull(),
    status: publicationStatus().notNull().default("draft"),
    title: text().notNull(),
    body: text().notNull(),
    structure: jsonb().$type<unknown>(),
    levels: level().array().notNull().default(["professional", "subprofessional"]),
    sourceId: text("source_id").references(() => contentSource.id),
    reviewChecklist: jsonb("review_checklist").$type<unknown>(),
    publishedAt: instant("published_at"),
    erratum: text(),
    topicId: text("topic_id")
      .notNull()
      .references(() => topic.id),
    reviewedBy: text("reviewed_by").references(() => user.id),
    reviewedAt: instant("reviewed_at"),
  },
  (t) => [
    unique().on(t.lessonId, t.version),
    check(
      "lesson_review_gate",
      sql`${t.status} not in ('published','reviewed') or (${t.reviewedBy} is not null and ${t.reviewedAt} is not null)`,
    ),
  ],
);
export const contentSource = pgTable("content_source", {
  id: id(),
  url: text(),
  title: text().notNull(),
  rights: text().notNull(),
  verifiedAt: instant("verified_at"),
  reviewerId: text("reviewer_id").references(() => user.id),
});
export const question = pgTable("question", {
  id: id(),
  externalId: text("external_id").unique(),
  blocked: boolean().notNull().default(false),
});
export const questionVersion = pgTable(
  "question_version",
  {
    id: id(),
    questionId: text("question_id")
      .notNull()
      .references(() => question.id),
    version: integer().notNull(),
    status: publicationStatus().notNull().default("draft"),
    level: level().notNull(),
    importHash: text("import_hash"),
    levels: level("levels").array(),
    kind: text().notNull().default("choice"),
    instruction: text(),
    highlight: text(),
    orderItems: jsonb("order_items")
      .$type<{ id: string; text: string; label?: string }[]>()
      .notNull()
      .default([]),
    answerOrder: text("answer_order").array(),
    provider: jsonb().$type<{
      name: "topnotcher";
      questionId: string;
      category: string;
      subcategory: string;
      group?: string;
    }>(),
    language: language().notNull(),
    difficulty: text().notNull(),
    prompt: text().notNull(),
    passage: text(),
    media: jsonb().$type<unknown>(),
    distractorExplanations: jsonb("distractor_explanations").$type<Record<string, string>>(),
    reviewChecklist: jsonb("review_checklist").$type<unknown>(),
    publishedAt: instant("published_at"),
    answerChoiceId: text("answer_choice_id"),
    explanation: text().notNull(),
    primaryTopicId: text("primary_topic_id")
      .notNull()
      .references(() => topic.id),
    sourceId: text("source_id")
      .notNull()
      .references(() => contentSource.id),
    reviewedBy: text("reviewed_by").references(() => user.id),
    reviewedAt: instant("reviewed_at"),
    erratum: text(),
  },
  (t) => [
    unique().on(t.questionId, t.version),
    unique().on(t.questionId, t.importHash),
    index("question_selection_idx").on(t.status, t.level, t.primaryTopicId),
    check("question_difficulty", sql`${t.difficulty} in ('easy','medium','hard')`),
    check("question_kind", sql`${t.kind} in ('choice','error','order')`),
    check(
      "question_response_key",
      sql`(${t.kind} = 'order' and ${t.answerChoiceId} is null and ${t.answerOrder} is not null and cardinality(${t.answerOrder}) >= 2 and jsonb_array_length(${t.orderItems}) = cardinality(${t.answerOrder})) or (${t.kind} in ('choice','error') and ${t.answerChoiceId} is not null and ${t.answerOrder} is null)`,
    ),
    check(
      "question_supported_levels",
      sql`${t.levels} is null or (cardinality(${t.levels}) between 1 and 2 and ${t.level} = any(${t.levels}) and (cardinality(${t.levels}) = 1 or ${t.levels}[1] <> ${t.levels}[2]))`,
    ),
    check(
      "question_review_gate",
      sql`${t.status} not in ('published','reviewed') or (${t.reviewedBy} is not null and ${t.reviewedAt} is not null and length(trim(${t.explanation})) > 0)`,
    ),
  ],
);
export const choice = pgTable(
  "choice",
  {
    questionVersionId: text("question_version_id")
      .notNull()
      .references(() => questionVersion.id),
    id: text().notNull(),
    text: text().notNull(),
    label: text(),
    media: jsonb().$type<{ src: string; alt: string; descriptionReviewed?: boolean }>(),
  },
  (t) => [primaryKey({ columns: [t.questionVersionId, t.id] })],
);
export const questionTopic = pgTable(
  "question_topic",
  {
    questionVersionId: text("question_version_id")
      .notNull()
      .references(() => questionVersion.id),
    topicId: text("topic_id")
      .notNull()
      .references(() => topic.id),
  },
  (t) => [primaryKey({ columns: [t.questionVersionId, t.topicId] })],
);

const binary = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
export const contentAsset = pgTable(
  "content_asset",
  {
    id: text().primaryKey(),
    mime: text().notNull(),
    data: binary("data").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: created(),
  },
  (t) => [
    check("content_asset_size", sql`octet_length(${t.data}) between 1 and 5242880`),
    check(
      "content_asset_mime",
      sql`${t.mime} in ('image/png','image/jpeg','image/webp','image/gif')`,
    ),
    check("content_asset_hash", sql`encode(sha256(${t.data}), 'hex') = ${t.id}`),
  ],
);
export const providerBank = pgTable(
  "provider_bank",
  {
    id: id(),
    provider: text().notNull(),
    manifestHash: text("manifest_hash").notNull().unique(),
    permissionHash: text("permission_hash").notNull(),
    mode: text().notNull().default("api_sample"),
    expectedIds: jsonb("expected_ids").$type<Record<string, string[]> | null>(),
    report: jsonb().$type<Record<string, unknown>>().notNull(),
    coverageVerified: boolean("coverage_verified").notNull().default(false),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: created(),
  },
  (t) => [
    check(
      "provider_verified_source",
      sql`not ${t.coverageVerified} or (${t.mode} in ('export','feed') and ${t.expectedIds} is not null)`,
    ),
  ],
);
export const providerSnapshot = pgTable(
  "provider_snapshot",
  {
    bankId: text("bank_id")
      .notNull()
      .references(() => providerBank.id),
    sourceKey: text("source_key").notNull(),
    providerQuestionId: text("provider_question_id").notNull(),
    category: text().notNull(),
    subcategory: text().notNull(),
    levels: level("levels").array().notNull(),
    topicId: text("topic_id").references(() => topic.id),
    raw: jsonb().$type<Record<string, unknown>>().notNull(),
    fingerprint: text().notNull(),
    questionId: text("question_id").references(() => question.id),
    heldReasons: text("held_reasons").array().notNull().default([]),
  },
  (t) => [
    primaryKey({ columns: [t.bankId, t.sourceKey, t.category, t.subcategory] }),
    index("provider_snapshot_topic_idx").on(t.bankId, t.category, t.subcategory),
    index("provider_snapshot_question_idx").on(t.questionId),
  ],
);
export const mockBlueprintVersion = pgTable(
  "mock_blueprint_version",
  {
    id: id(),
    profileVersionId: text("profile_version_id")
      .notNull()
      .references(() => examProfileVersion.id),
    version: integer().notNull(),
    quotas: jsonb().$type<Record<string, number>>().notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    published: boolean().notNull().default(false),
  },
  (t) => [unique().on(t.profileVersionId, t.version)],
);
export const attempt = pgTable(
  "attempt",
  {
    id: id(),
    userId: owner(),
    mode: text().notNull(),
    creationKey: text("creation_key"),
    setKind: text("set_kind"),
    timeMultiplier: integer("time_multiplier").notNull().default(100),
    profileVersionId: text("profile_version_id")
      .notNull()
      .references(() => examProfileVersion.id),
    blueprintVersionId: text("blueprint_version_id").references(() => mockBlueprintVersion.id),
    status: attemptStatus().notNull().default("in_progress"),
    startedAt: instant("started_at").notNull().defaultNow(),
    expiresAt: instant("expires_at"),
    submittedAt: instant("submitted_at"),
  },
  (t) => [
    index("attempt_owner_status_idx").on(t.userId, t.status),
    index("attempt_owner_time_idx").on(t.userId, t.startedAt),
    unique().on(t.userId, t.creationKey),
    check(
      "attempt_mode",
      sql`${t.mode} in ('practice','diagnostic','review','strict_mock','timed_practice')`,
    ),
    check(
      "attempt_deadline",
      sql`(${t.expiresAt} is null or ${t.expiresAt} > ${t.startedAt}) and (${t.mode} <> 'strict_mock' or ${t.expiresAt} is not null)`,
    ),
  ],
);
export const attemptItem = pgTable(
  "attempt_item",
  {
    id: id(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => attempt.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    questionVersionId: text("question_version_id")
      .notNull()
      .references(() => questionVersion.id),
    choiceOrder: text("choice_order").array().notNull(),
    itemOrder: text("item_order").array().notNull().default([]),
    flagged: boolean().notNull().default(false),
    firstExposure: boolean("first_exposure").notNull().default(false),
    committedAt: instant("committed_at"),
  },
  (t) => [
    unique().on(t.attemptId, t.position),
    unique().on(t.attemptId, t.questionVersionId),
    unique().on(t.id, t.questionVersionId),
    check("item_position", sql`${t.position} >= 0`),
  ],
);
export const attemptAnswer = pgTable(
  "attempt_answer",
  {
    attemptItemId: text("attempt_item_id")
      .primaryKey()
      .references(() => attemptItem.id, { onDelete: "cascade" }),
    questionVersionId: text("question_version_id").notNull(),
    selectedChoiceId: text("selected_choice_id"),
    selectedOrder: text("selected_order").array(),
    revision: integer().notNull(),
    mutationId: text("mutation_id"),
    confidence: text(),
    savedAt: instant("saved_at").notNull().defaultNow(),
  },
  (t) => [
    check("answer_revision", sql`${t.revision} > 0`),
    check(
      "answer_single_representation",
      sql`${t.selectedChoiceId} is null or ${t.selectedOrder} is null`,
    ),
    foreignKey({
      columns: [t.attemptItemId, t.questionVersionId],
      foreignColumns: [attemptItem.id, attemptItem.questionVersionId],
    }),
    foreignKey({
      columns: [t.questionVersionId, t.selectedChoiceId],
      foreignColumns: [choice.questionVersionId, choice.id],
    }),
  ],
);
export const attemptResult = pgTable(
  "attempt_result",
  {
    attemptId: text("attempt_id")
      .primaryKey()
      .references(() => attempt.id, { onDelete: "cascade" }),
    correct: integer().notNull(),
    incorrect: integer().notNull(),
    unanswered: integer().notNull(),
    elapsedSeconds: integer("elapsed_seconds").notNull(),
    scoringVersion: text("scoring_version").notNull(),
    createdAt: created(),
  },
  (t) => [
    check(
      "result_nonnegative",
      sql`${t.correct} >= 0 and ${t.incorrect} >= 0 and ${t.unanswered} >= 0 and ${t.elapsedSeconds} >= 0`,
    ),
  ],
);
export const studyPlan = pgTable(
  "study_plan",
  {
    id: id(),
    userId: owner(),
    level: level().notNull(),
    preferencesRevision: integer("preferences_revision").notNull(),
    status: text().notNull().default("active"),
    reason: text().notNull(),
    generatedOn: date("generated_on"),
    allocation: jsonb()
      .$type<{ review: number; priority: number; mixed: number }>()
      .notNull()
      .default({ review: 20, priority: 60, mixed: 20 }),
    createdAt: created(),
  },
  (t) => [
    unique().on(t.userId, t.preferencesRevision),
    uniqueIndex("one_active_plan_per_user").on(t.userId).where(sql`${t.status} = 'active'`),
    check("plan_status", sql`${t.status} in ('active','superseded')`),
  ],
);
export const studyTask = pgTable(
  "study_task",
  {
    id: id(),
    planId: text("plan_id")
      .notNull()
      .references(() => studyPlan.id, { onDelete: "cascade" }),
    topicId: text("topic_id").references(() => topic.id),
    scheduledOn: date("scheduled_on").notNull(),
    minutes: integer().notNull(),
    completedAt: instant("completed_at"),
    kind: text().notNull().default("priority"),
    reason: text().notNull().default("A manageable next step."),
    href: text().notNull().default("/practice"),
    carriedFromOn: date("carried_from_on"),
    archivedAt: instant("archived_at"),
  },
  (t) => [
    index("study_task_date_idx").on(t.planId, t.scheduledOn),
    check("task_minutes", sql`${t.minutes} > 0`),
  ],
);
export const reviewState = pgTable(
  "review_state",
  {
    id: id(),
    userId: owner(),
    questionId: text("question_id")
      .notNull()
      .references(() => question.id),
    dueAt: instant("due_at").notNull(),
    intervalStep: integer("interval_step").notNull().default(0),
    lastVersionId: text("last_version_id").references(() => questionVersion.id),
    lastReviewedOn: date("last_reviewed_on"),
  },
  (t) => [unique().on(t.userId, t.questionId), index("review_due_idx").on(t.userId, t.dueAt)],
);
export const reviewEvent = pgTable(
  "review_event",
  {
    id: id(),
    userId: owner(),
    questionId: text("question_id")
      .notNull()
      .references(() => question.id),
    eventKey: text("event_key").notNull().unique(),
    outcome: text().notNull(),
    fromStep: integer("from_step").notNull(),
    toStep: integer("to_step").notNull(),
    studyDate: date("study_date").notNull(),
    versionId: text("version_id").references(() => questionVersion.id),
    selectedChoiceId: text("selected_choice_id"),
    selectedOrder: text("selected_order").array(),
    attemptItemId: text("attempt_item_id").references(() => attemptItem.id, {
      onDelete: "set null",
    }),
    createdAt: created(),
  },
  (t) => [
    index("review_history_idx").on(t.userId, t.createdAt),
    index("review_question_history_idx").on(t.userId, t.questionId, t.createdAt),
  ],
);

export const planBuild = pgTable(
  "plan_build",
  {
    id: id(),
    userId: owner(),
    requestId: text("request_id").notNull(),
    planId: text("plan_id")
      .notNull()
      .references(() => studyPlan.id, { onDelete: "cascade" }),
    createdAt: created(),
  },
  (t) => [unique().on(t.userId, t.requestId)],
);
export const lessonProgress = pgTable(
  "lesson_progress",
  {
    userId: owner(),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lesson.id),
    versionId: text("version_id")
      .notNull()
      .references(() => lessonVersion.id),
    location: text(),
    revision: integer().notNull().default(1),
    completedAt: instant("completed_at"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.lessonId] })],
);
export const bookmark = pgTable(
  "bookmark",
  {
    id: id(),
    userId: owner(),
    lessonId: text("lesson_id").references(() => lesson.id),
    questionId: text("question_id").references(() => question.id),
    createdAt: created(),
  },
  (t) => [
    check("bookmark_one_target", sql`num_nonnulls(${t.lessonId}, ${t.questionId}) = 1`),
    unique().on(t.userId, t.lessonId),
    unique().on(t.userId, t.questionId),
  ],
);
export const privateNote = pgTable(
  "private_note",
  {
    id: id(),
    userId: owner(),
    lessonId: text("lesson_id").references(() => lesson.id),
    questionId: text("question_id").references(() => question.id),
    body: text().notNull(),
    revision: integer().notNull().default(1),
    mutationId: text("mutation_id"),
    deletedAt: instant("deleted_at"),
    updatedAt: instant("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("note_owner_idx").on(t.userId),
    unique().on(t.userId, t.questionId),
    unique().on(t.userId, t.lessonId),
    check(
      "note_length",
      sql`(${t.deletedAt} is null and length(${t.body}) between 1 and 10000) or (${t.deletedAt} is not null and ${t.body} = '')`,
    ),
    check("note_revision", sql`${t.revision} > 0`),
    check("note_one_target", sql`num_nonnulls(${t.lessonId}, ${t.questionId}) = 1`),
  ],
);

export const displayPreferences = pgTable(
  "display_preferences",
  {
    userId: owner().primaryKey(),
    theme: text().$type<"light" | "dark">().notNull().default("light"),
    motion: text().$type<"system" | "reduce">().notNull().default("system"),
    inAppReminders: boolean("in_app_reminders").notNull().default(true),
    futureEmailOptIn: boolean("future_email_opt_in").notNull().default(false),
    revision: integer().notNull().default(1),
    updatedAt: instant("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "display_values",
      sql`${t.theme} in ('light','dark') and ${t.motion} in ('system','reduce') and ${t.revision} > 0`,
    ),
  ],
);

export const deletionReceipt = pgTable("deletion_receipt", {
  userId: text("user_id").primaryKey(),
  receiptId: text("receipt_id").notNull().unique(),
  deletedAt: instant("deleted_at").notNull().defaultNow(),
});
export const questionIssue = pgTable("question_issue", {
  id: id(),
  reporterId: text("reporter_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  questionVersionId: text("question_version_id")
    .notNull()
    .references(() => questionVersion.id),
  category: text().notNull(),
  description: text().notNull().default(""),
  status: text().notNull().default("open"),
  resolution: text(),
  createdAt: created(),
});
export const importBatch = pgTable(
  "import_batch",
  {
    id: id(),
    fileHash: text("file_hash").notNull(),
    operatorId: text("operator_id")
      .notNull()
      .references(() => user.id),
    status: text().notNull(),
    validationSummary: jsonb("validation_summary").notNull(),
    rows: jsonb().$type<unknown>(),
    createdAt: created(),
  },
  (t) => [unique().on(t.fileHash, t.operatorId)],
);

export const questionExposure = pgTable(
  "question_exposure",
  {
    userId: owner(),
    questionId: text("question_id")
      .notNull()
      .references(() => question.id),
    firstItemId: text("first_item_id")
      .notNull()
      .references(() => attemptItem.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.questionId] })],
);
export const mockFormSet = pgTable("mock_form_set", {
  id: id(),
  blueprintId: text("blueprint_id")
    .notNull()
    .references(() => mockBlueprintVersion.id),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: created(),
});
export const mockFormItem = pgTable(
  "mock_form_item",
  {
    setId: text("set_id")
      .notNull()
      .references(() => mockFormSet.id),
    form: integer().notNull(),
    position: integer().notNull(),
    questionVersionId: text("question_version_id")
      .notNull()
      .references(() => questionVersion.id),
    questionId: text("question_id")
      .notNull()
      .references(() => question.id),
  },
  (t) => [
    primaryKey({ columns: [t.setId, t.form, t.position] }),
    unique().on(t.setId, t.questionId),
    check("form_number", sql`${t.form} in (1,2)`),
  ],
);
export const levelLaunch = pgTable("level_launch", {
  level: level().primaryKey(),
  profileId: text("profile_id")
    .notNull()
    .references(() => examProfileVersion.id),
  formSetId: text("form_set_id")
    .notNull()
    .references(() => mockFormSet.id),
  launchedBy: text("launched_by")
    .notNull()
    .references(() => user.id),
  launchedAt: created(),
});
