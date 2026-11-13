CREATE TABLE "level_launch" (
	"level" "exam_level" PRIMARY KEY,
	"profile_id" text NOT NULL,
	"form_set_id" text NOT NULL,
	"launched_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mock_form_item" (
	"set_id" text,
	"form" integer,
	"position" integer,
	"question_version_id" text NOT NULL,
	"question_id" text NOT NULL,
	CONSTRAINT "mock_form_item_pkey" PRIMARY KEY("set_id","form","position"),
	CONSTRAINT "mock_form_item_set_id_question_id_unique" UNIQUE("set_id","question_id"),
	CONSTRAINT "form_number" CHECK ("form" in (1,2))
);
--> statement-breakpoint
CREATE TABLE "mock_form_set" (
	"id" text PRIMARY KEY,
	"blueprint_id" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_exposure" (
	"user_id" text,
	"question_id" text,
	"first_item_id" text NOT NULL,
	CONSTRAINT "question_exposure_pkey" PRIMARY KEY("user_id","question_id")
);
--> statement-breakpoint
ALTER TABLE "attempt" ADD COLUMN "creation_key" text;--> statement-breakpoint
ALTER TABLE "attempt_answer" ADD COLUMN "mutation_id" text;--> statement-breakpoint
ALTER TABLE "attempt_answer" ADD COLUMN "confidence" text;--> statement-breakpoint
ALTER TABLE "attempt_item" ADD COLUMN "first_exposure" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "attempt_item" ADD COLUMN "committed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "exam_profile_version" ADD COLUMN "diagnostic_count" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "import_batch" ADD COLUMN "rows" jsonb;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_version" ADD COLUMN "structure" jsonb;--> statement-breakpoint
ALTER TABLE "lesson_version" ADD COLUMN "levels" "exam_level"[] DEFAULT '{professional,subprofessional}'::"exam_level"[] NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_version" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "lesson_version" ADD COLUMN "review_checklist" jsonb;--> statement-breakpoint
ALTER TABLE "lesson_version" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lesson_version" ADD COLUMN "erratum" text;--> statement-breakpoint
ALTER TABLE "question" ADD COLUMN "blocked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "question_issue" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "question_version" ADD COLUMN "passage" text;--> statement-breakpoint
ALTER TABLE "question_version" ADD COLUMN "media" jsonb;--> statement-breakpoint
ALTER TABLE "question_version" ADD COLUMN "distractor_explanations" jsonb;--> statement-breakpoint
ALTER TABLE "question_version" ADD COLUMN "review_checklist" jsonb;--> statement-breakpoint
ALTER TABLE "question_version" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "topic" ADD COLUMN "area" text;--> statement-breakpoint
ALTER TABLE "topic" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "diagnostic_decision" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_user_id_creation_key_unique" UNIQUE("user_id","creation_key");--> statement-breakpoint
ALTER TABLE "private_note" ADD CONSTRAINT "private_note_user_id_question_id_unique" UNIQUE("user_id","question_id");--> statement-breakpoint
ALTER TABLE "lesson_version" ADD CONSTRAINT "lesson_version_source_id_content_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "content_source"("id");--> statement-breakpoint
ALTER TABLE "level_launch" ADD CONSTRAINT "level_launch_profile_id_exam_profile_version_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "exam_profile_version"("id");--> statement-breakpoint
ALTER TABLE "level_launch" ADD CONSTRAINT "level_launch_form_set_id_mock_form_set_id_fkey" FOREIGN KEY ("form_set_id") REFERENCES "mock_form_set"("id");--> statement-breakpoint
ALTER TABLE "level_launch" ADD CONSTRAINT "level_launch_launched_by_user_id_fkey" FOREIGN KEY ("launched_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "mock_form_item" ADD CONSTRAINT "mock_form_item_set_id_mock_form_set_id_fkey" FOREIGN KEY ("set_id") REFERENCES "mock_form_set"("id");--> statement-breakpoint
ALTER TABLE "mock_form_item" ADD CONSTRAINT "mock_form_item_question_version_id_question_version_id_fkey" FOREIGN KEY ("question_version_id") REFERENCES "question_version"("id");--> statement-breakpoint
ALTER TABLE "mock_form_item" ADD CONSTRAINT "mock_form_item_question_id_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question"("id");--> statement-breakpoint
ALTER TABLE "mock_form_set" ADD CONSTRAINT "mock_form_set_blueprint_id_mock_blueprint_version_id_fkey" FOREIGN KEY ("blueprint_id") REFERENCES "mock_blueprint_version"("id");--> statement-breakpoint
ALTER TABLE "mock_form_set" ADD CONSTRAINT "mock_form_set_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "question_exposure" ADD CONSTRAINT "question_exposure_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "question_exposure" ADD CONSTRAINT "question_exposure_question_id_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question"("id");--> statement-breakpoint
ALTER TABLE "question_exposure" ADD CONSTRAINT "question_exposure_first_item_id_attempt_item_id_fkey" FOREIGN KEY ("first_item_id") REFERENCES "attempt_item"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE UNIQUE INDEX one_published_question_version ON question_version(question_id) WHERE status='published';
--> statement-breakpoint
CREATE UNIQUE INDEX one_published_lesson_version ON lesson_version(lesson_id) WHERE status='published';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_attempt_item() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent attempt;
BEGIN
  SELECT * INTO parent FROM attempt WHERE id=NEW.attempt_id FOR UPDATE;
  IF parent.status <> 'in_progress' OR (parent.expires_at IS NOT NULL AND parent.expires_at <= clock_timestamp()) THEN RAISE EXCEPTION 'Attempt is terminal or expired'; END IF;
  IF TG_OP='UPDATE' THEN
    IF (to_jsonb(NEW)-'flagged'-'committed_at') IS DISTINCT FROM (to_jsonb(OLD)-'flagged'-'committed_at') THEN RAISE EXCEPTION 'Attempt items are pinned'; END IF;
    IF OLD.committed_at IS NOT NULL AND NEW.committed_at IS DISTINCT FROM OLD.committed_at THEN RAISE EXCEPTION 'Commitment is immutable'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION check_answer_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent attempt; item attempt_item;
BEGIN
  SELECT * INTO item FROM attempt_item WHERE id=NEW.attempt_item_id;
  SELECT * INTO parent FROM attempt WHERE id=item.attempt_id FOR UPDATE;
  IF parent.status <> 'in_progress' OR (parent.expires_at IS NOT NULL AND parent.expires_at <= clock_timestamp()) THEN RAISE EXCEPTION 'Attempt is terminal or expired'; END IF;
  IF item.committed_at IS NOT NULL THEN RAISE EXCEPTION 'Committed answers are immutable'; END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.attempt_item_id<>OLD.attempt_item_id OR NEW.question_version_id<>OLD.question_version_id OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Stale answer revision'; END IF;
  ELSIF NEW.revision<>1 THEN RAISE EXCEPTION 'First answer revision must be one'; END IF;
  NEW.saved_at:=clock_timestamp(); RETURN NEW;
END $$;
--> statement-breakpoint
ALTER TABLE exam_profile_version ADD CONSTRAINT diagnostic_count_bound CHECK (diagnostic_count BETWEEN 1 AND 120);
--> statement-breakpoint
ALTER TABLE question_version ADD CONSTRAINT version_stable_identity UNIQUE(id,question_id);
--> statement-breakpoint
ALTER TABLE mock_form_item ADD CONSTRAINT form_question_membership FOREIGN KEY (question_version_id,question_id) REFERENCES question_version(id,question_id) DEFERRABLE INITIALLY DEFERRED;

--> statement-breakpoint
INSERT INTO topic(id,slug,title,levels,area,enabled) VALUES ('verbal-vocabulary','verbal-vocabulary','Vocabulary',ARRAY['professional','subprofessional']::exam_level[],'verbal',true) ON CONFLICT(slug) DO NOTHING;

--> statement-breakpoint
INSERT INTO topic(id,slug,title,levels,area,enabled) VALUES ('verbal-grammar','verbal-grammar','Grammar',ARRAY['professional','subprofessional']::exam_level[],'verbal',true) ON CONFLICT(slug) DO NOTHING;

--> statement-breakpoint
INSERT INTO topic(id,slug,title,levels,area,enabled) VALUES ('verbal-sentence-construction','verbal-sentence-construction','Sentence construction',ARRAY['professional','subprofessional']::exam_level[],'verbal',true) ON CONFLICT(slug) DO NOTHING;

--> statement-breakpoint
INSERT INTO topic(id,slug,title,levels,area,enabled) VALUES ('verbal-paragraph-ordering','verbal-paragraph-ordering','Paragraph ordering',ARRAY['professional','subprofessional']::exam_level[],'verbal',true) ON CONFLICT(slug) DO NOTHING;

--> statement-breakpoint
INSERT INTO topic(id,slug,title,levels,area,enabled) VALUES ('verbal-comprehension','verbal-comprehension','Comprehension',ARRAY['professional','subprofessional']::exam_level[],'verbal',true) ON CONFLICT(slug) DO NOTHING;

--> statement-breakpoint
INSERT INTO topic(id,slug,title,levels,area,enabled) VALUES ('numerical-arithmetic','numerical-arithmetic','Arithmetic',ARRAY['professional','subprofessional']::exam_level[],'numerical',true) ON CONFLICT(slug) DO NOTHING;

--> statement-breakpoint
INSERT INTO topic(id,slug,title,levels,area,enabled) VALUES ('numerical-sequences','numerical-sequences','Sequences',ARRAY['professional','subprofessional']::exam_level[],'numerical',true) ON CONFLICT(slug) DO NOTHING;

--> statement-breakpoint
INSERT INTO topic(id,slug,title,levels,area,enabled) VALUES ('numerical-applied-word-problems','numerical-applied-word-problems','Applied word problems',ARRAY['professional','subprofessional']::exam_level[],'numerical',true) ON CONFLICT(slug) DO NOTHING;

--> statement-breakpoint
INSERT INTO topic(id,slug,title,levels,area,enabled) VALUES ('general-constitution','general-constitution','Constitution',ARRAY['professional','subprofessional']::exam_level[],'general',true) ON CONFLICT(slug) DO NOTHING;

--> statement-breakpoint
INSERT INTO topic(id,slug,title,levels,area,enabled) VALUES ('general-public-service-ethics','general-public-service-ethics','Public-service ethics',ARRAY['professional','subprofessional']::exam_level[],'general',true) ON CONFLICT(slug) DO NOTHING;

--> statement-breakpoint
INSERT INTO topic(id,slug,title,levels,area,enabled) VALUES ('general-peace-and-human-rights','general-peace-and-human-rights','Peace and human rights',ARRAY['professional','subprofessional']::exam_level[],'general',true) ON CONFLICT(slug) DO NOTHING;

--> statement-breakpoint
INSERT INTO topic(id,slug,title,levels,area,enabled) VALUES ('general-environmental-protection','general-environmental-protection','Environmental protection',ARRAY['professional','subprofessional']::exam_level[],'general',true) ON CONFLICT(slug) DO NOTHING;

--> statement-breakpoint
INSERT INTO topic(id,slug,title,levels,area,enabled) VALUES ('analytical-analogies','analytical-analogies','Analogies',ARRAY['professional']::exam_level[],'analytical',true) ON CONFLICT(slug) DO NOTHING;

--> statement-breakpoint
INSERT INTO topic(id,slug,title,levels,area,enabled) VALUES ('analytical-abstract-logic','analytical-abstract-logic','Abstract logic',ARRAY['professional']::exam_level[],'analytical',true) ON CONFLICT(slug) DO NOTHING;

--> statement-breakpoint
INSERT INTO topic(id,slug,title,levels,area,enabled) VALUES ('analytical-assumptions-and-conclusions','analytical-assumptions-and-conclusions','Assumptions and conclusions',ARRAY['professional']::exam_level[],'analytical',true) ON CONFLICT(slug) DO NOTHING;

--> statement-breakpoint
INSERT INTO topic(id,slug,title,levels,area,enabled) VALUES ('analytical-interpreting-data','analytical-interpreting-data','Interpreting data',ARRAY['professional']::exam_level[],'analytical',true) ON CONFLICT(slug) DO NOTHING;

--> statement-breakpoint
INSERT INTO topic(id,slug,title,levels,area,enabled) VALUES ('clerical-filing','clerical-filing','Filing',ARRAY['subprofessional']::exam_level[],'clerical',true) ON CONFLICT(slug) DO NOTHING;

--> statement-breakpoint
INSERT INTO topic(id,slug,title,levels,area,enabled) VALUES ('clerical-spelling','clerical-spelling','Spelling',ARRAY['subprofessional']::exam_level[],'clerical',true) ON CONFLICT(slug) DO NOTHING;
