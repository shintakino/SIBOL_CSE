CREATE TABLE "deletion_receipt" (
	"user_id" text PRIMARY KEY,
	"receipt_id" text NOT NULL UNIQUE,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "display_preferences" (
	"user_id" text PRIMARY KEY,
	"theme" text DEFAULT 'light' NOT NULL,
	"motion" text DEFAULT 'system' NOT NULL,
	"in_app_reminders" boolean DEFAULT true NOT NULL,
	"future_email_opt_in" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "display_values" CHECK ("theme" in ('light','dark') and "motion" in ('system','reduce') and "revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "private_note" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "private_note" ADD COLUMN "mutation_id" text;--> statement-breakpoint
ALTER TABLE "private_note" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "private_note" ADD CONSTRAINT "private_note_user_id_lesson_id_unique" UNIQUE("user_id","lesson_id");--> statement-breakpoint
ALTER TABLE "display_preferences" ADD CONSTRAINT "display_preferences_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "private_note" ADD CONSTRAINT "note_revision" CHECK ("revision" > 0);--> statement-breakpoint
ALTER TABLE "private_note" DROP CONSTRAINT "note_length", ADD CONSTRAINT "note_length" CHECK (("deleted_at" is null and length("body") between 1 and 10000) or ("deleted_at" is not null and "body" = ''));