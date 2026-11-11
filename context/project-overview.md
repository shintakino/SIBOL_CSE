# Sibol CSE

Source: [Sibol-CSE-PRD.md](../Sibol-CSE-PRD.md), version 1.0, 22 October 2026. This context translates the supplied PRD; official references have not been independently reverified.

## Product and audience

Your Civil Service Review Companion: a calm, mobile-friendly Philippine CSE-PPT study app. Initially serve one invited learner and an administrator while supporting more learners without redesign. Answer: What should I study? Why was my answer wrong? Am I improving on unfamiliar questions?

Sibol is a proposed brand with availability unchecked. This independent study aid must not imply CSC endorsement, guaranteed success, estimated official ratings, or pass probabilities.

## Core journey

1. Accept an invitation and sign in.
2. Choose Professional or Subprofessional, study days, daily minutes, optional target date, and explanation language.
3. Complete or skip a diagnostic; skipping creates a balanced plan with insufficient-evidence labels.
4. Follow today's lesson, practice, and due review.
5. Read explanations, save private notes, and revisit mistakes after a delay.
6. Take timed mocks when reviewed inventory meets the selected blueprint.
7. Review first-exposure performance, pacing, coverage, and next actions.

## MVP scope

| Requirement | Capability |
|---|---|
| FR-01 | Invitation-only accounts, recovery, onboarding, permissions |
| FR-02 | Dashboard, resume attempt, save status, next actions |
| FR-03 | Configurable balanced diagnostic, default 30 items |
| FR-04 | Versioned lessons, worked examples, linked practice |
| FR-05 | Topic/difficulty practice in sets of 5/10/20 |
| FR-06 | Mistake notebook and deterministic spaced review |
| FR-07 | Weekly planning within available time |
| FR-08 | Short timed sets and full server-timed mocks; release gate |
| FR-09 | Results, first-exposure analytics, pacing, sample sizes |
| FR-10 | Bookmarks, private notes, permitted-content search |
| FR-11 | Reviewed publication, imports, quarantine, errata |
| FR-12 | Preferences, dark mode, reduced motion, export/deletion |

See the [feature index](feature-specs/README.md) for dependencies and acceptance checks.

## Visual direction

Use shadcn/ui components with a refined light theme: warm ivory, white surfaces, forest green, quiet sage accents, clear typography, and generous spacing. Light is the initial default; dark mode remains an optional preference. Concrete tokens and component conventions live in [UI context](ui-context.md).

## Boundaries

- Online-first with temporary connection recovery; full offline study is deferred.
- English interface; English and Filipino content where appropriate.
- Store UTC timestamps; default study-calendar timezone is Asia/Manila.
- Model both levels; launch the selected level's content first. Collect level, date, and budget through onboarding.
- Admins manage content and invitations without routine access to another learner's answers or notes. Future sharing requires explicit, revocable consent.
- No public signup, payments, ads, public leaderboard, or required external AI.
- Deferred: approved-content AI explanations/drafts, consent-based study-buddy sharing, scheduled email/push reminders, offline packs, printable worksheets, richer diagrams, multiple reviewers, expanded content analytics.

## Content and release gates

- At least one concise lesson and worked example for each enabled topic.
- At least 300 reviewed unique questions for the first level, at least 30 per major area, and enough inventory for all enabled blueprint quotas.
- Two complete mock forms without overlap between forms. Practice exposure may overlap and must be disclosed.
- Enable the other level only after equivalent checks. Expansion to 600–1,000 questions is backlog, not an MVP dependency.
- Questions must be original, licensed, or permitted; no leaked/confidential reconstructed items. All published answers and explanations are reviewed.
- Release requires access/scoring/timing checks, recovery and restore checks, and a complete mobile study flow. Personal pilot validates one full week of usable sessions.

## Success measures

Target four completed planned sessions weekly for an active learner; track unseen-question weak-topic accuracy over four weeks with sample sizes, pacing and unfinished items, and delayed correction at 7 and 21 days. Dashboard exposes next task and weakest observed topic. Published content review coverage is 100%. Learning targets are hypotheses, not promises or substitutes for the review schedule.
