# Sibol CSE
## Product Requirements Document

**Tagline:** Your Civil Service Review Companion  
**Version:** 1.0 · 22 October 2026  
**Project slug:** `sibol-cse`  
**Primary market:** Philippine Career Service Examination reviewers  
**Initial audience:** One invited learner, with an administrator managing review content

## 1. Product vision

Build a calm, mobile-friendly review companion that helps a learner understand concepts, remember lessons, improve weak areas, and practice under time pressure. The first release is a personal review tool for the developer’s girlfriend, but its data model supports additional learners without redesign.

The app should answer three questions every day: What should I study? Why did I get this wrong? Am I improving on unfamiliar questions?

Sibol is a proposed brand; domain and trademark availability have not been checked. The app is an independent study aid and must not imply CSC endorsement or guarantee exam success.

## 2. Goals and success measures

| Goal | Measure | Initial product target |
|---|---|---|
| Establish a sustainable habit | Completed planned sessions per week | At least 4 for an active learner |
| Improve understanding | Accuracy on previously unseen questions in weak topics | Upward trend over 4 weeks; report sample size |
| Improve pacing | Time per answered item and unfinished mock items | Trend improves without sacrificing accuracy |
| Reduce repeated mistakes | Incorrect items answered correctly on delayed review | Track at 7 and 21 days |
| Make progress understandable | Learner can identify next task and weakest topic | Both available from dashboard |
| Preserve trust | Published questions with reviewed answers and explanations | 100% |

Targets are product hypotheses, not promises. Do not turn app accuracy into an estimated CSC rating or probability of passing.

## 3. Assumptions and boundaries

- Philippine CSE-PPT is the initial target. Ask for Professional or Subprofessional level during onboarding; do not assume her level.
- Exam date is optional and entered by the learner. An entered date is a personal target unless linked to a verified official announcement.
- English interface initially, with English and Filipino review content where appropriate.
- Invitation-only registration initially; no payments, subscriptions, advertisements, or public leaderboard.
- Content quality matters more than AI features. Core study workflows work without an external AI provider.
- Online-first MVP. Temporary connection recovery is supported; full offline study is deferred.
- Asia/Manila is the default study-calendar timezone. Store timestamps in UTC.

## 4. Exam alignment and content taxonomy

Use versioned exam profiles so future announcements can change coverage and timing without rewriting application code. Based on CSC’s 2026 advisory, both levels cover verbal, numerical, and general-information topics. Professional adds analytical ability; Subprofessional adds clerical ability.

| Area | Internal lesson topics | Level |
|---|---|---|
| Verbal | Vocabulary, grammar, sentence construction, paragraph ordering, comprehension | Both |
| Numerical | Arithmetic, sequences, applied word problems | Both |
| General information | Constitution, public-service ethics, peace and human rights, environmental protection | Both |
| Analytical | Analogies, abstract logic, assumptions and conclusions, interpreting data | Professional |
| Clerical | Filing and spelling | Subprofessional |

The same advisory distinguishes test-proper questions from the personal-data EDQ:

| Profile | Scored practice items | EDQ items excluded from app scoring | Time limit |
|---|---:|---:|---|
| Professional | 150 | 20 | 190 minutes |
| Subprofessional | 145 | 20 | 160 minutes |

Do not create 170 or 165 scored questions by treating EDQ as exam content. Full mocks contain test-proper practice items only. Exact topic weights are editorial settings, not official CSC distributions. Calculator is unavailable in strict mocks.

An administrator must recheck the applicable CSC announcement before activating a profile for a new exam cycle. Store source URL, source title, publication date when known, verification date, and reviewer. Never auto-publish scraped exam rules.

## 5. Roles and permissions

| Capability | Learner | Administrator |
|---|---|---|
| Manage own profile, schedule, and goals | Yes | Own account |
| Take lessons, drills, and mocks | Yes | Preview or own attempts |
| View personal answers and notes | Own only | No routine access |
| Export or delete learning data | Own only | Process authorized requests |
| Create, review, publish, and retire content | No | Yes |
| Configure profiles and mock blueprints | No | Yes |
| Review question issue reports | Own reports | Yes |
| Invite users and change roles | No | Yes, audited |

Being the developer or her partner does not grant automatic access to her results. Any later coach-sharing feature requires an explicit, revocable learner opt-in.

