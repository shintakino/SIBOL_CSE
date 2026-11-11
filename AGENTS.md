<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## Application Building Context

Read the following files in order before implementing or making any architectural decision:

1. `context/project-overview.md` — product definition, goals, features, scope
2. `context/architecture-context.md` — stack, boundaries, data model, invariants
3. `context/ui-context.md` — study experience, themes, accessibility, components
4. `context/code-standards.md` — implementation conventions
5. `context/ai-workflow-rules.md` — scoping, verification, delivery
6. `context/progress-tracker.md` — actual progress, open questions, next steps

Then read relevant sections of [Sibol-CSE-PRD.md](Sibol-CSE-PRD.md) and the matching [feature specifications](context/feature-specs/README.md). The PRD defines product scope; reconcile stale context/specs against it. Explicit user changes should be reflected in affected documents.

Update `context/progress-tracker.md` after each meaningful implementation change. If architecture, scope, or standards change, update the corresponding context before continuing. Do not mark specified features implemented or report unrun checks as passed.

## Project guardrails

- Build Sibol CSE, a private civil-service review companion, using the PRD's Better T Stack configuration: Next.js, Hono/oRPC, Bun backend, Better Auth, PostgreSQL/Drizzle, pnpm/Turborepo, Docker.
- Inspect the actual scaffold before assuming package paths or versions. Verify bootstrap flags when scaffolding. For Next.js, locate the installed guides in the generated workspace; if unavailable, consult matching official documentation before version-specific implementation.
- Use shadcn/ui as the required component foundation and Lucide React for icons. Follow the refined light theme in UI context: ivory backgrounds, white surfaces, forest-green actions, sage highlights, clear typography, generous spacing, and restrained elevation. Light is the initial default; retain optional dark mode, reduced motion, and WCAG 2.2 AA as the target.
- Keep learning records owner-private; admins have no routine access to other learners' answers/notes.
- Enforce server-owned scoring/timing, safe feedback payloads, immutable published versions, checked save revisions, and single-result finalization.
- Content review and inventory gates are part of delivery. Core learning must work without AI. Do not add payments, required queues, or public signup.
- Documents currently describe planned work. Check workspace state before assuming an app exists.

## Task-specific skills

Use one primary skill for the current task and supporting skills only when their trigger applies. Read each selected SKILL.md before using it and announce first use. Do not load the whole catalog, install unrelated skills, or introduce dependencies because a generic example uses them.

The paths below use the current local catalog root `C:/Users/joshu/.codex/skills`. On another machine resolve the same skill name from the available catalog. If missing, report it and use applicable project guidance; never claim to have read an unavailable skill.

| Work | Primary skill / SKILL.md | Supporting skill when needed |
|---|---|---|
| Design direction, theme, layouts, player hierarchy | [ecc-frontend-design-direction](C:/Users/joshu/.codex/skills/ecc-frontend-design-direction/SKILL.md) | [ecc-accessibility](C:/Users/joshu/.codex/skills/ecc-accessibility/SKILL.md) for keyboard, contrast, focus, screen readers |
| Frontend implementation and component state | [addyosmani-frontend-ui-engineering](C:/Users/joshu/.codex/skills/addyosmani-frontend-ui-engineering/SKILL.md) | [ecc-react-patterns](C:/Users/joshu/.codex/skills/ecc-react-patterns/SKILL.md) for React composition |
| Backend services, scoring, selection, reviews, planner | [ecc-backend-patterns](C:/Users/joshu/.codex/skills/ecc-backend-patterns/SKILL.md) | [addyosmani-api-and-interface-design](C:/Users/joshu/.codex/skills/addyosmani-api-and-interface-design/SKILL.md) for oRPC contracts/DTOs |
| PostgreSQL schema, constraints, queries | [ecc-postgres-patterns](C:/Users/joshu/.codex/skills/ecc-postgres-patterns/SKILL.md) | [ecc-database-migrations](C:/Users/joshu/.codex/skills/ecc-database-migrations/SKILL.md) for Drizzle schema changes |
| Auth, permissions, imports, privacy/data controls | [ecc-security-review](C:/Users/joshu/.codex/skills/ecc-security-review/SKILL.md) | Use with relevant backend/data skill |
| Critical scoring/timer/retry/review behavior | [ecc-tdd-workflow](C:/Users/joshu/.codex/skills/ecc-tdd-workflow/SKILL.md) | [ecc-e2e-testing](C:/Users/joshu/.codex/skills/ecc-e2e-testing/SKILL.md) for cross-layer learner flows |
| Browser validation and responsive/accessibility checks | [addyosmani-browser-testing-with-devtools](C:/Users/joshu/.codex/skills/addyosmani-browser-testing-with-devtools/SKILL.md) | Accessibility skill when auditing assistive interaction |
| Containers, health checks, deployment and recovery | [ecc-docker-patterns](C:/Users/joshu/.codex/skills/ecc-docker-patterns/SKILL.md) | [ecc-deployment-patterns](C:/Users/joshu/.codex/skills/ecc-deployment-patterns/SKILL.md) for releases/migrations/rollback |
| Feature specifications and scoped implementation | [addyosmani-spec-driven-development](C:/Users/joshu/.codex/skills/addyosmani-spec-driven-development/SKILL.md) | [addyosmani-documentation-and-adrs](C:/Users/joshu/.codex/skills/addyosmani-documentation-and-adrs/SKILL.md) for context/decisions |

Apply patterns to the chosen stack: generic backend examples are not permission to add a second auth system, Prisma, Redis, or Next.js business API routes. Use Drizzle and Better Auth official documentation for their concrete APIs. Test critical behavior proportionately; documentation-only and simple cosmetic changes do not require application test scaffolding.
