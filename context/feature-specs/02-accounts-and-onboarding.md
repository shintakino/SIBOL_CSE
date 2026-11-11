# Accounts and onboarding

Status: specified; not implemented.
Source: [Sibol CSE PRD](../../Sibol-CSE-PRD.md), FR-01; PRD §§3, 5, 12.

## Scope and acceptance

Depends on foundation and basic form primitives. Routes: /sign-in, /forgot-password, /reset-password, /onboarding; entry at /. Use Better Auth email/password sessions and configured transactional email for recovery. Invitation acceptance routing must fit the generated integration.

Securely bootstrap the first admin; no public registration or client-selected role. Store hashed, expiring, single-use invitation tokens. Admin invitation/role changes are audited. Collect Professional/Subprofessional level, preferred days, daily minutes, optional exam date, and explanation-language preference. Default study timezone is Asia/Manila.

Acceptance:
- Expired/replayed invitations fail; successful acceptance consumes once.
- Anonymous protected access, cross-user access, and role escalation fail server-side.
- Sign-in/out and recovery work end to end, including invalid/expired recovery tokens.
- Admin previews or own attempts do not grant routine access to other learners' results/notes.
- Level changes create a new plan while historical attempts retain the original profile.
- Dates are personal targets unless linked to a verified announcement; do not assume level/date/budget.
