CREATE TABLE "content_asset" (
	"id" text PRIMARY KEY,
	"mime" text NOT NULL,
	"data" bytea NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_asset_size" CHECK (octet_length("data") between 1 and 5242880),
	CONSTRAINT "content_asset_mime" CHECK ("mime" in ('image/png','image/jpeg','image/webp','image/gif')),
	CONSTRAINT "content_asset_hash" CHECK (encode(sha256("data"), 'hex') = "id")
);
--> statement-breakpoint
CREATE TABLE "provider_bank" (
	"id" text PRIMARY KEY,
	"provider" text NOT NULL,
	"manifest_hash" text NOT NULL UNIQUE,
	"permission_hash" text NOT NULL,
	"mode" text DEFAULT 'api_sample' NOT NULL,
	"expected_ids" jsonb,
	"report" jsonb NOT NULL,
	"coverage_verified" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_verified_source" CHECK (not "coverage_verified" or ("mode" in ('export','feed') and "expected_ids" is not null))
);
--> statement-breakpoint
CREATE TABLE "provider_snapshot" (
	"bank_id" text,
	"source_key" text,
	"provider_question_id" text NOT NULL,
	"category" text,
	"subcategory" text,
	"levels" "exam_level"[] NOT NULL,
	"topic_id" text,
	"raw" jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"question_id" text,
	"held_reasons" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "provider_snapshot_pkey" PRIMARY KEY("bank_id","source_key","category","subcategory")
);
--> statement-breakpoint
ALTER TABLE "attempt_answer" ADD COLUMN "selected_order" text[];--> statement-breakpoint
ALTER TABLE "attempt_item" ADD COLUMN "item_order" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "choice" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "choice" ADD COLUMN "media" jsonb;--> statement-breakpoint
ALTER TABLE "question_version" ADD COLUMN "import_hash" text;--> statement-breakpoint
ALTER TABLE "question_version" ADD COLUMN "levels" "exam_level"[];--> statement-breakpoint
ALTER TABLE "question_version" ADD COLUMN "kind" text DEFAULT 'choice' NOT NULL;--> statement-breakpoint
ALTER TABLE "question_version" ADD COLUMN "instruction" text;--> statement-breakpoint
ALTER TABLE "question_version" ADD COLUMN "highlight" text;--> statement-breakpoint
ALTER TABLE "question_version" ADD COLUMN "order_items" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "question_version" ADD COLUMN "answer_order" text[];--> statement-breakpoint
ALTER TABLE "question_version" ADD COLUMN "provider" jsonb;--> statement-breakpoint
ALTER TABLE "review_event" ADD COLUMN "selected_order" text[];--> statement-breakpoint
ALTER TABLE "question_version" ALTER COLUMN "answer_choice_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "question_version" ADD CONSTRAINT "question_version_question_id_import_hash_unique" UNIQUE("question_id","import_hash");--> statement-breakpoint
CREATE INDEX "provider_snapshot_topic_idx" ON "provider_snapshot" ("bank_id","category","subcategory");--> statement-breakpoint
CREATE INDEX "provider_snapshot_question_idx" ON "provider_snapshot" ("question_id");--> statement-breakpoint
ALTER TABLE "content_asset" ADD CONSTRAINT "content_asset_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "provider_bank" ADD CONSTRAINT "provider_bank_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "provider_snapshot" ADD CONSTRAINT "provider_snapshot_bank_id_provider_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "provider_bank"("id");--> statement-breakpoint
ALTER TABLE "provider_snapshot" ADD CONSTRAINT "provider_snapshot_topic_id_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topic"("id");--> statement-breakpoint
ALTER TABLE "provider_snapshot" ADD CONSTRAINT "provider_snapshot_question_id_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question"("id");--> statement-breakpoint
ALTER TABLE "attempt_answer" ADD CONSTRAINT "answer_single_representation" CHECK ("selected_choice_id" is null or "selected_order" is null);--> statement-breakpoint
ALTER TABLE "question_version" ADD CONSTRAINT "question_kind" CHECK ("kind" in ('choice','error','order'));--> statement-breakpoint
ALTER TABLE "question_version" ADD CONSTRAINT "question_response_key" CHECK (("kind" = 'order' and "answer_choice_id" is null and "answer_order" is not null and cardinality("answer_order") >= 2 and jsonb_array_length("order_items") = cardinality("answer_order")) or ("kind" in ('choice','error') and "answer_choice_id" is not null and "answer_order" is null));--> statement-breakpoint
ALTER TABLE "question_version" ADD CONSTRAINT "question_supported_levels" CHECK ("levels" is null or (cardinality("levels") between 1 and 2 and "level" = any("levels") and (cardinality("levels") = 1 or "levels"[1] <> "levels"[2])));
--> statement-breakpoint
CREATE FUNCTION validate_question_format() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ids text[];
BEGIN
  IF NEW.kind = 'order' THEN
    SELECT array_agg(value->>'id') INTO ids FROM jsonb_array_elements(NEW.order_items);
    IF ids IS NULL OR cardinality(ids) < 2 OR cardinality(ids) <> (SELECT count(DISTINCT x) FROM unnest(ids) x) OR NEW.answer_order IS NULL OR cardinality(NEW.answer_order) <> cardinality(ids) OR cardinality(NEW.answer_order) <> (SELECT count(DISTINCT x) FROM unnest(NEW.answer_order) x) OR NOT (NEW.answer_order @> ids AND ids @> NEW.answer_order) THEN
      RAISE EXCEPTION 'Ordering keys require every unique item exactly once';
    END IF;
  ELSIF NEW.order_items <> '[]'::jsonb OR NEW.answer_order IS NOT NULL THEN
    RAISE EXCEPTION 'Single-choice questions cannot have ordering fields';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER question_format_guard BEFORE INSERT OR UPDATE ON question_version FOR EACH ROW EXECUTE FUNCTION validate_question_format();
