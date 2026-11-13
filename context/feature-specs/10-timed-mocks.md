# Timed sets and full mock exams

Status: implemented and locally verified on 13 November 2026. See [progress tracker](../progress-tracker.md) for evidence and remaining content/release gates.
Source: [Sibol CSE PRD](../../Sibol-CSE-PRD.md), FR-08; PRD §§4, 8, 14–15.

## Scope and acceptance

Depends on shared attempt persistence, activated profile/blueprint versions, and validated inventory. Routes: /mock-exams, /attempts/[id]. Offer short timed sets and full level-specific mocks. Full mocks meet all versioned editorial quotas and test-proper counts: PRD baseline Professional 150/190 minutes, Subprofessional 145/160. EDQ is excluded. Active cycle metadata must be verified separately.

Prefer unseen items and disclose repeats when unavoidable. One item at a time, question navigation, answered/unanswered/flagged states, editable answers, submit confirmation with unanswered count. Strict mode has no pause, hints, calculator, explanations, or correct-answer payloads. Practice-timed/extended-time modes are separately labeled.

Acceptance:
- Server start/expiry timestamps survive refresh and device-clock changes.
- Reconnect restores acknowledged answers and original deadline; post-expiry arrivals are rejected.
- Expiry finalizes from answers accepted before the deadline.
- Submission/expiry races lock and produce one final result; terminal edits fail.
- Inventory shortage blocks creation without duplicates or shortened full mocks.
- Active strict items cannot reveal solutions via search, completed reviews, or other endpoints.
- Flagging or tab departure is not proof of cheating.
- Test reconnect, delayed saves, stale tabs, duplicate submits, deadline races, and pre-completion payloads.

## Assessment-start serialization

Strict-mock and diagnostic inserts advance an internal owner revision through a database trigger. Notebook/library feedback readers hold the owner's shared lock; creation takes the exclusive lock. An export whose repeatable-read snapshot predates a concurrently committed assessment must retry authorization before any private bytes are emitted. This preserves original timing/scoring while closing alternate-feedback races. Regressions cover strict/diagnostic startup against notebook reads and exports.
