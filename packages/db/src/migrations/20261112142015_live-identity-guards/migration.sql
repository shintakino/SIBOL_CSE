-- A sign-in that began before deletion must not create a usable session afterward.
CREATE FUNCTION require_live_session_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM user_profile WHERE user_id=NEW.user_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account is unavailable'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER live_session_owner BEFORE INSERT ON session FOR EACH ROW EXECUTE FUNCTION require_live_session_owner();
--> statement-breakpoint
-- Initial invitation/bootstrap transactions may create credentials before a profile.
-- An explicit deletion receipt distinguishes that case from credential resurrection.
CREATE FUNCTION reject_deleted_credentials() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM user_profile WHERE user_id=NEW.user_id FOR KEY SHARE;
  IF NOT FOUND AND EXISTS(SELECT 1 FROM deletion_receipt WHERE user_id=NEW.user_id) THEN RAISE EXCEPTION 'Account is deleted'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER live_credential_owner BEFORE INSERT ON account FOR EACH ROW EXECUTE FUNCTION reject_deleted_credentials();
