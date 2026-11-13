# Architecture Context

Source: [PRD sections 11–16](../Sibol-CSE-PRD.md). Status: specs 00–13 implemented and concurrency-hardened (13 November 2026); spec 14 release acceptance and real reviewed launch inventory remain open.

## Stack and boundaries

| Layer | Choice | Responsibility |
|---|---|---|
| Web | Next.js + TypeScript | Pages and accessible study player |
| UI | shadcn/ui + Lucide React | Reusable accessible primitives, icons, semantic light-theme styling |
| API | Hono + oRPC | Validation, authorization, selection, scoring, plans |
| Runtime | Bun backend | Validate generated Next runtime separately |
| Auth | Better Auth | Email/password sessions and recovery |
| Storage | PostgreSQL + Drizzle | Versioned content, attempts, learning state, migrations |
| Workspace | pnpm + Turborepo | Packages, lockfile, tasks |
| Deployment | Docker + HTTPS proxy | Web/server services and internal database |

Use the bootstrap command in PRD section 11 after verifying then-supported flags. Record resolved versions and commit the lockfile when Git is initialized. Adapt proposed `apps/web`, `apps/server`, and shared API/auth/database/validation/configuration packages to the generated scaffold. Shared UI is optional. Keep one schema and one auth system.

Browser → HTTPS proxy → Next frontend / Hono API → PostgreSQL. Prefer one public origin with `/api` routed to Hono. Configure Better Auth trusted origins, secure HttpOnly cookies, and appropriate CSRF protection. Hono/oRPC owns business operations; frontend code never imports database access, secrets, answer keys, or unpublished solutions.

## Conceptual data model

| Entities | Constraints and purpose |
|---|---|
| Better Auth tables | Generated user/session/account/verification integration |
| UserProfile, StudyPreferences | Unique userId; role, timezone, language, onboarding, level/date/days/minutes |
| Invitation | Email, hashed token, expiry, single-use acceptance |
| ExamProfileVersion, Topic | Versioned counts/timing/sources; stable slug, parent, supported levels |
| Lesson/LessonVersion, Question/QuestionVersion | Stable identities and immutable published content/metadata |
| Choice, QuestionTopic | Stable choice IDs per version; one primary scoring topic |
| MockBlueprintVersion | Profile version, editorial quotas, duration, version |
| Attempt | Owner, mode, original profile/blueprint versions, state, server timestamps |
| AttemptItem | Unique attempt + position; pinned question version and frozen choice order |
| AttemptAnswer | Unique attempt item; nullable choice, revision, server savedAt |
| AttemptResult | Unique attempt; counts, elapsed time, scoring version |
| ReviewState, ReviewEvent | Unique learner + question state; unique event key and schedule transition |
| StudyPlan, StudyTask, LessonProgress | Owner, period/budget/completion; unique learner + lesson progress |
| Bookmark, PrivateNote | Owner-scoped targets and content |
| QuestionIssue, ContentSource | Reporter/version/resolution; rights and source verification |
| ImportBatch, AuditEvent | File hash/validation/operator/status; actor/action/target/time without secrets |

Use foreign keys, uniqueness, transactions, and indexes for ownership/status, due dates, publication/level/topic, and task dates. PostgreSQL stores structured learning data and versioned content. Media storage, if added, requires a documented provider/access policy.

## Invariants

1. Resolve identity and role from the session on each protected procedure. Owner checks cover personal reads, writes, results, and exports; admin status does not grant routine learner-data access.
2. Selection, scoring, feedback eligibility, and deadlines are server-owned. Strict mocks expose no solutions before completion, including through search or alternate review endpoints.
3. Published versions are immutable. Attempts retain original versions and display order; corrections add errata. Rescoring is explicit and audited.
4. Attempts transition from `in_progress` to `submitted`, `expired`, or `abandoned`. Terminal attempts reject edits. Finalization locks the row and stores one result; retries return it.
5. Save revisions reject stale writes. Server acceptance time determines pre-expiry eligibility. Refresh/reconnect restore acknowledged answers and the original deadline.
6. Inventory validation prevents silent duplicates or shortened full mocks. Review events are idempotent and cannot advance multiple intervals on one day.
7. Compute plans/due reviews on demand; finalize expired attempts on access. Add a lightweight sweep only if needed. MVP needs no Redis, vector database, AI API, or dedicated queue.
8. Store UTC instants and use the learner's timezone for calendar operations, default Asia/Manila.