## 6. Core learner journey

1. Accept invitation and sign in.
2. Choose level, preferred study days, daily minutes, optional exam date, and explanation-language preference.
3. Complete or skip a short diagnostic.
4. Receive a weekly plan with today’s lesson, practice set, and due review.
5. Answer questions, read explanations, and record difficult concepts.
6. Revisit mistakes after a delay.
7. Take a timed mock when enough suitable content exists.
8. Review topic accuracy, pacing, unanswered items, and suggested next actions.

Skipping the diagnostic creates a balanced starter plan with an “insufficient evidence” message instead of invented proficiency scores.

## 7. Functional requirements

### FR-01 · Accounts and onboarding — MVP

Use Better Auth for email/password sessions. Support sign-in, sign-out, recovery through a configured transactional-email provider, and invitation acceptance. No public signup initially. Developer bootstrap creates the first administrator securely; registration never accepts a client-supplied admin role.

Acceptance: invitations expire and are single-use; protected routes reject unauthenticated requests; a learner cannot change another learner’s profile or elevate roles. Changing exam level creates a new plan while preserving old attempts under their original profile.

### FR-02 · Dashboard — MVP

Show today’s task, due-review count, weekly completion, optional countdown, recent practice accuracy, and the next recommended topic. Display a resume button for an active attempt and a clear save-status indicator.

Use supportive language. Missed days should trigger a manageable plan adjustment, not lost progress or guilt messages. An optional personal dedication can be configured by the learner.

Acceptance: a new account has a useful empty state; unavailable metrics show no-data labels; personal target dates are clearly distinguished from verified announcements.

### FR-03 · Diagnostic — MVP

Default to a configurable 30-question balanced diagnostic, with level-specific categories and no repeated question within the attempt. Show explanations after completion. Keep topic results provisional when fewer than 10 first-exposure answers exist for that topic.

Acceptance: selection fails clearly if the reviewed bank lacks coverage; diagnostic results identify observed strengths and gaps without claiming official equivalence.

### FR-04 · Lessons — MVP

Provide short structured lessons containing a concept, worked example, common mistake, technique, and linked practice. Support readable math, tables, passages, and accessible diagrams. Lesson completion and assessed proficiency are separate records.

Acceptance: every lesson has topic tags and a publication version; a learner can resume a lesson; changing a published lesson preserves its earlier version.

### FR-05 · Practice engine — MVP

Allow topic, difficulty, length of 5/10/20 questions, and unseen-first selection. Practice mode gives feedback after committing an answer. Include bookmarks, personal notes, optional confidence labels, and “report an issue.” Explanations cover the correct reasoning and why distractors fail when useful.

Acceptance: committing an answer is idempotent and cannot award credit twice; stable choice IDs survive shuffled display order; solution content is withheld until the permitted feedback point; insufficient inventory never causes silent duplicates.

### FR-06 · Mistake notebook and spaced review — MVP

Automatically queue incorrect and skipped practice items. Optionally include correct answers marked “guessed.” Group by concept and show the last mistake plus explanation.

Use a simple deterministic initial schedule: incorrect → next day and interval reset; correct on scheduled review → 3, 7, 14, then 30 days. Allow manual “review again tomorrow.” These are product defaults, not a claim of an optimal learning algorithm. Repeated same-day answers do not advance multiple intervals.

Acceptance: review state is unique per learner/question; historical mistakes remain visible after later success; a retired or disputed item is removed from future queues.

### FR-07 · Study planner — MVP

Generate a weekly plan from available days, minutes, level, diagnostic evidence, and optional target date. Reserve roughly 20% of planned time for due reviews, 60% for priority topics, and 20% for mixed retrieval; these ratios are configurable.

Rank priority topics using low first-exposure accuracy, due-review burden, and coverage gaps. If evidence is sparse, prefer broad coverage. Allocate within the learner’s daily budget and carry remaining work forward. Never promise complete coverage when time or content is insufficient.

Acceptance: rebuilding a plan preserves completed tasks; missed tasks do not multiply without a cap; changes show the reason for the recommendation; plans never schedule past the chosen target date without confirmation.

### FR-08 · Timed mock exams — MVP release gate

Support short timed sets and full level-specific mocks. Use versioned blueprints with internal topic quotas. Full mocks require sufficient published inventory. Prefer questions not previously seen by that learner; label repeat exposure when unavoidable.

