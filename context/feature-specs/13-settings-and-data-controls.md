# Settings, export, and deletion

Status: specified; not implemented.
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
