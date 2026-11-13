# Settings, export, and deletion

Status: implemented; backend and mobile Chromium verification passed.
Source: [Sibol CSE PRD](../../Sibol-CSE-PRD.md), FR-12; PRD §15.

## Scope and acceptance

Depends on accounts and learning data. Route: /settings. Support study preferences, an optional dark-mode preference alongside the default light theme, reduced motion, and reminder opt-in preferences. Persist explicit theme choices; first visit uses light mode regardless of device preference. Use shadcn/ui form and confirmation components. In-app due tasks are MVP; scheduled email/push delivery is deferred and must not be implied active.

Provide machine-readable export of learner-owned progress, notes, and preferences without wholesale copyrighted question-bank export. Account deletion requires confirmation, removes live personal learning data, and discloses backup expiry/retention. Admin processing of requests must be authorized.

Acceptance:
- Preferences persist and affect applicable UI/planning without altering historical attempts.
- Export/deletion are owner-authorized and cannot reveal another learner's data or active solutions.
- Verify deletion across relational learning records and derived metrics; explain retained backups.
- Reminder controls accurately describe available behavior.
- Recovery and data-control flows work on mobile with accessible confirmation/error states.

## Implemented decisions

Account-persisted theme, motion and reminder controls use checked revisions. Device reduced motion always wins. Email interest is explicitly future-only. JSON export streams a consistent snapshot in 500-row batches without silent truncation; it includes owner learning/settings records and excludes authored bank text/keys, credentials and tokens. Both export entry points block active strict/diagnostic assessments.

Self-deletion requires the current password plus DELETE. It serializes with role changes/finalization, protects the last administrator, clears live learning/auth records and pseudonymizes identity references required by immutable publication metadata. Published source/rights attribution remains. An opaque receipt supports offline restore reconciliation; the UI discloses 30-day backup expiry. Database guards prevent deleted sessions or credentials from being recreated. Administrative deletion of other learners is not exposed.

Verification covers safe multi-page export, cross-owner/admin isolation, settings conflicts/history preservation, wrong password/confirmation, last-admin protection, relational cleanup, deletion/finalization races, credential resurrection, retained publication immutability, and mobile accessible confirmation/download/sign-out. See the [operations runbook](../../ops/README.md) for backup/reconciliation limits and the [tracker](../progress-tracker.md) for final release gates.

## Concurrency hardening

Deletion now serializes with manual review scheduling as well as finalization. Both operation orders are tested and leave zero review rows after deletion. Assessment creation updates an internal owner revision, invalidating a repeatable-read export that began waiting before creation committed. Export retries that serialization conflict once, only before streaming starts, and rechecks authorization using a fresh snapshot. Successful exports retain one consistent snapshot and one connection each; tests verify parallel operation with a two-connection pool and lock release after failed streaming.
