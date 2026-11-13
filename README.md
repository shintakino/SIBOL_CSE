# Sibol CSE

A private civil service review companion. This repository implements specifications 00–13: accounts, content administration, lessons/practice/diagnostics, spaced review, planning, dashboard, timed mocks, learning analytics, saved/search libraries and account data controls. Specification 14 has operational tooling and local rehearsals; performance and external/manual/content/pilot release gates remain open. Learning content appears only after explicit editorial review and publication. The development database starts with the topic taxonomy; it has no learning bank or activated exam profile.

## Local development

Prerequisites: Node.js 22.22+ (the web runs on Node), Bun 1.4.4+, pnpm 11.1.1, and Docker Compose v2. Bun is needed by the API, tests and administrator command; pnpm remains the workspace package manager.

```bash
cp .env.example .env
# Replace BETTER_AUTH_SECRET in .env with: openssl rand -hex 32
pnpm install --frozen-lockfile
pnpm db:start
pnpm db:migrate
pnpm dev
```

Web: http://localhost:3001 · API readiness: http://localhost:3000/health/ready · Local email inbox: http://localhost:8025. Development PostgreSQL binds **127.0.0.1:55439**; the production Compose file has no database port binding. Local SMTP goes to Mailpit on 127.0.0.1:1025. Mailpit is a development email sink, never a production provider.

There is no public signup, seeded account, or default administrator password. Create the first administrator from the repository root using a password supplied on stdin (12–128 characters):

```bash
read -rs -p 'Administrator password: ' sibol_admin_password
printf '\n'
printf '%s' "$sibol_admin_password" | pnpm admin:bootstrap admin@example.com 'Your name'
unset sibol_admin_password
```

The command reads the root `.env`, refuses to create another first administrator, and audits creation. Sign in, complete your own onboarding, then open **Invitations & access**. New invitations are sent by SMTP, expire after 48 hours, and create learner accounts. Only the token hash is stored. A transaction locks and consumes the invitation alongside Better Auth user/account creation; acceptance is not automatic sign-in.

Password recovery sends a 30-minute Better Auth reset link through SMTP and revokes sessions after a successful reset. Invalid, expired and reused links fail. The recovery form returns the same message for known and unknown email addresses.

## Workspace and commands

| Path | Responsibility |
| --- | --- |
| `apps/web` | Next App Router pages, Node runtime, same-origin `/api` proxy |
| `apps/server` | Bun/Hono host, origin/body/rate limits, health checks, oRPC |
| `packages/api` | Validated contracts, permissions, editorial and learning services |
| `packages/auth` | One Better Auth integration and SMTP delivery |
| `packages/db` | PostgreSQL schema, Drizzle relations and checked-in migrations |
| `packages/ui` | Shared shadcn/Base UI primitives, semantic tokens, `cn()` |
| `scripts` | First-admin bootstrap and browser-bundle boundary validation |

| Command | Purpose |
| --- | --- |
| `pnpm dev`, `pnpm dev:web`, `pnpm dev:server` | Run both apps or either app |
| `pnpm check-types` | Typecheck all workspace packages, tools and tests |
| `pnpm lint`, `pnpm format` | Biome checks and formatting |
| `pnpm build` | Build API declarations, standalone Next web and Bun API bundles |
| `pnpm check:boundaries` | Check web imports and the production browser chunks for server material (run after build) |
| `pnpm db:generate` | Generate a new Drizzle schema migration |
| `pnpm db:migrate` | Apply checked-in migrations, including SQL integrity guards |
| `pnpm db:studio` | Inspect the development database |
| `pnpm db:stop` | Stop this project's PostgreSQL service |

Use migrations for reproducibility. `db:push` is available for disposable exploration, but it does not install the custom SQL guards and is not a deployment or test setup path. Published content/choices cannot be rewritten. Attempt owner/profile/deadline and pinned item order are immutable; answer revisions, choice membership, terminal state and result uniqueness are database-enforced. The attempt service selects published versions, checks save revisions, separates saves from feedback commitment, and finalizes one original result. Review, planning, server-timed mocks and derived analytics build on that same attempt service. Bookmark/note libraries/search and remaining data controls are specifications 12–13.

The browser imports only validated contracts and API types. It never imports database/auth-server packages. Hono owns business operations. Personal reads/writes derive the owner from the session; administrator access returns account identity/role metadata, never another learner's answers or notes. Role changes are audited, revoke the target's sessions, and cannot demote the last administrator.

