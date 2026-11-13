CREATE INDEX "attempt_owner_time_idx" ON "attempt" ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "review_history_idx" ON "review_event" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "review_question_history_idx" ON "review_event" ("user_id","question_id","created_at");