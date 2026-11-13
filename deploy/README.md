# Sibol on Coolify

Site: **https://sibol.shintakino.qzz.io**. Coolify owns the isolated **Sibol CSE** project/application. Cloudflare Tunnel carries traffic to the private web container; PostgreSQL/API/mail capture have no published ports. Other server applications are separate.

Push to `main` to run GitHub Actions checks. A deployment runs only after lint, type checks, PostgreSQL unit/integration/concurrency tests, production API/web builds, all Chromium flows, browser import checks and production Compose validation pass. Pull requests validate on GitHub-hosted runners and cannot deploy. The GitHub `production` environment permits only `main`.

CI pins Coolify to the exact tested Git SHA, starts a source deployment, waits for success and verifies `/api/health/ready` reports that revision over public HTTPS. Superseded main revisions are skipped. Native Coolify push deployment is disabled to prevent bypassing CI. No self-hosted GitHub runner or shared registry credentials are used. Source builds run in Coolify; startup includes a brief service restart, not a zero-downtime guarantee.

## Manual deployment

From an authenticated checkout:

```bash
pnpm deploy
# Follow the selected workflow run:
gh run list --workflow deploy.yml --limit 5
gh run watch
```

The manual command dispatches the same validated deployment workflow for `main`. It does not bypass tests. The Coolify Deploy button uses the last configured pinned revision; use the workflow for a new release.

## Private configuration

The `production` environment contains the application-scoped `COOLIFY_TOKEN` secret and `COOLIFY_APPLICATION_UUID` variable. Repository variable `SIBOL_DEPLOY_ENABLED=true` activates deployment after validation. The token can change/deploy only this application; it cannot access the other server applications. It expires after one year and must be rotated through Coolify and the GitHub environment secret before then.

Production database/auth/tunnel secrets and the public age backup recipient are runtime variables in Coolify. Build argument injection is disabled, and environment/cache files are excluded from Docker contexts. Operator-only local copies and the offline backup identity are under `.cache/deploy-private/`, mode 0700/0600, outside Git/build contexts. Escrow the backup identity independently from this host.

The initial administrator is `admin@shintakino.qzz.io`. Its generated password is stored only in `.cache/deploy-private/admin.txt` after bootstrap. Public signup remains disabled. **Internal mail capture was selected explicitly:** invitations and recovery mail remain inside the private Mailpit container; no external SMTP delivery is claimed. Configure `SMTP_URL` and `EMAIL_FROM` as Coolify runtime variables and redeploy when a provider is available. Do not publish the Mailpit interface.

## Data and release safety

Keep the service names and the `sibol_data` / `sibol_backups` volume identities. `pnpm check:deployment` validates these boundaries without production credentials. Never run development tests/seeds or `down --volumes` against this application. PostgreSQL persists across deployments.

Each deployment takes an encrypted pre-migration dump, then runs one migration job before the API starts. Application replicas never run migrations. Daily encrypted backups retain 30 days; the deletion journal is refreshed hourly. See [recovery instructions](../ops/README.md) before restoring. Backups currently remain on this server; off-host replication, key escrow and alerts still require operator setup. A failed/incompatible migration requires operator review; no destructive down migration or automatic database rollback runs. Revert application code only when it remains schema-compatible.

The deployment API hostname exposes only the application's configuration/deploy/status routes, with Coolify authentication and resource scope enforced. Dashboard and other APIs are excluded by tunnel ingress rules. Public sign-in and readiness are checked after deployment. Exact workflow/deployment evidence belongs in the progress tracker.

This is an invitation-only pre-launch deployment. Reviewed question/lesson inventory, verified exam source activation, the measured performance target, manual assistive-technology/phone checks and a usable week of study remain separate release acceptance gates.