Onboarding requires an explicit exam level, study days and daily minutes. The optional date is a **personal target**, not an official announcement. Availability/level changes use checked preference revisions and supersede the starter plan while keeping its old tasks and attempt profile references. Diagnostics provide observed topic evidence. Weekly plans allocate actual study tasks from availability, review burden, evidence and reviewed inventory; skipping uses broad coverage without invented proficiency.

## Content and learning workflow

Open **Settings → Content workspace** as an administrator. Create a question or structured lesson draft with authorship/permission metadata, complete all five review checks, then publish explicitly. A question has stable choice IDs and one primary scoring topic. Corrections create a new version; publishing a correction requires an erratum. Earlier attempts retain their original keys and scores. Issue reports can quarantine the stable question, removing it from future selection while pinned attempts show a warning. No rescoring operation is exposed.

Lessons contain concept, worked example, common mistake and technique sections. Blocks support plain text, readable math, captioned tables, step diagrams and raster media with alt text. Authored HTML is rejected. Media references must use `/media/name.png`, `.jpg`, `.jpeg` or `.webp`; place the reviewed files in `apps/web/public/media` before building. There is no media upload service in this slice.

**Imports** accepts 1–100 question rows, up to 512 KiB. JSON is an array of question objects; CSV uses the same field names, with JSON-encoded `choices`, `source`, `media` and `distractorExplanations` cells (standard CSV quoting). Required fields are `externalId`, `level`, `topicId`, `language`, `difficulty`, `prompt`, `choices`, `answerChoiceId`, `explanation`, `source`. Optional fields are `passage`, `media`, `distractorExplanations`. A choice is `{ "id": "a", "text": "..." }`. Source metadata includes `title`, `author`, `rights` (`original`, `licensed`, `permitted`), `rightsStatement`, HTTPS `url` or `null`, and optional HTTPS `references`. Use IDs from the topic selector/API. Preview displays row errors; commit creates drafts only. Repeated commit returns the original outcome.

**Profiles & inventory** requires an administrator to verify an applicable CSC announcement, its source/date and exclusion of EDQ from scoring before activation. Defaults are Professional 150 scored questions / 190 minutes and Subprofessional 145 / 160; confirm them against the applicable announcement. Diagnostic length defaults to 30. Blueprint quotas are editorial allocations. The content launch gate checks 300 published unique questions per level, at least 30 per major area, a structured lesson per enabled topic, all blueprint quotas and two persisted complete nonoverlapping forms. Real reviewed content and official-source verification are still required; synthetic tests never seed the development database.

Learners can resume reading, save a section and mark reading complete separately from proficiency. Practice selects 5/10/20 items by topic/difficulty, with unseen-first ordering. Saves acknowledge server acceptance; an explicit commit reveals practice feedback and locks the answer. Retry and reload controls recover failed saves. Private notes, bookmarks, confidence and issue reports are available in the player. Diagnostics balance areas/topics for the selected level and withhold explanations until completion. Missing inventory blocks creation without shrinking the set. Skipping records a balanced starter plan with insufficient-evidence labels. Results distinguish observed samples from official ratings; topics with fewer than ten first-exposure answers remain provisional.

## Review, planning and daily study

**Mistake notebook** (`/review`) groups owner-private history by concept. Incorrect/skipped practice answers and optional correct answers marked guessed enter the queue. Only currently published, enabled, undisputed questions are eligible for future sessions. A mistake resets the interval to the next study-calendar day. A correct scheduled review advances to 3, 7, 14, then 30 days, at most once per calendar day. Early correct responses do not advance. **Review again tomorrow** resets the interval and prevents another advance that day. These are deterministic product defaults. History keeps original versions, responses, corrections and outcomes after later success, including when its originating attempt is deleted.

**Weekly plan** (`/plan`) generates on demand in five-minute units. Default allocation is 20% due reviews, 60% priority topics, 20% mixed retrieval; change the percentages in the plan screen. Sparse evidence favors broad coverage. Otherwise first-exposure accuracy, due burden and gaps inform recommendations. Completed tasks persist across rebuilds and preference changes and consume the remaining daily budget. Carryover moves at most **two five-minute tasks**, within **20% of remaining weekly time**, rounded down to five minutes. Uncarried missed tasks are archived; tasks older than 14 days are not carried. Nothing is scheduled beyond the learner's personal target date. Task completion is explicitly self-reported and never adds proficiency evidence. Changing availability preserves the allocation settings and older attempts.

