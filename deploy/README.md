# Sibol on Coolify

Site: **https://sibol.shintakino.qzz.io**. Coolify owns the isolated **Sibol CSE** project/application. Cloudflare Tunnel carries traffic to the private web container; PostgreSQL/API/mail capture have no published ports. Other server applications are separate. This application requires **raw Compose mode**: Coolify's normal parser adds its default network and injects the full env file into every service. The checked-in definition supplies explicit Coolify ownership labels and a fixed project name so its network and credential boundaries remain intact.

Push to `main` to run GitHub Actions checks. A deployment runs only after lint, type checks, PostgreSQL unit/integration/concurrency tests, production API/web builds, all Chromium flows, browser import checks and production Compose validation pass. Pull requests validate on GitHub-hosted runners and cannot deploy. The GitHub `production` environment permits only `main`.

CI pins Coolify to the exact tested Git SHA, starts a source deployment, waits for success and verifies `/api/health/ready` reports that revision over public HTTPS. Superseded main revisions are skipped. Native Coolify push deployment is disabled to prevent bypassing CI. No self-hosted GitHub runner or shared registry credentials are used. Source builds run in Coolify; startup includes a brief service restart, not a zero-downtime guarantee.

## Manual deployment

From an authenticated checkout:

```bash
pnpm run deploy
# Follow the selected workflow run:
gh run list --workflow deploy.yml --limit 5
gh run watch
# On the Docker host after rollout:
pnpm deploy:audit
```

The manual command dispatches the same validated deployment workflow for `main`. It does not bypass tests. The Coolify Deploy button uses the last configured pinned revision; use the workflow for a new release.

## Private configuration

The `production` environment contains the application-scoped `COOLIFY_TOKEN` secret and `COOLIFY_APPLICATION_UUID` variable. Repository variable `SIBOL_DEPLOY_ENABLED=true` activates deployment after validation. The token can change/deploy only this application; it cannot access the other server applications. It expires after one year and must be rotated through Coolify and the GitHub environment secret before then.

Production database/auth/tunnel secrets and the public age backup recipient are runtime variables in Coolify. Build argument injection is disabled, and environment/cache files are excluded from Docker contexts. Operator-only local copies and the offline backup identity are under `.cache/deploy-private/`, mode 0700/0600, outside Git/build contexts. Escrow the backup identity independently from this host.

The initial administrator is `admin@shintakino.qzz.io`. Its generated password is stored only in `.cache/deploy-private/admin.txt` after bootstrap. Public signup remains disabled. **Internal mail capture was selected explicitly:** invitations and recovery mail remain inside the private Mailpit container; no external SMTP delivery is claimed. Configure `SMTP_URL` and `EMAIL_FROM` as Coolify runtime variables and redeploy when a provider is available. Do not publish the Mailpit interface. Its dedicated volume retains messages across deployments, capped at 500 messages/seven days ([Mailpit persistence options](https://mailpit.axllent.org/docs/configuration/runtime-options/)).

To read captured invitations/recovery links, obtain the private container address on the server:

```bash
docker ps --filter name=mailpit-q52xajsad67xkcmtdwjto1uu --format '{{.Names}}'
# Use that container name:
docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' MAILPIT_CONTAINER
```

From your own computer, run `ssh -N -L 8026:MAILPIT_IP:8025 YOUR_SERVER`, substituting that private address and your SSH host. Open `http://localhost:8026` while the SSH session remains connected. No inbox port or hostname is published.

## Data and release safety

Keep the service names, fixed Compose project `q52xajsad67xkcmtdwjto1uu`, raw Compose mode and the three external volumes: `q52xajsad67xkcmtdwjto1uu_sibol-data`, `q52xajsad67xkcmtdwjto1uu_sibol-backups`, `q52xajsad67xkcmtdwjto1uu_sibol-mail`. These attach the existing data; missing volumes fail deployment instead of creating empty replacements. The start command is `docker compose --project-name q52xajsad67xkcmtdwjto1uu -f ./docker-compose.coolify.yml --env-file ./.env up -d --force-recreate --remove-orphans --wait --wait-timeout 240`. Explicit relative file flags avoid the installed Coolify raw-mode helper's host-path mismatch. `pnpm check:deployment` validates these boundaries without production credentials. Never run development tests/seeds or `down --volumes` against this application. PostgreSQL persists across deployments. `pnpm deploy:audit` inspects actual container network membership, credential **keys** (never values), health, successful prerequisite jobs, external volume mounts, unpublished ports and the public source revision.

Each deployment takes an encrypted pre-migration dump, then runs one migration job before the API starts. Application replicas never run migrations. Daily encrypted backups retain 30 days; the deletion journal is refreshed hourly. See [recovery instructions](../ops/README.md) before restoring. Backups currently remain on this server; off-host replication, key escrow and alerts still require operator setup. A failed/incompatible migration requires operator review; no destructive down migration or automatic database rollback runs. Revert application code only when it remains schema-compatible.

The deployment API hostname exposes only the application's configuration/runtime-revision/deploy/status routes, with Coolify authentication and resource scope enforced. Dashboard and other APIs are excluded by tunnel ingress rules. Public sign-in and readiness are checked after deployment. Exact workflow/deployment evidence belongs in the progress tracker.

This is an invitation-only pre-launch deployment. Reviewed question/lesson inventory, verified exam source activation, the measured performance target, manual assistive-technology/phone checks and a usable week of study remain separate release acceptance gates.

## Independent deployment gateway

`sibol-deploy.shintakino.qzz.io` uses its own Cloudflare tunnel and minimal Docker Compose project, `sibol-deploy-gateway`. App releases never restart this control plane, and it has no application/database network membership or published ports. This keeps deployment/status APIs reachable during failed app rollouts. Its ingress still limits requests to the scoped application's configuration/revision/deploy/status routes; the Coolify dashboard is excluded.

The installed gateway's private configuration is under `~/.config/sibol-deploy` (directory 0700, token file 0600), outside this checkout. To apply reviewed gateway config changes on the host, run `pnpm run deploy:gateway`. First installation or token rotation accepts `--token-file /private/path/to/token` after the script name (`pnpm run deploy:gateway --token-file /private/path/to/token`). Keep the gateway running while deploying or repairing the app. PostgreSQL, mail and encrypted archives remain managed by the isolated Coolify application.

## Verified installation baseline

[Automatic push run 43372193921](https://github.com/shintakino/SIBOL_CSE/actions/runs/43372193921) passed validation and deployed source `93a1c97d90346ee4610c5b20fe66944c076cdfee`, with matching public readiness and a passing host audit. The independent control API stayed reachable while the application was stopped. The original administrator, nine migrations and captured inbox messages survived redeployments. The temporary provisioning token is revoked; only the scoped CI deployment credential is retained. Later pushes verify their own exact source revision through the same workflow.