## API contracts

Follow PRD section 14 groups: profile, onboarding, dashboard, plan, lessons, practice, mocks, attempts, review, progress, bookmarks, notes, issues, account. Admin-only operations cover content, imports, profiles, blueprints, issue resolution, invitations, and roles. Finalize extra diagnostic/search/preference procedure names during implementation; this is not an already-generated API.

## Recorded decisions and rationale

- Bootstrap uses create-better-t-stack 3.49.0 with the PRD flags, generated in a temporary directory and copied into the existing Git repository to preserve documents/history. Generated boundaries include `packages/ui`; PostgreSQL uses Drizzle's generated relations-v2 integration.
- Next runs on Node.js; Hono runs on Bun. Next rewrites `/api/*` to Hono for one browser origin. Runtime configuration uses Zod validation rather than the scaffold's Varlock override of Next internals.
- Public Better Auth signup is disabled. Invitation acceptance writes Better Auth users/credential accounts with its own password hasher and consumes the locked invitation within the same PostgreSQL transaction. No alternate authentication system is introduced.
- Initial onboarding creates a versioned starter-plan record; availability/level changes supersede it while retaining old tasks and attempt profile references. Allocation settings persist across preference revisions. Weekly planning and diagnostic evidence now inform actual scheduled tasks.

- The PRD stack replaces the unrelated template: relational learning history requires transactional consistency and versioned content.
- Server-owned timing/scoring and safe response DTOs preserve feedback boundaries and retry correctness.
- Selected-level launch with both-level architecture prevents content shortages being hidden by application readiness.
- On-demand work keeps the pilot small; add infrastructure only for demonstrated needs.

Operational requirements are in [14-operations-and-release.md](feature-specs/14-operations-and-release.md).

## Content and learning implementation decisions (specs 03–06)

- Authored lessons use validated JSON blocks (text, math, tables, accessible step diagrams, and local raster media with alt text). React renders text directly; no authored HTML is executed. Question passages and explanations are plain text. Imports are capped at 100 rows / 512 KiB, persisted as a validated draft batch, committed transactionally, and published only through explicit checklist review.
- Publication retires an earlier published version under the same stable identity. Corrections attach errata to historical versions without changing their keys or results. Quarantine blocks the stable question from new selection; pinned attempts retain their original item and scoring with a visible warning. No rescore operation is exposed in this slice.
- A verified active exam profile is required for attempt creation. Diagnostic length is an administrator-owned profile setting (default 30, maximum 120); quotas balance major areas, then enabled topics within each area. Missing coverage blocks creation. A separate launch gate requires the PRD inventory and two persisted nonoverlapping mock forms; pilot lessons/practice can operate before full launch readiness.
- Attempt creation locks the learner, reserves first exposure on delivery per stable question, pins versions/choice order, and uses a client request ID for retry-safe creation. Answer saves check expected revisions and mutation IDs; practice commitment is separate from saving. Finalization locks the attempt and creates one immutable result. Diagnostic feedback is withheld until finalization. Owner-scoped feedback and notes also check for active diagnostic/strict-mock exposure. Provisional evidence counts answered first exposures; blanks still count against overall practice accuracy. Catalog publication, retirement, quarantine, profile activation, blueprint/form creation and topic enablement share the launch gate’s transaction lock so readiness cannot race editorial changes.

## Learning-loop decisions (specs 07–11)

