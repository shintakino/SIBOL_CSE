# Private deployment and recovery

Release acceptance is conditional. Local automation cannot supply licensed/reviewed content, a verified CSC announcement, a real email provider/domain, assistive-technology checks or a usable week of pilot study. Track those gates in `context/progress-tracker.md`. Do not expose this app before completing them.

## Configuration and controlled rollout

Use the same three Compose files for every release command:

```bash
docker compose -f docker-compose.yml -f docker-compose.ops.yml -f docker-compose.release.yml --profile app --profile ops config --quiet
```

Set the placeholders in `.env.example` in a private environment file. `DB_POOL_MAX` is bounded to 2–50 connections per API process (default 10); budget the total across replicas, maintenance and backups. Measure before tuning it; pool size alone is not a performance guarantee. `PUBLIC_HOST` is a DNS hostname, without scheme or port; both `BETTER_AUTH_URL` and `CORS_ORIGIN` are its exact HTTPS origin. `APP_DATABASE_URL` is the container URL with a URL-encoded password; `POSTGRES_PASSWORD` is the raw password. Configure the actual SMTP provider and sender. Never print resolved Compose configuration containing secrets into shared logs. PostgreSQL has no published release port, belongs to an internal network, and uses a persistent volume. The development overlay must not be used in production. Caddy exposes 80/443 and automatically obtains/renews certificates for the configured DNS name. Permit inbound ports and point DNS before startup. The web loopback port is for local inspection only.

1. Freeze the source and lockfile; run type, lint, unit/integration, browser, build and browser-boundary checks. Build immutable web/API/migration/backup image tags from the same source and retain the previous images.
2. Wait for all image builds to finish and verify the intended image tags before running migration tools; never use an older migration image while its replacement is still building. Take and verify an encrypted backup using the operations commands below. For a first install, start PostgreSQL, then apply migrations before the first backup (there is no user data yet).
3. Wait for a completed build of the migration image from the same checkout (or pull its immutable release tag); a stale migration image must never be reused. For local Compose builds:

```bash
docker compose -f docker-compose.yml -f docker-compose.ops.yml -f docker-compose.release.yml --profile app --profile tools --profile ops build server web migrate backup
```

In a maintenance window, stop traffic, then run the controlled migration service once:

```bash
docker compose -f docker-compose.yml -f docker-compose.ops.yml -f docker-compose.release.yml --profile tools run --rm migrate
docker compose -f docker-compose.yml -f docker-compose.ops.yml -f docker-compose.release.yml --profile app --profile ops up -d --build
```

4. Inspect `/health/live` and `/health/ready` inside the API container and the HTTPS sign-in page through Caddy. Check secure HttpOnly/Lax cookies, invitation/recovery mail, and an owner-only study/save flow. Bootstrap the first administrator using the stdin command in the root README. Never seed synthetic content into production.
5. Monitor readiness and backup health. Logs contain structural events and request IDs, without submitted answers/notes, credentials, tokens or full email links. Caddy access logs are disabled. Existing PostgreSQL-backed request limits apply across API replicas; caller-supplied forwarded IP headers are not trusted. Establish a trusted proxy/IP policy before increasing anonymous limits.

Rollback an application image only when it is compatible with the applied schema. There are no automatic down migrations. A destructive/incompatible schema rollback requires offline restore into a new database, deletion reconciliation and validation, with loss of writes after the backup disclosed. Never run a destructive rollback over the live volume.

## Encrypted backups and retention

Generate an **age** identity on an operator-controlled machine. Put only its public recipient in `BACKUP_AGE_RECIPIENT`; store the private identity offline, separately from the server/backups, with a tested recovery copy. The backup worker receives no decryption key. Create `BACKUP_DIRECTORY` on encrypted storage, writable by `BACKUP_UID:BACKUP_GID` (defaults 1000:1000), mode 0700. Set `BACKUP_IDENTITY_FILE` only on the machine performing restore.

```bash
pnpm ops:backup
pnpm ops:ledger
```

