CREATE TABLE "plan_build" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"request_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_build_user_id_request_id_unique" UNIQUE("user_id","request_id")
);
--> statement-breakpoint
ALTER TABLE "attempt" ADD COLUMN "set_kind" text;--> statement-breakpoint
ALTER TABLE "attempt" ADD COLUMN "time_multiplier" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "review_event" ADD COLUMN "version_id" text;--> statement-breakpoint
ALTER TABLE "review_event" ADD COLUMN "selected_choice_id" text;--> statement-breakpoint
ALTER TABLE "review_event" ADD COLUMN "attempt_item_id" text;--> statement-breakpoint
ALTER TABLE "study_plan" ADD COLUMN "generated_on" date;--> statement-breakpoint
ALTER TABLE "study_plan" ADD COLUMN "allocation" jsonb DEFAULT '{"review":20,"priority":60,"mixed":20}' NOT NULL;--> statement-breakpoint
ALTER TABLE "study_task" ADD COLUMN "kind" text DEFAULT 'priority' NOT NULL;--> statement-breakpoint
ALTER TABLE "study_task" ADD COLUMN "reason" text DEFAULT 'A manageable next step.' NOT NULL;--> statement-breakpoint
ALTER TABLE "study_task" ADD COLUMN "href" text DEFAULT '/practice' NOT NULL;--> statement-breakpoint
ALTER TABLE "study_task" ADD COLUMN "carried_from_on" date;--> statement-breakpoint
ALTER TABLE "study_task" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "dedication" text;--> statement-breakpoint
ALTER TABLE "plan_build" ADD CONSTRAINT "plan_build_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "plan_build" ADD CONSTRAINT "plan_build_plan_id_study_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "study_plan"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "review_event" ADD CONSTRAINT "review_event_version_id_question_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "question_version"("id");--> statement-breakpoint
ALTER TABLE "review_event" ADD CONSTRAINT "review_event_attempt_item_id_attempt_item_id_fkey" FOREIGN KEY ("attempt_item_id") REFERENCES "attempt_item"("id") ON DELETE SET NULL;
--> statement-breakpoint
UPDATE review_event e SET version_id=i.question_version_id, attempt_item_id=i.id, selected_choice_id=a.selected_choice_id
FROM attempt_item i LEFT JOIN attempt_answer a ON a.attempt_item_id=i.id WHERE e.event_key='practice:' || i.id;
--> statement-breakpoint
ALTER TABLE attempt ADD CONSTRAINT attempt_time_multiplier CHECK (time_multiplier in (100,150,200) AND (mode <> 'strict_mock' OR time_multiplier=100));
--> statement-breakpoint
ALTER TABLE attempt ADD CONSTRAINT attempt_set_kind CHECK (set_kind IS NULL OR set_kind IN ('short','full'));
--> statement-breakpoint
ALTER TABLE review_state ADD CONSTRAINT review_step_bounds CHECK (interval_step BETWEEN 0 AND 4);
--> statement-breakpoint
ALTER TABLE study_task ADD CONSTRAINT task_kind CHECK (kind in ('review','priority','mixed'));