- Review uses learner-calendar dates: a mistake or guessed answer resets to tomorrow; eligible correct scheduled reviews advance 3/7/14/30 days once per date. Early correct answers do not advance. A manual tomorrow request sets that date's advancement guard. Immutable event snapshots retain the historical version/outcome even if an attempt is deleted. Published, enabled, undisputed versions alone enter future queues.
- Planner estimates use five-minute units and configurable review/priority/mixed percentages, initially 20/60/20. Carryover is at most two existing tasks and 20% of remaining weekly minutes (rounded down to five); uncarried missed tasks are archived and tasks older than 14 days are not carried. Rebuilds move carried tasks rather than copy them, preserve completed tasks across preference revisions, and subtract completed minutes from remaining daily budgets. Plans stop at the personal target date. Task completion is explicitly self-reported; it does not award assessed proficiency.
- The consistency indicator considers the last three strict short timed sets: every set needs 85% accuracy, their union needs 30 distinct stable questions, and every enabled topic needs five distinct answered questions in completed non-review, non-full-mock work. An uncovered topic is one below that five-item threshold. Sparse evidence yields “needs more evidence”; otherwise the indicator is “developing” or “consistent practice performance.” Full mocks and extended-time practice keep separate trends. These are internal study observations, never official ratings.
- Full strict mocks recheck the selected level's content gate and a published blueprint with validated forms, prefer unseen questions within its quotas, and pin the profile/blueprint/count/duration. Short sets offer 10/20/30 questions with proportional profile duration; 1.5×/2× time is explicitly non-strict practice. Server/database timestamps own deadlines. Browser countdowns use a server sample plus monotonic elapsed time, with refresh/focus/reconnect synchronization.
- Progress metrics are derived from surviving finalized attempts on demand. Results, mistake history, and aggregate analytics check active strict/diagnostic feedback restrictions. Owner-only deletion of a terminal attempt recalculates analytics; historical review events retain their original learning outcome. Optional dedication is owner-configured plain text.

- Routine authenticated profile/attempt reads and saves use a 240/minute per-user/path allowance; other study reads use 120/minute. Creation, editorial, authentication and anonymous requests keep the existing 30/minute bounds. This accommodates same-origin route prefetching without weakening creation/authentication limits.

## Library, account controls and operations decisions (specs 12–14)

- `/bookmarks` combines saved lessons/questions, private notes and permitted search. Search uses a topic filter, a plain keyword up to 120 characters and 20-row pages. Only current published lessons and the owner's committed practice/review items or finalized question reviews are searchable. Library/search/note access pauses during active diagnostics/strict mocks, preventing cross-note/snippet solution routes before matching or pagination. Lesson bookmarks/notes require published access; question tools require a permitted owner review. Notes are plain text, at most 10,000 characters, unique per owner/target and revision-checked across both library and player. Limits are 1,000 active notes and 1,000 bookmarks per learner; each collection/search kind uses 20-row pages. Deleted note text is cleared while a revision tombstone prevents stale-tab resurrection/ABA overwrites. Library reads hold a shared owner lock across authorization and snippets; assessment creation/deletion takes an exclusive owner lock.
- Explicit light/dark choices, reduced-motion override (system/reduce), and in-app reminder visibility are owner settings with checked revisions. Email/push opt-in is stored as a future preference, clearly unavailable for delivery. A device's accessibility request always wins over normal motion. Theme starts light on a fresh device, and an authenticated saved choice can synchronize after login.
- JSON account export streams an owner-authorized repeatable-read snapshot through a same-origin Hono POST, reading collections in bounded batches. It contains owned settings, notes, bookmarks, progress, review outcomes, plans and attempt/answer metadata, without authored prompts, choices, explanations, keys, credentials or tokens. Export is blocked during an active diagnostic/strict mock. There is no silent row truncation; failed/aborted streams cannot become successful downloads.
- Account deletion requires the current password plus an explicit DELETE confirmation. The operation serializes with role changes, protects the last administrator, removes all live personal learning records, sessions, credentials, reset tokens and invitations addressed to the email, and pseudonymizes the identity used by retained publication/provenance references. Published content/source attribution remains; personal study data does not. A receipt contains only opaque identifiers/date for deletion reconciliation after restoration. Backups expire after 30 days; a restored backup remains offline until deletion receipts newer than it are reapplied.
- Operational delivery includes HTTPS proxy configuration, encrypted daily PostgreSQL dumps with 30-day pruning, restore-to-new-database tooling/rehearsal, restart/health checks, a 20-learner realistic-payload API benchmark, and an explicit release evidence checklist. Real provider/hostname verification, actual reviewed launch inventory, assistive-technology/phone checks and the one-week personal pilot stay open until performed. Local TLS/Mailpit/synthetic benchmarks are labeled local evidence.

- Rate limiting and RPC context reuse one session lookup within the same HTTP request; there is no cross-request session cache. Full-mock DTO construction groups choices by version in one pass. The load benchmark measures the deployed API logic over HTTP and records its baseline and any unmet target instead of treating implementation as performance acceptance.

- `DB_POOL_MAX` bounds the API process connection pool (2–50, default 10). Tune it only against a recorded benchmark and the PostgreSQL connection budget across replicas; changing the pool does not change ownership, scoring or timing rules.

