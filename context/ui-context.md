# UI Context

Source: [PRD sections 9–10, FR-02 and FR-12](../Sibol-CSE-PRD.md). Direction: a calm, warm study companion with clear next actions and readable explanations.

## Theme

The primary experience is a refined light theme: warm ivory backgrounds, clean white surfaces, forest-green actions, and quiet sage highlights. The visual reference is a carefully typeset study journal. Premium quality comes from consistent spacing, readable typography, precise alignment, and thoughtful interaction states.

Light mode is the default on first visit, including when the device prefers dark mode. Retain the PRD's optional dark mode as an explicit user preference; validate its colors separately. Persist an explicit choice without a flash of the wrong theme.

### Light palette

These are the project design baseline. Map values to shadcn semantic CSS variables in the installed styling setup; do not scatter hex values through components. Verify contrast in rendered states before shipping.

| Semantic role / token | Value | Use |
|---|---|---|
| Background / `background` | `#F8F7F3` | Warm ivory page |
| Foreground / `foreground` | `#202B26` | Primary text |
| Surface / `card`, `popover` | `#FFFFFF` | Cards, menus, dialogs |
| Surface text / `card-foreground`, `popover-foreground` | `#202B26` | Text on white surfaces |
| Brand / `primary` | `#245C46` | Primary actions and active navigation |
| Brand text / `primary-foreground` | `#FFFFFF` | Filled action labels |
| Secondary / `secondary`, `accent` | `#EAF1E9` | Quiet emphasis and hover surfaces |
| Secondary text / `secondary-foreground`, `accent-foreground` | `#244B39` | Text on sage surfaces |
| Muted / `muted` | `#F0F0E9` | Subtle grouped backgrounds |
| Muted text / `muted-foreground` | `#626B63` | Supporting labels, never faint body copy |
| Border / `border` | `#DEDFD6` | Decorative surface separators |
| Input / `input` | `#858F83` | Visible control boundaries |
| Focus / `ring` | `#347354` | Keyboard focus indicator |
| Destructive / `destructive` | `#B33D35` | Error and destructive actions |
| Destructive text / `destructive-foreground` | `#FFFFFF` | Filled destructive action labels |

Add dedicated success/warning/error and chart tokens when needed; validate each foreground/background pair. Decorative borders are not sufficient control outlines. Selected answers use a sage fill, green outline, and a visible selection marker. Pair all status colors with text or icons. Selection alone must not imply correctness before feedback is allowed.

### Typography, spacing, and finish

- Use Geist Sans for UI, prompts, and explanations, with a system sans-serif fallback. Use restrained medium/semibold headings; reserve large display text for the introduction. Use tabular numerals for timers and metrics.
- Start body/question text at 16–18px with comfortable line height around 1.6; keep long-form reading near 65 characters per line. Use 14px for supporting labels rather than tiny low-contrast text.
- Use a consistent 4px spacing scale: 16–20px mobile gutters, 24–32px desktop section gaps, and 20–24px card padding where space permits.
- Use roughly 10px control radii, 16px cards, and 20px dialogs. Reserve pill shapes for compact badges.
- Use fine borders and subtle shadows for elevation; dialogs/popovers may have stronger shadows. Avoid nested cards, decorative gradients, glass effects, and oversized empty panels.
- Keep actionable touch targets at least 44px where practical. Use brief 150–200ms state transitions and remove nonessential motion when reduced motion is requested.
- A small sprout motif may identify Sibol in the wordmark or an empty state. Keep question screens focused on studying.

Typography must support English, Filipino, math, tables, and passages, readable line lengths, and resizing. Icons support labels; icon-only controls require accessible names. Celebration is restrained; respect reduced motion and avoid autoplay sound.

## Layout

- Prefer bottom navigation on mobile and a sidebar on desktop. Support 360px screens without page-level horizontal scrolling.
- Dashboard prioritizes today's task, due reviews, resume attempt, weekly completion, recent practice, next topic, and optional countdown. Distinguish personal dates from verified announcements.
- Player prioritizes prompt, choices, timer, save status, and next action. Mock navigation distinguishes answered/unanswered/flagged states without color alone.
- Lessons/results use worked steps, sample sizes, exposure labels, and actionable guidance.
- Admin workflows show publication state, import validation, source metadata, and audit-relevant actions.

Routes follow PRD section 9: introduction/auth/recovery, onboarding, dashboard, plan, lesson library/detail, practice, attempt/results, review, mock exams, progress, bookmarks, settings, and content/import/profile/report/user administration.

## Components and states

shadcn/ui is the required UI component foundation, with Lucide React for icons. Compose product screens from its components instead of introducing another component library or rebuilding equivalent primitives. Confirm compatibility with the generated scaffold and reuse its primitives and `cn()` helper. Style through semantic tokens, component variants, and feature wrappers; preserve generated accessibility behavior.

Use Button, Card, Input, Label, Textarea, Select, Checkbox, RadioGroup, Tabs, Badge, Progress, Separator, Skeleton, Dialog, AlertDialog, Sheet, DropdownMenu, Tooltip, and ScrollArea as features need them. Use RadioGroup semantics for single-answer choices, AlertDialog for destructive confirmations, and Sheet for compact-screen panels. Install components incrementally; a component library alone does not make product flows accessible.

Provide loading, empty, insufficient-evidence, shortage, failure, retry, saving, saved, and expired states. Only server acknowledgment produces “saved.” Practice commitment reveals feedback at its permitted point; mock answers remain editable before finalization.

## Accessibility and tone

Target WCAG 2.2 AA: semantic controls, keyboard operation, visible focus, contrast, labels, screen-reader announcements, and large touch targets. Manage dialog focus and restoration. Announce timer milestones, not every second. Offer extended-time non-strict practice with a separate label.

Use supportive language for missed sessions and manageable adjustments. No guilt, lost-progress threats, fabricated proficiency, or pass guarantees. Personal dedication is optional and learner-configured. Validate mobile, keyboard, screen-reader navigation, and Filipino content before release.

## Implementation reference

The shared semantic tokens and generated shadcn/Base UI variants live in `packages/ui`; `/design-system` provides an authenticated component/state and question-player preview. Geist Sans is self-hosted from the pinned `geist` package. Both themes, rendered contrast, keyboard radio/dialog behavior, responsive layouts and 200% text resizing have local browser coverage. The connected lesson reader, practice/save-recovery player, diagnostic/results, review notebook, plan/dashboard, timed mocks, progress and editorial workflows use the same primitives and have representative mobile/axe browser coverage. Countdown announcements are limited to milestones, with monotonic elapsed time and server synchronization; task completion is labeled self-reported and provisional evidence remains explicit. Actual screen-reader and cross-browser release checks remain in specification 14. See the [progress tracker](progress-tracker.md) for verification details.

## Saved library and account-control implementation

Saved & search is available from Today, Settings and desktop navigation while the four-item mobile bar stays stable. `/bookmarks` uses separate saved-item, private-note and permitted-material views, bounded page controls, source-unavailable cards, revision-aware note dialogs and empty/locked/failure states. Strict/diagnostic restrictions are explained before snippets can appear. Original question review identifies historical versions and corrections.

Settings group account-synchronized theme/motion/reminder choices and data controls. Theme changes apply after server acknowledgment; stale tabs can reload. Device reduced motion is always respected. Future email interest is visibly deferred. Export omits course-bank text/keys and labels the file private. Account deletion has a password/DELETE confirmation, actionable errors, retained-publication/30-day backup disclosures and a public receipt page after sessions are revoked. New mobile screens/dialogs have automated Chromium/axe checks; real assistive-technology and phone validation remain release requirements.
