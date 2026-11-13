# Weekly study planning

Status: implemented and locally verified on 12 November 2026. See [progress tracker](../progress-tracker.md) for evidence and remaining content/release gates.
Source: [Sibol CSE PRD](../../Sibol-CSE-PRD.md), FR-07.

## Scope and acceptance

Depends on preferences, content coverage, diagnostic evidence, and review state. Route: /plan. Generate on demand using days, daily minutes, level, evidence, optional date, and available inventory.

Default configurable allocation: roughly 20% due reviews, 60% priority topics, 20% mixed retrieval. Prioritize low first-exposure accuracy, due burden, and coverage gaps; sparse evidence favors broad coverage. Explain recommendations.

Acceptance:
- Scheduled work fits the learner's time budget; carry excess forward with a documented cap.
- Rebuilds preserve completed tasks; missed tasks do not multiply without bound.
- Do not promise complete coverage when time/content is insufficient.
- Never schedule beyond the chosen target date without confirmation.
- Level/availability changes rebuild appropriately without altering old attempts.
- Tests cover sparse evidence, zero availability, missed work, date boundaries, and rebuild retries.
- Choose and document the exact carryover cap before implementation; the PRD does not specify it.

## Implemented defaults

Carryover moves at most two five-minute tasks within 20% of remaining weekly minutes, rounded down to five minutes. Uncarried missed tasks are archived; work older than 14 days is not carried. Completed tasks remain across rebuilds/preferences and reduce the remaining daily budget. Allocation percentages persist across availability changes. Task completion is self-reported and separate from proficiency.