## Review concurrency hardening (13 November 2026)

- Manual review scheduling acquires a shared live-owner lock before reading history or waiting on the review advisory lock. Deletion takes the exclusive owner lock; a pending manual action must either finish before the purge or fail after it, never recreate records under the retained pseudonymous identity.
- Notebook feedback reads use one read-committed transaction, holding the shared owner lock across active-assessment filtering and payload construction. Assessment creation cannot commit between those steps.
- Assessment insertion increments an internal owner `assessment_revision` through a PostgreSQL trigger for diagnostic/strict modes. This changes the owner tuple even though creation otherwise only locks it. A repeatable-read export waiting on creation therefore gets a serialization conflict instead of authorizing against a pre-assessment snapshot. Export retries that conflict once, only before emitting bytes, then checks authorization against a fresh consistent snapshot. Successful exports retain one repeatable-read snapshot and one pooled connection. No export retry is allowed after streaming starts.
- Deterministic PostgreSQL regression tests exercise both ordering directions, deletion versus scheduling, strict/diagnostic startup versus feedback/export, snapshot consistency, and lock cleanup on failed/parallel exports. Release performance/content/provider/manual/pilot gates are unchanged.

The snapshot behavior follows [PostgreSQL 17 row-lock and isolation semantics](https://www.postgresql.org/docs/17/explicit-locking.html): locking alone does not invalidate an unchanged row in an older snapshot; changing the owner revision makes stale repeatable-read locking fail safely.

## User-authorized Coolify deployment (13 November 2026)

Deploy an isolated Git-based Docker Compose application in the existing Coolify server at `sibol.shintakino.qzz.io`, through a dedicated Cloudflare tunnel. Existing applications/networks/volumes are preserved. GitHub-hosted Actions run checks on pull requests and main pushes; only a passing main commit may update Coolify's pinned source SHA and queue production deployment. Coolify builds the Dockerfiles from that exact revision, avoiding shared registry credentials or an untrusted self-hosted runner. Manual deployment uses `pnpm run deploy` to dispatch the same workflow. The release script sets a dedicated runtime `SIBOL_RELEASE_SHA` before pinning source; it does not rely on Coolify's generated SOURCE_COMMIT defaults.

Production PostgreSQL uses a separate persistent volume/internal network with no host port. A one-shot encrypted backup precedes the one-shot migration service; API replicas never run migrations. A background backup service retains encrypted archives for 30 days. The tunnel exposes the web app and only the deployment API paths; the CI token is scoped to this application. Public readiness includes the deployed source revision so CI can check the running version. Domain requests redirect HTTP to HTTPS, and the app remains invitation-only/noindex. Secrets and backup identity stay outside Git/build context. Planning/test/CI/operator files are excluded from image contexts to preserve build caches across documentation-only changes.

The user explicitly chose internal mail capture for now; external SMTP delivery/recovery remains unavailable until configured. The first admin uses `admin@shintakino.qzz.io`, with credentials held in an operator-only local file. Deployment is a private pre-launch installation and does not satisfy the remaining reviewed-content, performance, manual accessibility or week-long pilot gates.

Internal mail capture was explicitly selected for this installation. Mailpit has no public port/hostname and uses a separate persistent volume, retaining at most 500 messages/seven days. Operators read it through SSH forwarding; real SMTP delivery remains deferred.

The live audit found Coolify's normal Compose parser attaches a default network to PostgreSQL and adds the full runtime env file to every service. Use raw Compose mode for this application, with explicit Coolify ownership labels, a fixed project name and the existing external volume names. This preserves the reviewed network/credential boundaries without changing other applications or moving/deleting stored data. CI must reject normal-parser mode; a read-only host audit verifies actual container networks, environment keys and preserved volume mounts after rollout.

Keep the deployment-control tunnel independent from the application stack. The live raw-mode startup failure demonstrated that an app-owned control endpoint becomes unreachable precisely when CI needs to observe or recover a failed rollout. A separate minimal Docker Compose gateway, with its own Cloudflare tunnel and no application/database network membership, serves only authenticated scoped Coolify API routes. Its private operator configuration lives under ~/.config/sibol-deploy, outside the checkout. Application releases must not restart or remove it.

## User-requested Professional starter content (13 November 2026)

The user requested setup and original question authoring for the Professional level. Offline AI-assisted editorial authoring is now in scope; no runtime AI service is added. Prepare a private 80-question starter pack (five questions across each of the 16 enabled Professional topics), validate it with the existing import contracts and import it as drafts. Existing publication review remains mandatory; no AI-authored draft is automatically promoted to a trusted answer key. Keep source questions/keys and human-review artifacts outside the public Git repository. The starter pack does not satisfy the 300-question/full-mock launch gate. Configure a source-verified Professional reference-format profile without assuming the learner's exam date or changing her private preferences.

The Professional starter pack was subsequently published after the user explicitly instructed “publish all” in response to the supplied review pack/publication request. The operator verified the exact pack hash and stored content, then used the existing audited review/publication services. All 80 questions are eligible; the five-per-topic starter and balanced 30-item diagnostic coverage pass read-only selection checks. No learner attempts or preferences were created or modified to validate publication. Full-mock and broader launch gates remain enforced.

## User-requested permitted external content import (13 November 2026)

The user confirms permission to copy/store Topnotcher content. Record this as user-attested permission, without inventing a provider-issued licence or unprovided terms. Use an operator-only, bounded collector across the 16 provider topics, with sequential requests, timeouts, conservative delays, duplicate detection, resumable private snapshots and an explicit incomplete-coverage report. The random quiz API has no enumerated-bank/export endpoint in its route index; sampling cannot prove that every question was retrieved. This is offline content preparation, not a runtime provider dependency or a new learner grading service.

Keep raw questions, keys, explanations, permission records and downloaded raster images under ignored `.cache/content-authoring/`, outside Git and Docker builds. Convert compatible text/choice questions into bounded native draft-import batches using the existing contracts and administrator workflow. Do not invent missing keys, explanations, topic mappings, image descriptions or editorial approval. Unmapped general-information questions, ordering questions, image choices and images without reviewed descriptions/deployed local paths remain staged with explicit reasons. Existing question media supports reviewed local PNG/JPEG/WebP with alt text; there is no remote hotlink, image upload provider or new media deployment/storage boundary in this slice. Publication remains a separate human review operation. Collection is not publication and does not satisfy launch inventory gates.

## Categorized study catalog and imported question formats (user request, 13 November 2026)

Implement the supplied `CSE-Question-Bank-Import-Guide.md` within the existing schema/services, without a second attempt or authentication system. Native study areas/topics remain the scoring taxonomy; retain the provider's five categories/sixteen subcategories as explicit provenance and optional study-focus filters. Scope catalogs to the learner's track and report published availability independently from administrator draft/held counts. Practice, short timed sets, review history and results expose the hierarchy; full mocks retain their fixed reviewed blueprint and cannot silently become filtered/shortened exams.

Question versions gain supported levels, preserving the legacy primary `level` field for compatibility. Shared provider questions use one stable identity/version eligible for both tracks. Existing level-specific provider drafts are retained as retired consolidation records, never silently deleted or republished. Original published versions/results remain immutable. New imported versions remain drafts until human review. Preserve provider `choice`, `error` and `order` formats, instruction/highlight/passage context and stable IDs. Ordering items have a pinned presentation order, revision-checked saved sequence and a server-only expected sequence. Error-recognition labels retain their original arrangement. One scoring helper handles response shape/correctness for commitments, finalization and review events.

Store the pilot's small private raster assets in bounded PostgreSQL `bytea` rows, addressed by SHA-256 and included in encrypted database backups. Hono serves same-origin `/api/content-media/` only to administrators or owners with a pinned attempt/review reference. Serve private/no-store responses with checked MIME/extensions; Next image rendering bypasses the optimizer for these authenticated URLs. Keep public `/media/` support for existing authored assets. Add zoom dialogs and image choices with keyboard-accessible controls. Unreviewed imported image descriptions are explicit draft metadata and block publication until corrected; archival GIFs are not silently enabled as animated learner media.

Persist provider snapshot records and per-topic collection reports for administrator reconciliation, including held records, source IDs, duplicates, rejected/missing assets and unknown expected totals. Sampling never becomes “complete bank verified”; only an authoritative export/feed manifest can establish that. The provider's General Information bucket contains out-of-scope/miscategorized items; item-specific classification must not force unrelated science/current-affairs content into the four native general topics. Keep source labels and classification reasons separately. Source keys/content and answer keys remain server-private; no licensed bank/images go into the public repository or Docker context.
