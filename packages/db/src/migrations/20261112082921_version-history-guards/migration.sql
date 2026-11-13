-- Verification seals a profile's metadata even after it is deactivated.
CREATE OR REPLACE FUNCTION protect_exam_profile() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.active OR OLD.verified_at IS NOT NULL OR EXISTS (SELECT 1 FROM attempt WHERE profile_version_id = OLD.id)) AND
     (to_jsonb(NEW) - 'active') IS DISTINCT FROM (to_jsonb(OLD) - 'active') THEN
    RAISE EXCEPTION 'Verified or used exam profiles are immutable';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION protect_blueprint_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.published OR EXISTS (SELECT 1 FROM attempt WHERE blueprint_version_id = OLD.id) THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Published or used blueprints cannot be deleted'; END IF;
    IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Published or used blueprints are immutable'; END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
--> statement-breakpoint
CREATE TRIGGER blueprint_version_immutable BEFORE UPDATE OR DELETE ON mock_blueprint_version
FOR EACH ROW EXECUTE FUNCTION protect_blueprint_version();
--> statement-breakpoint
CREATE FUNCTION check_attempt_blueprint() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE blueprint mock_blueprint_version;
BEGIN
  IF NEW.blueprint_version_id IS NOT NULL THEN
    SELECT * INTO blueprint FROM mock_blueprint_version WHERE id = NEW.blueprint_version_id FOR SHARE;
    IF NOT FOUND OR blueprint.profile_version_id <> NEW.profile_version_id THEN RAISE EXCEPTION 'Attempt blueprint must match its original exam profile'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER attempt_blueprint_membership BEFORE INSERT ON attempt
FOR EACH ROW EXECUTE FUNCTION check_attempt_blueprint();
