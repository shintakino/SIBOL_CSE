# Design system and accessible shell

Status: specified; not implemented.
Source: [Sibol CSE PRD](../../Sibol-CSE-PRD.md), PRD §10; FR-02, FR-12.

## Scope and acceptance

Depends on foundation. Implement the refined light theme in [UI context](../ui-context.md): ivory page, white surfaces, forest-green actions, sage highlights, Geist Sans, generous spacing, subtle borders/shadows, and consistent radii. Light is the initial default regardless of device color preference. Retain selectable dark mode as a secondary preference from FR-12, with separately validated tokens.

Use shadcn/ui as the required component foundation and Lucide React for icons. Inspect scaffold compatibility, reuse existing primitives and cn(), and add missing components incrementally. Use semantic theme tokens, supported variants, and feature wrappers. Preserve primitive accessibility behavior and avoid a competing component library.

Build a reusable shell and a component/state preview covering buttons, labeled fields, answer RadioGroups, cards, badges, progress, navigation, dialogs, and saving/error/empty states. Include a representative dashboard and question-player layout so theme decisions are validated on real study tasks.

Acceptance:

- First visit renders the light theme; explicit theme preference persists without a wrong-theme flash.
- Components use the palette and layout rules in UI context, with consistent typography, spacing, radii, and elevation.
- Standard controls use shadcn/ui primitives; product-specific wrappers preserve their semantics and keyboard behavior.
- Mobile bottom navigation and desktop sidebar support 360px width without page overflow.
- Both themes support question, selected, error, focus, disabled, and save states.
- Keyboard operation, dialog focus/restore, labels, non-color status indicators, and screen-reader announcements work.
- Text resizing, Filipino copy, passages, math, and tables remain readable.
- Reduced motion is respected; no autoplay sound. Timer announcements use milestones.
- Component imports and actual frontend checks pass; inspect mobile and desktop layouts.
- Include loading, empty, insufficient-evidence, shortage, retry, saving/saved/failed, and expired states.
