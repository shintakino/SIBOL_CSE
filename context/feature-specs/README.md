# Feature specifications

Source of truth: [Sibol-CSE-PRD.md](../../Sibol-CSE-PRD.md). All specs are planned, not implemented. Read the six context files in AGENTS.md order first. Numeric filenames organize the documents; dependencies and [delivery phases](../ai-workflow-rules.md) determine implementation order.

| Spec | PRD coverage |
|---|---|
| [Foundation and workspace](00-foundation.md) | PRD §§11–16; phase 1 |
| [Design system and accessible shell](01-design-system.md) | PRD §10; FR-02, FR-12 |
| [Accounts and onboarding](02-accounts-and-onboarding.md) | FR-01; PRD §§3, 5, 12 |
| [Content, profiles, imports, and review](03-content-administration.md) | FR-11; PRD §§4, 8, 13 |
| [Lesson library and learning progress](04-lessons.md) | FR-04 |
| [Practice engine and shared attempt persistence](05-practice-and-attempts.md) | FR-05; PRD §§13–15 |
| [Balanced diagnostic](06-diagnostic.md) | FR-03 |
| [Mistake notebook and spaced review](07-review-and-mistakes.md) | FR-06 |
| [Weekly study planning](08-study-planner.md) | FR-07 |
| [Daily dashboard](09-dashboard.md) | FR-02 |
| [Timed sets and full mock exams](10-timed-mocks.md) | FR-08; PRD §§4, 8, 14–15 |
| [Results and learning analytics](11-results-and-analytics.md) | FR-09 |
| [Bookmarks, notes, and search](12-bookmarks-notes-and-search.md) | FR-10 |
| [Settings, export, and deletion](13-settings-and-data-controls.md) | FR-12; PRD §15 |
| [Operations and release acceptance](14-operations-and-release.md) | PRD §§8, 15–18 |

FR-01 through FR-12 are all covered. Shared attempt persistence in spec 05 underpins diagnostics, reviews, and mocks; operations and content inventory are release requirements, not optional follow-ups.

Load the task-relevant skills listed in [AGENTS.md](../../AGENTS.md). Resolve unspecified thresholds/configuration in [progress-tracker.md](../progress-tracker.md) before their dependent implementation. Preserve PRD source dates as inherited metadata; activating an exam profile requires fresh official-source verification.
