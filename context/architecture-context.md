# Architecture Context

Source: [PRD sections 11–16](../Sibol-CSE-PRD.md). Status: planned architecture; no scaffold exists yet.

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

- The PRD stack replaces the unrelated template: relational learning history requires transactional consistency and versioned content.
- Server-owned timing/scoring and safe response DTOs preserve feedback boundaries and retry correctness.
- Selected-level launch with both-level architecture prevents content shortages being hidden by application readiness.
- On-demand work keeps the pilot small; add infrastructure only for demonstrated needs.

Operational requirements are in [14-operations-and-release.md](feature-specs/14-operations-and-release.md).