**Today** shows the next task, due reviews, weekly completion, acknowledged attempt resume, the original strict deadline, recent practice accuracy, evidence-based or sparse-evidence recommendations and a clearly personal target countdown. An optional dedication is configured by the learner. Expired attempts finalize on access. The app uses Asia/Manila calendar dates by default; calendar decisions come from the server, rather than the device clock.

## Timed study and learning analytics

**Timed sets & mocks** (`/mock-exams`) offers strict short sets of 10/20/30 questions with duration proportional to the activated profile, rounded up to full minutes. Short non-strict timed practice offers standard, 1.5× or 2× time and is labeled/tracked separately; it also has no pause. Full strict mocks recheck the complete content gate and use a published blueprint with validated nonoverlapping forms. Professional baseline is 150/190 minutes and Subprofessional 145/160; an administrator must still freshly verify the applicable official announcement. EDQ is excluded. Selection prefers unseen stable questions and discloses repeats.

Server/database timestamps own start and expiry. The browser countdown uses a server sample and monotonic elapsed time, synchronizing on focus/reconnect and periodically. Refresh and device-clock changes never extend the deadline. The player withholds strict solutions/private study tools, acknowledges saves, supports flags and editable answers until submission, and confirms unanswered items. Post-deadline saves fail; submit/expiry races produce one result. Flags and tab departure are never treated as cheating evidence. Aggregate analytics and related notebook feedback are unavailable during an active strict assessment to protect the feedback boundary.

**Learning progress** (`/progress`) derives counts, unique coverage, answered first exposures, repeats, provisional topic evidence and separate full-mock/strict-short/practice-time trends from surviving finalized attempts. Results include blanks in accuracy, separately label attempted accuracy and describe pacing as elapsed seconds per presented question (including idle time). The internal consistency indicator needs **85% in each of the last three strict short sets**, **30 distinct items across those sets**, and **five distinct answered items in every enabled topic** outside reviews/full mocks. A topic below that five-item threshold is uncovered. Sparse samples say **needs more evidence**; other labels are **developing** and **consistent practice performance**. These never represent CSC ratings or pass probabilities.

A learner can delete a terminal attempt from its result page. Its answer/result records are removed and derived analytics recalculate; notebook event snapshots remain. Account export/deletion and bookmark/note libraries/search are available in Settings and Saved & search. Administrators have no routine access to another learner's records.

## Saved material and account controls

`/bookmarks` combines lesson/question bookmarks, private notes and topic/keyword search of published lessons and original question versions you have committed or completed. Search does not grant access to newer corrections. During active diagnostics/strict mocks, library/search/private-note access pauses to preserve solution boundaries. Notes are plain text (10,000 characters), checked against saved revisions and limited to 1,000 active notes per owner; bookmarks share that 1,000-item cap. Every view is owner-private, including for administrators.

Settings persist light/dark, reduced motion and in-app reminder choices. Email interest records a future preference only; no scheduled reminder mail/push is sent. Download an owner-only JSON snapshot of settings and learning records without course text, keys or secrets. Confirmed deletion checks the current password and DELETE, clears live learning/auth records and preserves published provenance with pseudonymized identity references. Backups expire after 30 days; retain your deletion receipt for recovery reconciliation.

## Verification

Create a **dedicated** PostgreSQL database whose name ends in `_test`:

```bash
docker compose exec -T postgres createdb -U sibol sibol_test
export TEST_DATABASE_URL=postgresql://sibol:sibol-local-only@localhost:55439/sibol_test
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm test` migrates and **clears all public tables in the named test database**. It refuses URLs without the `_test` suffix. Do not run it against a development or production database, or concurrently with browser tests using the same database. `test:e2e` expects the migrated test database, creates isolated fixture identities, and starts its own Bun API on port 3100 and production Next web on 3101. Test credentials are fixture-only. Mailpit must be running for both suites. Browser traces/screenshots go to ignored `test-results/`; failed traces can contain test-only tokens.

Nine additional PostgreSQL concurrency regressions force both deletion/scheduling orderings and strict/diagnostic startup races against notebook feedback and export. They also verify export snapshot consistency, two-connection parallel operation and failed-stream lock cleanup.

