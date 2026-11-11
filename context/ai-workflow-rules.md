# Development Workflow

## Source and scope

Read the six context files in AGENTS.md order, then relevant PRD sections and the [feature spec](feature-specs/README.md). The PRD defines product scope; reconcile conflicting context/specs against it. User-directed changes should update affected documentation explicitly.

Build one coherent, verifiable feature slice at a time. A slice may include UI, API, and database changes needed to prove behavior. Avoid unrelated work. Load only task-relevant skills from AGENTS.md; generic examples do not override the PRD stack or add infrastructure.

## Before implementation

1. Check actual workspace state and instructions.
2. Identify FR identifiers, dependencies, acceptance criteria, and skills.
3. For bootstrap, verify supported Better T Stack flags against official documentation, preserve existing documents, and record resolved versions.
4. Before Next.js code, read relevant guides under the installed `node_modules/next/dist/docs/`, including the actual workspace installation path. If absent, obtain matching official documentation before relying on version-specific APIs.
5. Record unresolved choices in the tracker; label provisional decisions. Do not block unrelated work on provider/content choices.

## Delivery

- Protect ownership, solution visibility, immutable history, and timer consistency.
- Keep generated UI/library internals reusable; put product behavior in feature components/services.
- Run relevant checks; pair UI automation with mobile/accessibility inspection.
- Update progress after each meaningful implementation change. Update architecture/scope/standards context before continuing if those change.
- Report actual implementation and verification; completed specifications do not mean completed features.
- Record consequential decisions in architecture context; expand to dedicated ADRs when useful.

## Phases

| Phase | Work | Exit gate |
|---|---|---|
| 1 Foundation | Scaffold, containers, schema, auth, invitations, onboarding | Learner/admin permissions verified |
| 2 Content and practice | Editorial tools/imports, lessons, practice, explanations | Reviewed pilot content works end to end |
| 3 Learning loop | Diagnostic, review, planner, dashboard | Daily flow survives refresh/retries |
| 4 Simulation | Blueprints, strict mocks, scoring, analytics | Inventory/timing checks pass |
| 5 Personal pilot | Mobile polish, recovery, backups, feedback | One full week of usable sessions |

Bookmarks, notes, settings, and data controls remain MVP and must be completed before release. Content authoring/review runs alongside implementation. Do not fix a delivery date before sources and reviewer availability are known.
