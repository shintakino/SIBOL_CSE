# Code Standards

Source: [PRD sections 11–17](../Sibol-CSE-PRD.md). Apply to the generated workspace rather than assuming files exist.

## Implementation

- Strict TypeScript; avoid `any`, validate unknown inputs, keep modules focused.
- Use pnpm workspace scripts and lockfile. Bun runs the backend; validate Next runtime separately.
- Read installed Next guides before frontend code. Default to Server Components; add client boundaries for browser interaction/state.
- Keep Hono/oRPC handlers thin; separate selection, scoring, and planning from transport and Drizzle persistence.
- Share validated contracts, never secrets, answer keys, or database modules with browser bundles.
- Follow generated package paths; avoid duplicate schemas/auth systems and speculative abstractions.

## API and security

- Resolve identity/role from Better Auth; enforce owner scope on personal reads/writes. Reject client-supplied roles.
- Bound set length, pagination, imports, and notes; validate choice membership and profile/topic compatibility.
- Use response DTOs appropriate to mode and feedback state. Sanitize authored/imported rich text and media references.
- Use idempotency keys or uniqueness for mutations; check answer revisions and return useful conflict/expiry errors.
- Rate-limit auth, invitations, imports, and expensive creation; use a shared proxy/database-backed limiter across API instances.
- Exclude passwords, tokens, private notes, and answer content from logs by default. Use request IDs and audit publication, role changes, and scoring corrections.

## Data integrity

- Source-control Drizzle migrations. Use database constraints and transactions, not just application checks.
- Never edit published versions in place; pin attempt versions/choice order and preserve original results.
- Lock finalization, store one result, reject terminal/post-expiry edits and stale revisions.
- Keep review state unique per learner/question and events idempotent; no multiple interval advances on one study day.
- Store UTC timestamps; use learner timezone for study dates, never device time for deadlines.
- Separate lesson completion from proficiency and first exposure from repeats.

## UI and verification

- Use shadcn/ui for standard UI components and Lucide React for icons. Reuse scaffold primitives and cn(); add only needed components and avoid a competing UI library.
- Follow the light-theme palette, typography, spacing, and radii in UI context through semantic tokens and feature wrappers. Preserve generated primitive behavior unless explicitly tasked to change it.
- Provide accessible loading/error/empty states and truthful save feedback.
- Test domain calculations, cross-user access, feedback leakage, races, stale saves, history, and shortages. Use PostgreSQL integration checks for transactions/constraints.
- E2E: onboarding → practice → review; strict mock → expiry → results. Complement with mobile/keyboard/screen-reader checks.
- Run actual scaffold typecheck/lint/build/test tasks as relevant. Never invent commands or report unexecuted checks as passed.