--> statement-breakpoint
CREATE FUNCTION validate_answer_format() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item attempt_item; kind text;
BEGIN
  SELECT * INTO item FROM attempt_item WHERE id = NEW.attempt_item_id;
  SELECT v.kind INTO kind FROM question_version v WHERE v.id = item.question_version_id;
  IF kind = 'order' THEN
    IF NEW.selected_choice_id IS NOT NULL OR (NEW.selected_order IS NOT NULL AND (cardinality(NEW.selected_order) <> cardinality(item.item_order) OR cardinality(NEW.selected_order) <> (SELECT count(DISTINCT x) FROM unnest(NEW.selected_order) x) OR NOT (NEW.selected_order @> item.item_order AND item.item_order @> NEW.selected_order))) THEN
      RAISE EXCEPTION 'Ordering response must match the pinned item membership';
    END IF;
  ELSIF NEW.selected_order IS NOT NULL THEN
    RAISE EXCEPTION 'Single-choice response cannot contain an ordered answer';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER answer_format_guard BEFORE INSERT OR UPDATE ON attempt_answer FOR EACH ROW EXECUTE FUNCTION validate_answer_format();
--> statement-breakpoint
CREATE FUNCTION validate_item_format() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE version question_version; ids text[];
BEGIN
  SELECT * INTO version FROM question_version WHERE id = NEW.question_version_id;
  IF version.kind = 'order' THEN
    SELECT array_agg(value->>'id') INTO ids FROM jsonb_array_elements(version.order_items);
    IF cardinality(NEW.choice_order) <> 0 OR cardinality(NEW.item_order) <> cardinality(ids) OR cardinality(NEW.item_order) <> (SELECT count(DISTINCT x) FROM unnest(NEW.item_order) x) OR NOT (NEW.item_order @> ids AND ids @> NEW.item_order) THEN
      RAISE EXCEPTION 'Ordering presentation must pin every item once';
    END IF;
  ELSIF cardinality(NEW.item_order) <> 0 THEN
    RAISE EXCEPTION 'Single-choice items cannot have ordering presentation fields';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER item_format_guard BEFORE INSERT ON attempt_item FOR EACH ROW EXECUTE FUNCTION validate_item_format();
--> statement-breakpoint
CREATE FUNCTION protect_content_asset() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Content-addressed images are immutable; register a new image instead';
END $$;
--> statement-breakpoint
CREATE TRIGGER content_asset_immutable BEFORE UPDATE OR DELETE ON content_asset FOR EACH ROW EXECUTE FUNCTION protect_content_asset();