Show one item at a time, question navigation, answered/unanswered/flagged states, and a submit confirmation with unanswered count. Allow answer changes before submission. Strict mode has no pause, hints, calculator, explanations, or correct-answer payloads before completion. A practice-timed mode may allow pausing but is labeled separately.

Acceptance: the server stores start and expiry timestamps; refresh or changing device time cannot reset the timer; reconnect restores saved answers and the original deadline; after expiry, the server finalizes from answers accepted before expiry. Lost connectivity is not represented as saved work. Submission and expiry races produce one final result. Flagging or leaving the tab is not treated as proof of cheating.

### FR-09 · Results and analytics — MVP

Calculate practice accuracy as correct / total presented, with blanks counted incorrect. Also show attempted accuracy separately when useful. Report correct, incorrect, unanswered, time used, per-topic sample size, and first-exposure versus repeated-question performance.

Use descriptive indicators such as “needs more evidence,” “developing,” and “consistent practice performance.” Initially define consistency as at least 85% across the last three timed sets, at least 30 distinct items in total, and no major uncovered topic. This is an internal study goal only. Full mocks retain their own separate trend.

Acceptance: percentages reconcile to item-level results; deleting an attempt recalculates derived metrics; repeated questions do not inflate unique coverage; no “guaranteed pass” or fabricated pass probability appears.

### FR-10 · Bookmarks, search, and notes — MVP

Search published lessons and permitted completed-question reviews by topic and keyword. Learners can bookmark lessons/questions and write private notes. An active strict mock cannot use app search to retrieve its solutions.

### FR-11 · Content administration — MVP

Provide draft → reviewed → published → retired workflow for lessons and questions. Initial single-administrator operation allows self-review with an explicit checklist and audit record; a second reviewer can be required later.

Each question needs a stable ID, version, level, topic, language, difficulty, prompt, choices with stable IDs, one answer key, explanation, optional passage/media, authorship/usage rights, references where relevant, reviewer, and review date.

Provide CSV/JSON import with preview, row-level validation, and an explicit publish step. Reject duplicate external IDs, invalid answer keys, empty explanations, and unsupported topic assignments. Sanitize rich text and media references.

Reported wrong answers can be quarantined. Corrections create a new version; historical results retain the original scoring and show an erratum. Any optional rescore must be explicit, audited, and distinguish original from revised results.

### FR-12 · Settings and data controls — MVP

Support study preferences, dark mode, reduced motion, reminder opt-in settings, machine-readable data export, and account deletion with confirmation. In-app due tasks are MVP; scheduled email or push reminders are a later phase requiring provider configuration and unsubscribe controls.

## 8. Content strategy and launch inventory

All questions must be original, licensed, or used with permission. No leaked or reconstructed confidential exam items. Offline AI-assisted original drafting is authorized for the Professional starter content. AI-generated drafts must be reviewed by a human administrator before publication and cannot become trusted answer keys automatically. No runtime AI dependency is required.

Initial content delivery is part of the project, not an assumed external resource:

- At least one concise lesson and worked example for each enabled topic.
- A pilot bank of at least 300 reviewed unique questions for the first selected level, including at least 30 per major area and enough inventory to satisfy all enabled blueprint quotas.
- At least two complete mock forms for that level with no overlap between their forms; questions may also appear in practice, and exposure is disclosed.
- Enable the other level only after its own content coverage and mock inventory pass the same checks.
- Expand toward 600–1,000 reviewed questions after the pilot; this is a backlog target rather than an MVP dependency.

The 300-item threshold is a minimum and does not override blueprint shortages or produce unlimited unseen mocks. If her level is known during implementation, ship that level first while retaining both-level architecture.

## 9. Pages and navigation

| Route | Purpose |
|---|---|
| `/` | Product introduction and sign-in |
| `/sign-in`, `/forgot-password`, `/reset-password` | Authentication |
| `/onboarding` | Level and study preferences |
| `/dashboard` | Today’s plan and progress |
| `/plan` | Weekly study schedule |
| `/learn`, `/learn/[slug]` | Lesson library and lesson |
| `/practice` | Configure a practice set |
| `/attempts/[id]` | Practice or mock player |
| `/attempts/[id]/results` | Completed review |
| `/review` | Due items and mistake notebook |
| `/mock-exams` | Available blueprints and history |
| `/progress` | Topic and pacing trends |
| `/bookmarks`, `/settings` | Saved resources and preferences |
| `/admin/content`, `/admin/imports` | Editorial management |
| `/admin/profiles`, `/admin/reports`, `/admin/users` | Exam profiles, issues, invitations |

