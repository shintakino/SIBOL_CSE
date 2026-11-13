# Results and learning analytics

Status: implemented and locally verified on 12 November 2026. See [progress tracker](../progress-tracker.md) for evidence and remaining content/release gates.
Source: [Sibol CSE PRD](../../Sibol-CSE-PRD.md), FR-09.

## Scope and acceptance

Depends on finalized attempts and pinned content versions. Routes: /attempts/[id]/results and /progress. Practice accuracy = correct / total presented; blanks count incorrect. Attempted accuracy may be shown separately with its own denominator.

Show correct, incorrect, unanswered, elapsed time, topic sample sizes, unique coverage, first-exposure versus repeated performance, pacing, and next actions. Keep full-mock trends separate.

Internal consistency indicator: at least 85% across the last three timed sets, at least 30 distinct items total, and no major uncovered topic. Define the uncovered-topic threshold before implementation. Use “needs more evidence,” “developing,” and “consistent practice performance”; never convert these into CSC ratings or pass probabilities.

Acceptance:
- Percentages reconcile to item-level results, including blanks, mixed topics, shuffled choices, and versioned keys.
- Repeats do not inflate unique coverage or first-exposure performance.
- Fewer than 10 first-exposure diagnostic answers per topic remains provisional.
- Deleting an attempt recalculates derived metrics.
- Content corrections retain original scores and show errata; optional rescore is explicit/audited.
- Results and trends are owner-private, including against routine admin browsing.

## Implemented evidence threshold

An enabled topic is uncovered until it has five distinct answered questions in finalized work outside reviews/full mocks. Consistency requires 85% in each of the last three strict short timed sets, 30 distinct questions across those sets and no uncovered enabled topic. Extended-time practice and full mocks keep separate trends. Terminal-attempt deletion removes its answers/result and recalculates metrics; notebook snapshots retain historical outcomes.
