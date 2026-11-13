# Mistake notebook and spaced review

Status: implemented and locally verified on 13 November 2026. See [progress tracker](../progress-tracker.md) for evidence and remaining content/release gates.
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

## Concurrency hardening

Manual tomorrow actions hold a shared live-owner lock before reading history or waiting for the review advisory lock. Account deletion therefore either waits for the action and purges its records, or completes first and the action fails. A missing owner can never receive a new review event. Notebook history/filtering/choices are read in one read-committed transaction under the same shared owner lock, serializing feedback with strict-mock/diagnostic creation. PostgreSQL regression tests cover both ordering directions and post-deletion absence.


## Categorized review extension (13 November 2026)

Due counts, notebook history and review-set selection accept the same validated category/topic/source-focus filters as practice. Existing owner-private assessment restrictions remain in force. Review events preserve ordered responses and original ordered keys, question contexts and question/choice figures. Scheduling uses the same response-correctness semantics for all native formats; revisiting a corrected question never regrades historical results.
