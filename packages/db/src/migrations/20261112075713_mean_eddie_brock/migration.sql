CREATE TYPE "attempt_status" AS ENUM('in_progress', 'submitted', 'expired', 'abandoned');--> statement-breakpoint
CREATE TYPE "explanation_language" AS ENUM('english', 'filipino');--> statement-breakpoint
CREATE TYPE "exam_level" AS ENUM('professional', 'subprofessional');--> statement-breakpoint
CREATE TYPE "publication_status" AS ENUM('draft', 'reviewed', 'published', 'retired', 'quarantined');--> statement-breakpoint
CREATE TYPE "role" AS ENUM('learner', 'admin');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "account_provider_id_account_id_unique" UNIQUE("provider_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY,
	"key" text NOT NULL UNIQUE,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attempt" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"mode" text NOT NULL,
	"profile_version_id" text NOT NULL,
	"blueprint_version_id" text,
	"status" "attempt_status" DEFAULT 'in_progress'::"attempt_status" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	CONSTRAINT "attempt_mode" CHECK ("mode" in ('practice','diagnostic','review','strict_mock','timed_practice')),
	CONSTRAINT "attempt_deadline" CHECK (("expires_at" is null or "expires_at" > "started_at") and ("mode" <> 'strict_mock' or "expires_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "attempt_answer" (
	"attempt_item_id" text PRIMARY KEY,
	"question_version_id" text NOT NULL,
	"selected_choice_id" text,
	"revision" integer NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "answer_revision" CHECK ("revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "attempt_item" (
	"id" text PRIMARY KEY,
	"attempt_id" text NOT NULL,
	"position" integer NOT NULL,
	"question_version_id" text NOT NULL,
	"choice_order" text[] NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	CONSTRAINT "attempt_item_attempt_id_position_unique" UNIQUE("attempt_id","position"),
	CONSTRAINT "attempt_item_attempt_id_question_version_id_unique" UNIQUE("attempt_id","question_version_id"),
	CONSTRAINT "attempt_item_id_question_version_id_unique" UNIQUE("id","question_version_id"),
	CONSTRAINT "item_position" CHECK ("position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "attempt_result" (
	"attempt_id" text PRIMARY KEY,
	"correct" integer NOT NULL,
	"incorrect" integer NOT NULL,
	"unanswered" integer NOT NULL,
	"elapsed_seconds" integer NOT NULL,
	"scoring_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "result_nonnegative" CHECK ("correct" >= 0 and "incorrect" >= 0 and "unanswered" >= 0 and "elapsed_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" text PRIMARY KEY,
	"actor_id" text,
	"action" text NOT NULL,
	"target_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookmark" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"lesson_id" text,
	"question_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookmark_user_id_lesson_id_unique" UNIQUE("user_id","lesson_id"),
	CONSTRAINT "bookmark_user_id_question_id_unique" UNIQUE("user_id","question_id"),
	CONSTRAINT "bookmark_one_target" CHECK (num_nonnulls("lesson_id", "question_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "choice" (
	"question_version_id" text,
	"id" text,
	"text" text NOT NULL,
	CONSTRAINT "choice_pkey" PRIMARY KEY("question_version_id","id")
);
--> statement-breakpoint
CREATE TABLE "content_source" (
	"id" text PRIMARY KEY,
	"url" text,
	"title" text NOT NULL,
	"rights" text NOT NULL,
	"verified_at" timestamp with time zone,
	"reviewer_id" text
);
--> statement-breakpoint
CREATE TABLE "exam_profile_version" (
	"id" text PRIMARY KEY,
	"level" "exam_level" NOT NULL,
	"version" integer NOT NULL,
	"item_count" integer NOT NULL,
	"duration_minutes" integer NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"source_url" text,
	"source_title" text,
	"published_on" date,
	"verified_at" timestamp with time zone,
	"reviewer_id" text,
	CONSTRAINT "exam_profile_version_level_version_unique" UNIQUE("level","version"),
	CONSTRAINT "profile_positive" CHECK ("version" > 0 and "item_count" > 0 and "duration_minutes" > 0),
	CONSTRAINT "active_profile_verified" CHECK (not "active" or ("source_url" is not null and "source_title" is not null and "verified_at" is not null and "reviewer_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "import_batch" (
	"id" text PRIMARY KEY,
	"file_hash" text NOT NULL,
	"operator_id" text NOT NULL,
	"status" text NOT NULL,
	"validation_summary" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_batch_file_hash_operator_id_unique" UNIQUE("file_hash","operator_id")
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY,
	"email" text NOT NULL,
	"token_hash" text NOT NULL UNIQUE,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"invited_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_email_normalized" CHECK ("email" = lower(trim("email")))
);
--> statement-breakpoint
CREATE TABLE "lesson" (
	"id" text PRIMARY KEY,
	"slug" text NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE "lesson_progress" (
	"user_id" text,
	"lesson_id" text,
	"version_id" text NOT NULL,
	"location" text,
	"completed_at" timestamp with time zone,
	CONSTRAINT "lesson_progress_pkey" PRIMARY KEY("user_id","lesson_id")
);
--> statement-breakpoint
CREATE TABLE "lesson_version" (
	"id" text PRIMARY KEY,
	"lesson_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" "publication_status" DEFAULT 'draft'::"publication_status" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"topic_id" text NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "lesson_version_lesson_id_version_unique" UNIQUE("lesson_id","version"),
	CONSTRAINT "lesson_review_gate" CHECK ("status" not in ('published','reviewed') or ("reviewed_by" is not null and "reviewed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "mock_blueprint_version" (
	"id" text PRIMARY KEY,
	"profile_version_id" text NOT NULL,
	"version" integer NOT NULL,
	"quotas" jsonb NOT NULL,
	"duration_minutes" integer NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	CONSTRAINT "mock_blueprint_version_profile_version_id_version_unique" UNIQUE("profile_version_id","version")
);
--> statement-breakpoint
CREATE TABLE "private_note" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"lesson_id" text,
	"question_id" text,
	"body" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_length" CHECK (length("body") between 1 and 10000),
	CONSTRAINT "note_one_target" CHECK (num_nonnulls("lesson_id", "question_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "question" (
	"id" text PRIMARY KEY,
	"external_id" text UNIQUE
);
--> statement-breakpoint
CREATE TABLE "question_issue" (
	"id" text PRIMARY KEY,
	"reporter_id" text NOT NULL,
	"question_version_id" text NOT NULL,
	"category" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_topic" (
	"question_version_id" text,
	"topic_id" text,
	CONSTRAINT "question_topic_pkey" PRIMARY KEY("question_version_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "question_version" (
	"id" text PRIMARY KEY,
	"question_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" "publication_status" DEFAULT 'draft'::"publication_status" NOT NULL,
	"level" "exam_level" NOT NULL,
	"language" "explanation_language" NOT NULL,
	"difficulty" text NOT NULL,
	"prompt" text NOT NULL,
	"answer_choice_id" text NOT NULL,
	"explanation" text NOT NULL,
	"primary_topic_id" text NOT NULL,
	"source_id" text NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"erratum" text,
	CONSTRAINT "question_version_question_id_version_unique" UNIQUE("question_id","version"),
	CONSTRAINT "question_difficulty" CHECK ("difficulty" in ('easy','medium','hard')),
	CONSTRAINT "question_review_gate" CHECK ("status" not in ('published','reviewed') or ("reviewed_by" is not null and "reviewed_at" is not null and length(trim("explanation")) > 0))
);
--> statement-breakpoint
CREATE TABLE "request_limit" (
	"key" text PRIMARY KEY,
	"count" integer NOT NULL,
	"window_start" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_event" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"question_id" text NOT NULL,
	"event_key" text NOT NULL UNIQUE,
	"outcome" text NOT NULL,
	"from_step" integer NOT NULL,
	"to_step" integer NOT NULL,
	"study_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_state" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"question_id" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"interval_step" integer DEFAULT 0 NOT NULL,
	"last_version_id" text,
	"last_reviewed_on" date,
	CONSTRAINT "review_state_user_id_question_id_unique" UNIQUE("user_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "study_plan" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"level" "exam_level" NOT NULL,
	"preferences_revision" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_plan_user_id_preferences_revision_unique" UNIQUE("user_id","preferences_revision"),
	CONSTRAINT "plan_status" CHECK ("status" in ('active','superseded'))
);
--> statement-breakpoint
CREATE TABLE "study_preferences" (
	"user_id" text PRIMARY KEY,
	"level" "exam_level" NOT NULL,
	"target_date" date,
	"days" integer[] NOT NULL,
	"daily_minutes" integer NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preference_budget" CHECK ("daily_minutes" between 5 and 240),
	CONSTRAINT "preference_days" CHECK (cardinality("days") between 1 and 7 and "days" <@ ARRAY[0,1,2,3,4,5,6]),
	CONSTRAINT "preference_revision" CHECK ("revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "study_task" (
	"id" text PRIMARY KEY,
	"plan_id" text NOT NULL,
	"topic_id" text,
	"scheduled_on" date NOT NULL,
	"minutes" integer NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "task_minutes" CHECK ("minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "topic" (
	"id" text PRIMARY KEY,
	"slug" text NOT NULL UNIQUE,
	"title" text NOT NULL,
	"parent_id" text,
	"levels" "exam_level"[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profile" (
	"user_id" text PRIMARY KEY,
	"role" "role" DEFAULT 'learner'::"role" NOT NULL,
	"timezone" text DEFAULT 'Asia/Manila' NOT NULL,
	"language" "explanation_language" DEFAULT 'english'::"explanation_language" NOT NULL,
	"onboarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");--> statement-breakpoint
CREATE INDEX "attempt_owner_status_idx" ON "attempt" ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_profile_per_level" ON "exam_profile_version" ("level") WHERE "active";--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" ("email");--> statement-breakpoint
CREATE INDEX "note_owner_idx" ON "private_note" ("user_id");--> statement-breakpoint
CREATE INDEX "question_selection_idx" ON "question_version" ("status","level","primary_topic_id");--> statement-breakpoint
CREATE INDEX "review_due_idx" ON "review_state" ("user_id","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_plan_per_user" ON "study_plan" ("user_id") WHERE "status" = 'active';--> statement-breakpoint
CREATE INDEX "study_task_date_idx" ON "study_task" ("plan_id","scheduled_on");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_profile_version_id_exam_profile_version_id_fkey" FOREIGN KEY ("profile_version_id") REFERENCES "exam_profile_version"("id");--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_blueprint_version_id_mock_blueprint_version_id_fkey" FOREIGN KEY ("blueprint_version_id") REFERENCES "mock_blueprint_version"("id");--> statement-breakpoint
ALTER TABLE "attempt_answer" ADD CONSTRAINT "attempt_answer_attempt_item_id_attempt_item_id_fkey" FOREIGN KEY ("attempt_item_id") REFERENCES "attempt_item"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attempt_answer" ADD CONSTRAINT "attempt_answer_PVPTEMcoGKrW_fkey" FOREIGN KEY ("attempt_item_id","question_version_id") REFERENCES "attempt_item"("id","question_version_id");--> statement-breakpoint
ALTER TABLE "attempt_answer" ADD CONSTRAINT "attempt_answer_Zvxl5sPJvipe_fkey" FOREIGN KEY ("question_version_id","selected_choice_id") REFERENCES "choice"("question_version_id","id");--> statement-breakpoint
ALTER TABLE "attempt_item" ADD CONSTRAINT "attempt_item_attempt_id_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempt"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attempt_item" ADD CONSTRAINT "attempt_item_question_version_id_question_version_id_fkey" FOREIGN KEY ("question_version_id") REFERENCES "question_version"("id");--> statement-breakpoint
ALTER TABLE "attempt_result" ADD CONSTRAINT "attempt_result_attempt_id_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempt"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actor_id_user_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "bookmark" ADD CONSTRAINT "bookmark_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "bookmark" ADD CONSTRAINT "bookmark_lesson_id_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lesson"("id");--> statement-breakpoint
ALTER TABLE "bookmark" ADD CONSTRAINT "bookmark_question_id_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question"("id");--> statement-breakpoint
ALTER TABLE "choice" ADD CONSTRAINT "choice_question_version_id_question_version_id_fkey" FOREIGN KEY ("question_version_id") REFERENCES "question_version"("id");--> statement-breakpoint
ALTER TABLE "content_source" ADD CONSTRAINT "content_source_reviewer_id_user_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "exam_profile_version" ADD CONSTRAINT "exam_profile_version_reviewer_id_user_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_operator_id_user_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_invited_by_user_id_fkey" FOREIGN KEY ("invited_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lesson_id_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lesson"("id");--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_version_id_lesson_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "lesson_version"("id");--> statement-breakpoint
ALTER TABLE "lesson_version" ADD CONSTRAINT "lesson_version_lesson_id_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lesson"("id");--> statement-breakpoint
ALTER TABLE "lesson_version" ADD CONSTRAINT "lesson_version_topic_id_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topic"("id");--> statement-breakpoint
ALTER TABLE "lesson_version" ADD CONSTRAINT "lesson_version_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "mock_blueprint_version" ADD CONSTRAINT "mock_blueprint_version_xv9rWClS5U8l_fkey" FOREIGN KEY ("profile_version_id") REFERENCES "exam_profile_version"("id");--> statement-breakpoint
ALTER TABLE "private_note" ADD CONSTRAINT "private_note_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "private_note" ADD CONSTRAINT "private_note_lesson_id_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lesson"("id");--> statement-breakpoint
ALTER TABLE "private_note" ADD CONSTRAINT "private_note_question_id_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question"("id");--> statement-breakpoint
ALTER TABLE "question_issue" ADD CONSTRAINT "question_issue_reporter_id_user_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "question_issue" ADD CONSTRAINT "question_issue_question_version_id_question_version_id_fkey" FOREIGN KEY ("question_version_id") REFERENCES "question_version"("id");--> statement-breakpoint
ALTER TABLE "question_topic" ADD CONSTRAINT "question_topic_question_version_id_question_version_id_fkey" FOREIGN KEY ("question_version_id") REFERENCES "question_version"("id");--> statement-breakpoint
ALTER TABLE "question_topic" ADD CONSTRAINT "question_topic_topic_id_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topic"("id");--> statement-breakpoint
ALTER TABLE "question_version" ADD CONSTRAINT "question_version_question_id_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question"("id");--> statement-breakpoint
ALTER TABLE "question_version" ADD CONSTRAINT "question_version_primary_topic_id_topic_id_fkey" FOREIGN KEY ("primary_topic_id") REFERENCES "topic"("id");--> statement-breakpoint
ALTER TABLE "question_version" ADD CONSTRAINT "question_version_source_id_content_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "content_source"("id");--> statement-breakpoint
ALTER TABLE "question_version" ADD CONSTRAINT "question_version_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "review_event" ADD CONSTRAINT "review_event_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "review_event" ADD CONSTRAINT "review_event_question_id_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question"("id");--> statement-breakpoint
ALTER TABLE "review_state" ADD CONSTRAINT "review_state_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "review_state" ADD CONSTRAINT "review_state_question_id_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question"("id");--> statement-breakpoint
ALTER TABLE "review_state" ADD CONSTRAINT "review_state_last_version_id_question_version_id_fkey" FOREIGN KEY ("last_version_id") REFERENCES "question_version"("id");--> statement-breakpoint
ALTER TABLE "study_plan" ADD CONSTRAINT "study_plan_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "study_preferences" ADD CONSTRAINT "study_preferences_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "study_task" ADD CONSTRAINT "study_task_plan_id_study_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "study_plan"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "study_task" ADD CONSTRAINT "study_task_topic_id_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topic"("id");--> statement-breakpoint
ALTER TABLE "topic" ADD CONSTRAINT "topic_parent_id_topic_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "topic"("id");--> statement-breakpoint
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;