The worker writes a custom PostgreSQL 17 dump directly into age encryption, atomically renames successful archives, and writes SHA-256/JSON manifests. No plaintext dump is written. It backs up at least daily (23-hour threshold checked hourly), prunes archives at 30 days, and refreshes the encrypted opaque deletion-receipt journal hourly. Health fails if no dump succeeded within 26 hours or the journal is over two hours old. An unhealthy container needs operator alerting; Docker does not restart a merely unhealthy container. Process failures restart it through `unless-stopped`.

Initial objectives: **RPO 24 hours, RTO 4 hours**. These are objectives, not a measured production SLA. Mount an off-host backup destination or configure a separate encrypted replication job; a directory on the application host alone does not survive host loss. Mirror ciphertext, manifests and the latest deletion journal; verify destination age/retention and alarm on failed sync. Keep keys out of images, source control, logs and application exports. Expired backups must also expire on replicas and operator copies. Deletion receipts contain opaque user/receipt identifiers and dates and are retained to prevent restored accounts from returning.

## Offline restore and deletion reconciliation

1. Stop application traffic/writers. Capture `pnpm ops:ledger` from the surviving source immediately before restore and copy its encrypted journal to the backup destination. Verify its freshness against the last accepted deletions. If the source is lost, reconcile the recovered journal with operator-held deletion receipts; **do not reopen traffic when recent deletions cannot be accounted for**. The hourly journal has a durability window and cannot prove missing receipts after a host loss. Keep request receipts for this contingency.
2. Select an archive less than 30 days old; verify checksum and offline key availability. Configure `BACKUP_FILE` to its basename and `RESTORE_DATABASE` to a new safe identifier ending in `_restore`. Never point it at the live database. Keep the restore target disconnected from the application.

```bash
docker compose -f docker-compose.yml -f docker-compose.ops.yml -f docker-compose.release.yml --profile tools run --rm restore
# Decrypt receipts only through a pipe; no plaintext journal file is needed.
age --decrypt --identity "$BACKUP_IDENTITY_FILE" "$BACKUP_DIRECTORY/deletions.json.age" |
  docker compose -f docker-compose.yml -f docker-compose.ops.yml -f docker-compose.release.yml --profile tools run --rm -T reconcile
```

The tools refuse existing/live targets, require a checksum and deletion journal, and restore in one transaction. Reconciliation reapplies each receipt, clears restored sessions/reset tokens and keeps immutable published versions intact. It is safe to repeat. If reconciliation fails, retain the offline target for investigation; do not cut over. Apply newer migrations with a temporary migration URL pointing at this target, then reconcile again before reopening it.

3. Verify schema/migration count, published item/version counts and immutable keys, surviving owners' counts, deleted owners' absence, revoked sessions and representative study flows. Record archive time, last source write, start/end times and any data loss. Copy the restored database into the intended deployment configuration only after those checks and source cutover approval. Revoke credentials/change secrets if recovering from compromise.

## Repeatable local evidence

```bash
# Requires migrated synthetic fixtures in the dedicated *_test DB; never use production.
docker compose -f docker-compose.yml -f docker-compose.ops.yml --profile ops build backup
TEST_DATABASE_URL=postgresql://.../sibol_test bun scripts/ops-rehearsal.ts
TEST_DATABASE_URL=postgresql://.../sibol_test pnpm ops:benchmark
```

Do not run benchmark/tests/browser suites/rehearsal concurrently against the same database. The benchmark clears the test bank and creates 20 synthetic owners with full 150-item strict mocks. It authenticates fixture sessions before measuring real loopback HTTP, checks safe feedback payloads, and records 300 read/300 save samples, p50/p95, payload size and hardware/runtime. It excludes proxy/TLS latency; repeat through the actual release topology and on target hardware before acceptance. Reports, private rehearsal keys, ciphertext and retained `_restore` databases are local artifacts; remove them under the same retention policy after inspection.

Manual release record must include a real phone and keyboard, Filipino display, screen-reader question navigation, import error handling, actual provider recovery, export/deletion, restart/persistence and restore, plus a usable week of study. Automated Chromium/axe checks support these checks and do not replace them.