## 10. User experience requirements

Use a warm cream background with green accents, clear typography, and restrained celebration. Prefer bottom navigation on mobile and a sidebar on desktop. The question player prioritizes the prompt, choices, timer, and next action over decorative elements.

Design refinement (11 November 2026): use shadcn/ui as the required component foundation and Lucide React for icons. The primary experience is a refined light theme with warm ivory backgrounds, white surfaces, deep forest-green actions, quiet sage highlights, generous spacing, and subtle elevation. Light mode is the initial default regardless of device preference; FR-12 retains optional dark mode. Concrete palette, typography, and component conventions are maintained in [context/ui-context.md](context/ui-context.md).

Meet WCAG 2.2 AA as the implementation target: keyboard operation, visible focus, sufficient contrast, labeled controls, non-color status indicators, and screen-reader announcements. Announce timer milestones instead of every second. Provide non-strict extended-time practice. Respect reduced motion and avoid autoplay sound.

Support 360px-wide phones, desktop keyboards, readable Filipino text, large touch targets, and stacked layouts without horizontal scrolling. Explanations should teach the shortest reliable method without hiding necessary steps.

## 11. Technical stack and bootstrap

Use the requested Better T Stack configuration with the selected project name:

```bash
pnpm create better-t-stack@latest sibol-cse \
  --frontend next \
  --backend hono \
  --runtime bun \
  --api orpc \
  --auth better-auth \
  --payments none \
  --database postgres \
  --orm drizzle \
  --db-setup docker \
  --package-manager pnpm \
  --git \
  --web-deploy docker \
  --server-deploy docker \
  --install \
  --addons turborepo \
  --examples none
```

This is the requested bootstrap command, not a command executed as part of this PRD. Because `@latest` changes, confirm supported flags when scaffolding, then commit the generated lockfile and record resolved versions.

| Layer | Choice | Responsibility |
|---|---|---|
| Frontend | Next.js, TypeScript | App pages, accessible study player |
| API | Hono + oRPC | Validation, authorization, scoring, plans |
| Runtime | Bun | Backend execution; validate generated Next runtime separately |
| Authentication | Better Auth | Sessions and identity |
| Database | PostgreSQL | Content, attempts, review state |
| ORM | Drizzle | Typed queries and migrations |
| Workspace | pnpm + Turborepo | Packages, dependency lock, tasks |
| Deployment | Docker | Reproducible application services |

Suggested workspace boundaries, adapted to the actual generated scaffold: `apps/web`, `apps/server`, and shared packages for API contracts, auth, database, validation/configuration, and UI where needed. Avoid a second competing schema or auth system.

## 12. Architecture and trust boundaries

Browser → HTTPS reverse proxy → Next frontend and Hono API → PostgreSQL. Prefer routing `/api` to Hono under one public origin to simplify cookies and CORS. Define Better Auth trusted origins, secure HttpOnly cookies, and CSRF protections appropriate to the generated integration.

oRPC middleware resolves the authenticated user and role for every protected procedure. Learner IDs come from the session, never from a trusted request body. Scoring, item selection, and eligibility for feedback run server-side. The frontend must not bundle answer keys.

MVP needs no Redis, external vector database, AI API, or dedicated job queue. Calculate plans and due reviews on demand. Expired attempts are finalized on access; add a lightweight scheduled sweep if timely background finalization becomes necessary.

## 13. Conceptual data model

