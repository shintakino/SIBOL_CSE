# Mistake notebook and spaced review

Status: specified; not implemented.
Source: [Sibol CSE PRD](../../Sibol-CSE-PRD.md), FR-06.

## Scope and acceptance

Depends on practice and published-content availability. Route: /review. Queue incorrect and skipped practice items; optionally include correct answers marked guessed. Group by concept and retain the last mistake/explanation and historical mistakes.

Schedule: incorrect → next day with interval reset; correct on scheduled review → 3, 7, 14, then 30 days. Allow manual “review again tomorrow.” These are deterministic product defaults, not an optimal-learning claim. Define calendar dates using learner timezone.

Acceptance:
- One ReviewState per learner/question; unique ReviewEvent keys make retries safe.
- Repeated same-day answers do not advance several intervals.
- Mistakes reset the schedule; manual tomorrow action is respected.
- Later success does not erase historical mistakes.
- Retired/disputed questions leave future queues.
- Review is owner-scoped, refresh-safe, and tested across calendar-day boundaries.