The suites cover invitation/recovery races and replay, role and ownership boundaries, publication/corrections, import validation, inventory/forms, lesson history, save revisions and retry, commit/finalization races, shuffled keys/blanks, expiry, quarantine and balanced diagnostics for both levels, deterministic review schedules, planner carryover/rebuilds, mock quotas/expiry and derived analytics/deletion. Browser flows exercise editorial publication/import, lesson resume/completion, failed-save recovery, private tools, diagnostic skip/completion, mobile planning/review, strict reconnect/device-clock changes/automatic expiry, full-mock deletion, theme persistence, keyboard dialogs, responsive layouts, text resizing and axe accessibility checks. Actual assistive-technology and cross-browser release checks remain in spec 14.

## Coolify deployment and push automation

The server deployment uses [the Coolify runbook](deploy/README.md) and `docker-compose.coolify.yml` at `https://sibol.shintakino.qzz.io`. GitHub validates `main` pushes before Coolify builds/deploys the exact tested revision. `pnpm deploy` manually dispatches the same workflow. Internal mail capture is configured; external SMTP remains deferred.

## Containers and release configuration

```bash
pnpm docker:build
```

Production services are separate non-root web (Node 24) and API (Bun 1.4.4) multi-stage images, with PostgreSQL persistence, readiness/liveness checks and restart policies. Geist is self-hosted from the pinned `geist` package; builds do not fetch Google Fonts. The API bundle includes its runtime dependencies. PostgreSQL and the API are internal services. The release overlay supplies Caddy HTTPS and an internal database network; the base web loopback binding on port 3001 supports local inspection.

Before starting the application profile, set `BETTER_AUTH_URL` and `CORS_ORIGIN` to the same real **HTTPS** public origin, replace the auth secret and database password, and configure `SMTP_URL`/`EMAIL_FROM` with your transactional provider. The API rejects HTTP production auth origins. Secure HttpOnly/Lax cookies and origin checks remain enabled. Browser requests use `/api`; Next routes them internally to Hono. The public origin is also supplied on the server's protected API reads.

Apply migrations as an explicit release step **before** `docker compose --profile app up -d`; do not migrate automatically from application replicas. Use these commands once deployment credentials are supplied: 
```bash
docker compose -f docker-compose.yml -f docker-compose.ops.yml -f docker-compose.release.yml --profile tools run --rm migrate
docker compose -f docker-compose.yml -f docker-compose.ops.yml -f docker-compose.release.yml --profile app --profile ops up -d --build
# Supply the first admin password over stdin, as in the local example:
printf '%s' "$sibol_admin_password" | docker compose -f docker-compose.yml -f docker-compose.ops.yml -f docker-compose.release.yml --profile app run --rm -T server bun dist/bootstrap-admin.mjs admin@example.com 'Your name'
```

Back up before destructive migrations. The [operations runbook](ops/README.md) provides the Caddy HTTPS/release network overlay, encrypted daily backup/30-day retention, restore-to-new-database and deletion reconciliation commands, load benchmark and remaining release gates. Local rehearsals do not establish real-provider/domain readiness or a production SLA. No external deployment was performed.

Authentication and invitation requests use PostgreSQL-backed limits across replicas; incoming forwarded-IP headers are not used by the application limiter. The initial configuration also has a conservative shared anonymous per-path cap. Configure a verified reverse-proxy client-IP policy before increasing traffic. Logs deliberately omit request bodies and bearer tokens; API failures expose a request ID.

## Resolved bootstrap

Created with `create-better-t-stack@3.49.0` after checking CLI help and official documentation, using the PRD's Next/Hono/Bun/oRPC/Better Auth/PostgreSQL/Drizzle/Docker/pnpm/Turborepo flags. Generation took place in a temporary directory, preserving the repository's existing Git history and documents. The Next guides shipped with the installed package were read before frontend implementation.

Resolved versions are pinned by `pnpm-lock.yaml`: Next 16.4.6, React 19.3.1, Hono 4.13.17, oRPC 1.16.2, Better Auth 1.7.12, Drizzle ORM/Kit 1.0.0-rc.5, Tailwind 4.3.5, shadcn 4.23.0, Base UI 1.9.0, Lucide React 1.72.0, Geist 1.9.2, Turborepo 2.11.10. Local verification uses Node 22.22.2, Bun 1.4.4 and pnpm 11.1.1.

The generated Varlock override of Next internals was replaced by server Zod configuration and an in-process local env loader. Do not pass Node's `--env-file` flag to the Next CLI: this version forwards it into worker `NODE_OPTIONS`, where Node rejects it. Frontend standard controls retain the generated shadcn/Base UI semantics and use project-sized variants.

Product scope and remaining work: [PRD](Sibol-CSE-PRD.md), [feature index](context/feature-specs/README.md), [progress tracker](context/progress-tracker.md).