| Entity | Important fields / constraints |
|---|---|
| Better Auth tables | Generated user, session, account, verification schema |
| UserProfile | userId unique, role, timezone, language, onboarding status |
| StudyPreferences | userId unique, level, optional date, days, minutes |
| Invitation | email, hashed token, expiresAt, acceptedAt |
| ExamProfileVersion | level, item count, duration, source metadata, active status |
| Topic | stable slug, parent topic, supported levels |
| Lesson / LessonVersion | stable identity, immutable published body and metadata |
| Question / QuestionVersion | identity, immutable content, answer key, explanation, status |
| Choice | questionVersionId, stable choice ID, text |
| QuestionTopic | question/topic association; one primary scoring topic |
| MockBlueprintVersion | profile version, editorial quotas, duration, version |
| Attempt | userId, mode, profile/blueprint versions, status, startedAt, expiresAt, submittedAt |
| AttemptItem | unique attemptId + position, questionVersionId, frozen display order |
| AttemptAnswer | unique attemptItemId, selectedChoiceId nullable, revision, savedAt |
| AttemptResult | attemptId unique, counts, elapsed time, scoring version |
| ReviewState | unique userId + questionId, dueAt, interval step, last reviewed version |
| ReviewEvent | answer outcome and schedule transition; unique event key |
| StudyPlan / StudyTask | userId, period, topic, estimated minutes, completion status |
| LessonProgress | unique userId + lessonId, completion, last location |
| Bookmark / PrivateNote | ownerId and target; private notes owner-scoped |
| QuestionIssue | reporterId, questionVersionId, category, status, resolution |
| ContentSource | URL, rights, verification and attribution metadata |
| ImportBatch | file hash, validation summary, operator, status |
| AuditEvent | actorId, action, target, timestamp; no passwords/tokens |

Use foreign keys, unique constraints, transactions, and indexes on attempt ownership/status, due review dates, question publication/level/topic, and task dates. Keep published question versions immutable so edits do not change historical attempts.

## 14. oRPC procedure groups

- `profile.get/update`, `onboarding.complete`.
- `dashboard.get`, `plan.get/generate/updateAvailability`.
- `lessons.list/get/complete`.
- `practice.create`, `mocks.list/start`.
- `attempts.get/saveAnswer/setFlag/submit/results`.
- `review.listDue/start`, `progress.summary/topics/history`.
- `bookmarks.toggle/list`, `notes.create/update/delete`.
- `issues.create/listMine`, `account.export/requestDeletion`.
- Admin-only `content.*`, `imports.validate/commit`, `profiles.*`, `blueprints.*`, `issues.resolve`, `users.invite/setRole`.

Validate all inputs at runtime. Enforce bounds on set lengths, pagination, import size, and note length. Mutating procedures use idempotency keys or unique constraints as appropriate. Answer saves use a server-checked revision to prevent stale tabs overwriting newer answers.

Attempt state transitions: `in_progress` → `submitted`, `expired`, or `abandoned`. Terminal attempts cannot accept answer changes. Finalization locks the attempt row and stores scoring once. Client retries return the existing final result.

## 15. Reliability, security, and operations

- Every answer selection triggers an acknowledged save; show saving, saved, or failed. Retry transient failures with backoff, without claiming unsent answers were persisted.
- Refresh restores acknowledged state. Strict exam offline answers arriving after expiry are rejected, with a clear explanation.
- Rate-limit authentication, invitations, imports, and expensive creation procedures. Use a shared proxy/database-backed limiter if scaling beyond one API instance.
- Sanitize authored HTML/Markdown; enforce upload type/size rules when media uploads are introduced. Do not execute imported content.
- Limit administrator access; audit publication, role changes, and scoring corrections. Logs exclude notes, session tokens, passwords, and answer content by default.
- Keep database and app secrets outside source control. Expose PostgreSQL only to internal services in production.
- Provide health/readiness endpoints and error reporting with request IDs.
- Target API p95 under 500ms for routine reads/saves at 20 concurrent learners on a documented baseline environment; evaluate with realistic mock payloads.
- Back up daily with 30-day retention; initial recovery targets: up to 24 hours data loss and restoration within 4 hours. Perform a restore rehearsal before launch.
- Export contains learner-owned progress, notes, and preferences, without wholesale copyrighted question-bank export. Deletion removes live personal learning data; expired backup retention is disclosed.

## 16. Docker deployment requirements

Provide multi-stage production images for web and server, an internal PostgreSQL service/connection, persistent database storage, health checks, and restart policies. Put HTTPS termination at the reverse proxy. Use non-root application containers where practical.

Run Drizzle migrations as a controlled release step before app rollout, not from every replica at startup. Back up before destructive migrations. Document rollback limits when schemas are not backward compatible. Keep development seeds out of production.

Provide `.env.example` with placeholder values for database connection, auth secret/base URL, trusted frontend origin, frontend API origin as needed, and email provider configuration. Never include real credentials.

