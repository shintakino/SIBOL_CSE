# Operations and release acceptance

Status: operational tooling implemented; local rehearsals and invitation-only public HTTPS installation verified. Release acceptance remains open (performance and external/manual/content/pilot gates).
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

## Delivered tooling and evidence

See the [operations runbook](../../ops/README.md) for controlled image/migration rollout, secret handling, release network isolation, Caddy HTTPS, backup and restore commands, rollback limits and the operator checklist. The release overlay keeps PostgreSQL on an internal network with no published port; app images run as Node/Bun users. Application processes never migrate on startup; the Coolify release orchestrates a single backup/migration prerequisite job.

Daily PostgreSQL custom dumps stream into age encryption, retain ciphertext/manifests for 30 days and expose backup/journal freshness health. Restore requires a new `_restore` target, valid checksum, archive age and deletion journal. Offline reconciliation reapplies opaque deletion receipts and revokes sessions/reset tokens before cutover. The runbook explicitly addresses the hourly journal durability window: missing recent receipts must be accounted for before traffic resumes. Off-host storage, replication and alert activation require deployment configuration.

Local evidence includes isolated Compose migrations, HTTPS through a trusted Caddy local CA, secure cookie flags, non-root users, database port isolation, health and restart persistence, and encrypted restore with post-backup deletion reconciliation. The subsequent Coolify installation verifies public Cloudflare DNS/HTTPS, HSTS, secure cookies, sign-in and captured recovery links at sibol.shintakino.qzz.io; it does not claim transactional provider delivery. Automated backend tests cover the specified privacy/timing/scoring/retry/publication/planner invariants; all 14 production Chromium flows passed, including onboarding/practice/review, strict expiry/results and account data controls.

The reproducible `ops:benchmark` uses real loopback HTTP, 20 simultaneous owners, full 150-item strict mocks and roughly 309 KB safe payloads. It records 300 reads/300 saves, warmup, p50/p95 and hardware/runtime. It intentionally exits unsuccessfully when the 500 ms target is missed. Final results and any unmet gates are recorded in the [progress tracker](../progress-tracker.md), without treating shipped tooling as performance acceptance.

See the [Coolify deployment runbook](../../deploy/README.md) for the isolated Compose application, pinned-source GitHub CI/CD, manual command, private mail access and runtime configuration. Public readiness reports the source revision; GitHub verifies it after deployment.

Remaining release gates: measured performance on the intended deployment topology; real-provider email and off-host backup/alerts; selected-level reviewed content/source/inventory/forms; actual phone/keyboard/Filipino/screen-reader/cross-browser checks; and a usable week-long pilot. The external installation remains pre-launch; no full release acceptance or release date is claimed.
