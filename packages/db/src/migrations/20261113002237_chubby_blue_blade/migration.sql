ALTER TABLE "user_profile" ADD COLUMN "assessment_revision" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- Change the locked owner tuple when an assessment starts. A repeatable-read
-- export whose snapshot predates this commit must abort and retry authorization,
-- rather than lock an unchanged owner row and miss the newly inserted attempt.
CREATE FUNCTION advance_assessment_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE user_profile SET assessment_revision=assessment_revision+1 WHERE user_id=NEW.user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assessment owner is unavailable'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER assessment_owner_fence BEFORE INSERT ON attempt
FOR EACH ROW WHEN (NEW.mode IN ('strict_mock','diagnostic'))
EXECUTE FUNCTION advance_assessment_revision();