## 17. Verification and release acceptance

Critical automated coverage:

1. Cross-user reads/writes and role escalation are rejected.
2. Strict-mock payloads exclude answers and explanations until completion.
3. Refresh, client-clock changes, expiry, reconnect, and duplicate submit preserve one deadline/result.
4. Scoring handles blanks, shuffled choices, mixed topics, and versioned keys correctly.
5. Stale answer revisions cannot overwrite newer saves.
6. Review intervals advance once per eligible review event and reset after mistakes.
7. Quota shortages fail without silent duplicate questions or shortened full mocks.
8. Content corrections preserve historical results and surface errata.
9. Planner rebuilds preserve completion and respect available time.

Manual release checks: mobile and keyboard study flow; Filipino content display; screen-reader question navigation; import errors; email recovery; export/deletion; container restart and backup restore. Use end-to-end tests for onboarding → practice → review and strict mock → expiry → results.

Release only when the selected level’s content gate passes, all published content is reviewed, core access/scoring/timing tests pass, and the learner can complete her full study flow on a phone.

## 18. Delivery plan

| Phase | Deliverables | Exit gate |
|---|---|---|
| 1. Foundation | Scaffold, containers, auth, schema, invitations, onboarding | Learner and admin permissions verified |
| 2. Content and practice | Editorial tools, import, lessons, practice, explanations | Reviewed pilot content usable end to end |
| 3. Learning loop | Mistake notebook, due reviews, planner, dashboard | Daily study loop survives refresh and retries |
| 4. Simulation | Blueprints, strict timers, scoring, analytics | Mock inventory and timing tests pass |
| 5. Personal pilot | Mobile polish, recovery, backups, learner feedback | One full week of usable study sessions |

Content writing and review run alongside implementation and may be the longest dependency. Do not set a fixed delivery date until the bank’s source and reviewer availability are known.

## 19. Deferred enhancements

Optional AI explanations grounded only in approved lessons; AI practice-item drafting with editorial approval; consent-based study-buddy sharing; opt-in scheduled reminders; offline practice packs; printable worksheets; richer abstract-reasoning diagrams; multiple reviewers; and expanded content analytics.

AI must not grade the objective answer key, publish unreviewed facts, browse arbitrary sources during a strict mock, or access another learner’s notes. Keep all MVP functionality usable when AI is unavailable.

## 20. Main risks and decisions

| Risk | Response |
|---|---|
| Wrong explanations teach misconceptions | Reviewed publication workflow, issue reporting, quarantine and errata |
| Memorization looks like improvement | First-exposure metrics and explicit repeat labels |
| Too few reviewed items for mocks | Inventory validation and staged level launch |
| Overwhelming daily plan | Adjustable minutes, capped carryover, short sessions |
| Unstable network loses confidence | Acknowledged saves and clear recovery rules |
| Future exam changes invalidate settings | Versioned profiles and manual source verification |
| Personal relationship creates unwanted monitoring | Owner-private results and opt-in sharing only |

Implementation defaults are settled by this PRD: private initial access, no payment system, no required AI, online-first operation, both-level architecture, and selected-level content launch. Her exam level, target date, and daily study budget are collected through onboarding.

## 21. Official reference register

Checked on 22 October 2026. These references establish exam context; product algorithms, topic quotas, question counts for the content bank, and internal study targets are editorial decisions.

1. CSC Examination Advisory No. 02, s. 2026 — coverage, test-proper/EDQ distinction, duration and examination reminders: https://csc.gov.ph/phocadownload/userupload/erpo/advisories/2026/ExamAdvisory_2026_02_School%20Assignment%20Impt%20Reminders%20for%2008%20March%202026%20CSE-PPT%20Sgd.pdf
2. CSC Examination Announcement No. 03, s. 2026 — example of a cycle-specific official announcement to verify before publishing future profiles: https://csc.gov.ph/phocadownload/userupload/erpo/announcements/2026/ExamAnn_2026_03_Conduct%20of%2009%20Aug%202026%20CSE-PPT_orig%20signed.pdf
3. Official CSC website for applicable announcements: https://www.csc.gov.ph/

Do not use a past 2026 exam date as her upcoming target. Consult the applicable future announcement when her intended examination cycle is known.
