-- A version's answer key must belong to that version. Deferral permits inserting
-- the version and its choices together, in either order, in one transaction.
ALTER TABLE question_version ADD CONSTRAINT question_key_membership
  FOREIGN KEY (id, answer_choice_id) REFERENCES choice(question_version_id, id)
  DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
CREATE FUNCTION protect_published_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('published', 'retired', 'quarantined') THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Published history cannot be deleted'; END IF;
    IF NEW.status NOT IN ('published', 'retired', 'quarantined') OR
       (to_jsonb(NEW) - 'status' - 'erratum') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'erratum') THEN
      RAISE EXCEPTION 'Published content is immutable; create a new version';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
--> statement-breakpoint
CREATE TRIGGER question_version_immutable BEFORE UPDATE OR DELETE ON question_version
FOR EACH ROW EXECUTE FUNCTION protect_published_version();
--> statement-breakpoint
CREATE TRIGGER lesson_version_immutable BEFORE UPDATE OR DELETE ON lesson_version
FOR EACH ROW EXECUTE FUNCTION protect_published_version();
--> statement-breakpoint
CREATE FUNCTION protect_published_choice() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE version_id text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT id INTO version_id FROM question_version WHERE id = OLD.question_version_id AND status IN ('published','retired','quarantined') FOR UPDATE;
    IF FOUND THEN RAISE EXCEPTION 'Published choices are immutable'; END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT id INTO version_id FROM question_version WHERE id = NEW.question_version_id AND status IN ('published','retired','quarantined') FOR UPDATE;
    IF FOUND THEN RAISE EXCEPTION 'Published choices are immutable'; END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
--> statement-breakpoint
CREATE TRIGGER choice_immutable BEFORE INSERT OR UPDATE OR DELETE ON choice
FOR EACH ROW EXECUTE FUNCTION protect_published_choice();
--> statement-breakpoint
CREATE FUNCTION protect_exam_profile() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.active OR EXISTS (SELECT 1 FROM attempt WHERE profile_version_id = OLD.id)) AND
     (to_jsonb(NEW) - 'active') IS DISTINCT FROM (to_jsonb(OLD) - 'active') THEN
    RAISE EXCEPTION 'Active or used exam profiles are immutable';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER exam_profile_immutable BEFORE UPDATE ON exam_profile_version
FOR EACH ROW EXECUTE FUNCTION protect_exam_profile();
--> statement-breakpoint
CREATE FUNCTION protect_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'status' - 'submitted_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'submitted_at') THEN
    RAISE EXCEPTION 'Attempt owner, profile and original deadline are immutable';
  END IF;
  IF OLD.status <> 'in_progress' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Attempt is terminal'; END IF;
  IF NEW.status <> 'in_progress' AND NEW.submitted_at IS NULL THEN NEW.submitted_at := clock_timestamp(); END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER attempt_immutable BEFORE UPDATE ON attempt FOR EACH ROW EXECUTE FUNCTION protect_attempt();
--> statement-breakpoint
CREATE FUNCTION protect_attempt_item() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent attempt;
BEGIN
  SELECT * INTO parent FROM attempt WHERE id = NEW.attempt_id FOR UPDATE;
  IF parent.status <> 'in_progress' OR (parent.expires_at IS NOT NULL AND parent.expires_at <= clock_timestamp()) THEN RAISE EXCEPTION 'Attempt is terminal or expired'; END IF;
  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - 'flagged') IS DISTINCT FROM (to_jsonb(OLD) - 'flagged') THEN RAISE EXCEPTION 'Attempt items are pinned'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER attempt_item_pinned BEFORE INSERT OR UPDATE ON attempt_item FOR EACH ROW EXECUTE FUNCTION protect_attempt_item();
--> statement-breakpoint
CREATE FUNCTION check_answer_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent attempt;
BEGIN
  SELECT a.* INTO parent FROM attempt a JOIN attempt_item i ON i.attempt_id = a.id WHERE i.id = NEW.attempt_item_id FOR UPDATE OF a;
  IF parent.status <> 'in_progress' OR (parent.expires_at IS NOT NULL AND parent.expires_at <= clock_timestamp()) THEN RAISE EXCEPTION 'Attempt is terminal or expired'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.attempt_item_id <> OLD.attempt_item_id OR NEW.question_version_id <> OLD.question_version_id OR NEW.revision <> OLD.revision + 1 THEN RAISE EXCEPTION 'Stale answer revision'; END IF;
  ELSIF NEW.revision <> 1 THEN RAISE EXCEPTION 'First answer revision must be one'; END IF;
  NEW.saved_at := clock_timestamp();
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER answer_revision_guard BEFORE INSERT OR UPDATE ON attempt_answer FOR EACH ROW EXECUTE FUNCTION check_answer_revision();
--> statement-breakpoint
CREATE FUNCTION protect_result() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent attempt;
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'Original results are immutable'; END IF;
  SELECT * INTO parent FROM attempt WHERE id = NEW.attempt_id FOR UPDATE;
  IF parent.status = 'in_progress' THEN RAISE EXCEPTION 'Finalize the attempt before storing its result'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER result_immutable BEFORE INSERT OR UPDATE ON attempt_result FOR EACH ROW EXECUTE FUNCTION protect_result();
