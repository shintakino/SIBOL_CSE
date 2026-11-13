# Practice engine and shared attempt persistence

Status: implemented and locally verified on 12 November 2026. See [progress tracker](../progress-tracker.md) for evidence and remaining content/release gates.
Source: [Sibol CSE PRD](../../Sibol-CSE-PRD.md), FR-05; PRD §§13–15.

## Scope and acceptance

Depends on auth, reviewed inventory, and player primitives. Routes: /practice and /attempts/[id]. Select topic, difficulty, 5/10/20 items, and unseen-first preference. Selection runs server-side, excludes unavailable content, and never repeats an item within an attempt.

Persist immutable question versions and shuffled choice order using stable choice IDs. Every choice triggers an acknowledged save; saving is separate from committing an answer for feedback. Practice commitment is idempotent and cannot award credit twice. Reveal reasoning only at the permitted feedback point, including distractor explanations where useful.

Support bookmarks, private notes, optional confidence labels, issue reports, and resume. Show saving/saved/failed; retry transient errors with backoff without falsely claiming persistence.

Acceptance:
- Insufficient inventory fails clearly without duplicates.
- Shuffled display does not change grading; choices must belong to the pinned version.
- Cross-user attempt access fails and pre-feedback DTOs exclude keys/explanations.
- Stale revisions cannot overwrite newer answers; duplicate commits have one effect.
- Refresh restores acknowledged state; failed saves are visibly recoverable.
- Terminal attempts reject edits; shared finalization produces a single result.
- Tests cover blanks, invalid choices, retry/race behavior, and versioned keys.
