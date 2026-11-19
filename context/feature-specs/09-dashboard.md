# Daily dashboard

Status: implemented and locally verified on 12 November 2026. See [progress tracker](../progress-tracker.md) for evidence and remaining content/release gates.
Source: [Sibol CSE PRD](../../Sibol-CSE-PRD.md), FR-02.

## Scope and acceptance

Depends on plan, reviews, progress, and resumable attempts. Route: /dashboard. Show today's task, due count, weekly completion, optional countdown, recent practice accuracy, recommended next topic, active-attempt resume, and save status where relevant.

Acceptance:
- New/skipped-diagnostic accounts have a useful next action and explicit no-data labels.
- Observed weak topics and samples are distinguishable from recommendations made with sparse evidence.
- Personal target dates are clearly distinguished from verified announcements.
- Missed days lead to manageable adjustments, not guilt or lost-progress messages.
- Optional dedication is learner-configured.
- Resume uses acknowledged answers and the original strict deadline; dashboard cannot leak solutions or other learners' data.


## CMMS-style reviewer home (19 November 2026)

The user requested the adjacent CMMS reviewer interaction style. Home now prioritizes compact actual stats, direct Quick 10 / 20-question practice actions, timed exams, missed-question review, category shortcuts and active-set resume. Creation uses the existing server procedure and retry IDs; it never creates an attempt merely by loading the page. Planning, diagnostic choice and optional dedication remain accessible through secondary disclosure sections. Preserve no-data labels, assessment restrictions and original deadlines; do not add fabricated readiness/streak/certificate claims.
