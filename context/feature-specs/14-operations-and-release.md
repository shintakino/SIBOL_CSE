# Operations and release acceptance

Status: specified; not implemented.
Source: [Sibol CSE PRD](../../Sibol-CSE-PRD.md), PRD §§8, 15–18.

## Scope and acceptance

Depends on implemented MVP and reviewed launch content. Provide multi-stage web/server Docker images, internal PostgreSQL with persistent storage, health/readiness checks, restart policies, HTTPS proxy, and non-root app containers where practical.

Run Drizzle migrations as a controlled release step before rollout, never from every replica. Back up before destructive changes; document rollback limits. Keep development seeds out of production and secrets out of source control. .env.example contains placeholders for database, auth secret/base URL, trusted origin, frontend API origin if needed, and email provider.

Acceptance:
- Rate limits, sanitized imports, request IDs, safe logs, and internal-only production database access are verified.
- Routine read/save API p95 targets under 500ms at 20 concurrent learners on a documented baseline with realistic mock payloads.
- Daily backups with 30-day retention; initial RPO 24 hours and RTO 4 hours; perform a restore rehearsal.
- Automated checks cover cross-user/role isolation; strict solution leakage; deadlines/reconnect/clock changes/submit races; blanks/shuffle/versioned scoring; stale revisions; review idempotency; quota shortages; immutable corrections/errata; planner completion/budget preservation.
- E2E: onboarding → practice → review, and strict mock → expiry → results.
- Manual checks: phone/keyboard flow, Filipino display, screen-reader question navigation, import errors, email recovery, export/deletion, restart and restore.
- Selected-level inventory passes: lessons/examples per enabled topic; 300 reviewed unique questions, 30 per major area, all quotas, two complete nonoverlapping forms.
- All published content is reviewed; learner completes full study flow on phone. Pilot exit requires one usable week.
- No release date is assumed before content sources and reviewer availability are known.
