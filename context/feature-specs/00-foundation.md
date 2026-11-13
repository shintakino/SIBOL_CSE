# Foundation and workspace

Status: implemented and locally verified on 12 November 2026. See [progress tracker](../progress-tracker.md) and [setup/runbook](../../README.md) for evidence and release follow-ups.
Source: [Sibol CSE PRD](../../Sibol-CSE-PRD.md), PRD §§11–16; phase 1.

## Scope and acceptance

No dependencies. Bootstrap using the exact requested configuration in PRD §11 after checking supported flags. Preserve these docs, record resolved versions, initialize Git as part of bootstrap, and retain the pnpm lockfile.

Use Next.js web, Hono/oRPC API, Bun backend, Better Auth, PostgreSQL/Drizzle, pnpm/Turborepo, and Docker. Adapt package paths to the generated scaffold. Configure runtime validation, shared contracts, auth/database boundaries, and placeholder-only environment examples.

Acceptance:
- Web/API/database can start in the documented development environment; verify actual Next runtime independently.
- One schema and auth integration; secrets and answer keys cannot reach browser imports.
- Migration and workspace check commands are documented from actual scripts.
- Foundation schema enforces the ownership, version, answer revision, and uniqueness model in architecture context.
- Initial containers and health checks work; full operational release checks remain in spec 14.
