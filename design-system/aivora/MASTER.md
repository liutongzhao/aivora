# Aivora Design System

**Status:** Product workspace baseline
**Updated:** 2026-10-10
**Scope:** User workspace and administrator operations console

## Product Direction

Aivora is a work-oriented AI question-processing SaaS. The interface should feel
calm, trustworthy, precise, and efficient during repeated use.

- User workspace: make eligibility, next action, task progress, and model setup obvious.
- Admin console: make operational risk, user state, entitlement state, and actions scannable.
- Use full-width page sections with constrained content; reserve cards for repeated records,
  framed tools, dialogs, and drawers.
- Do not use a marketing hero, glassmorphism as the page surface, decorative blobs,
  gradients, or excessive shadows.

## Palette

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#f5f6f8` | App background |
| `--surface` | `#ffffff` | Panels, tables, forms |
| `--surface-soft` | `#fafbfc` | Hover and empty-state surfaces |
| `--ink` | `#171a1f` | Primary text |
| `--ink-soft` | `#4e5662` | Supporting text |
| `--muted` | `#737d8c` | Metadata and secondary labels |
| `--line` | `#e3e7ec` | Dividers and borders |
| `--accent` | `#1769e0` | Primary actions and links |
| `--accent-soft` | `#edf4ff` | Selected and informational states |
| `--green` | `#18805a` | Available, active, successful |
| `--orange` | `#a96808` | Expiring, pending, attention |
| `--red` | `#c83d4e` | Errors, expired, destructive actions |

Use semantic tokens instead of raw colors in components. Status must include text or
an icon; color alone must never carry meaning.

## Typography

- Prefer `Plus Jakarta Sans` for headings and body when the font is available.
- Keep a system fallback stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Body text is at least 14px in the desktop web app and 16px for compact mobile form content.
- Page titles: 32-40px; section titles: 18-22px; labels and metadata: 11-13px.
- Use normal letter spacing. Do not use oversized hero typography in work surfaces.
- Keep line height around 1.5 for body text and 1.25-1.35 for headings.

## Layout

- Desktop shell: fixed 232-248px sidebar, flexible content area, 72px topbar.
- Page content: max-width 1280px, 32-48px desktop padding, 16-20px mobile padding.
- Default spacing scale: 4, 8, 12, 16, 24, 32.
- Dashboard density: compact enough for scanning, with at least 12px between interactive groups.
- Tables may scroll horizontally on narrow screens, but primary actions must remain reachable.
- Mobile navigation becomes a compact menu; do not squeeze the desktop sidebar into the viewport.

## Surfaces And Components

- Border radius: 6-10px for controls and panels; use larger radii only for dialogs or clearly
  distinct feature surfaces.
- Borders define structure; shadows are subtle and reserved for overlays and selected tools.
- Primary buttons use blue fill and white text. Secondary actions use white fill with a border.
- Destructive actions use red only when the action is actually destructive.
- Icon buttons must have `aria-label` and a tooltip when the icon meaning is not obvious.
- Use Lucide icons; never use emoji as interface icons.
- Avoid nested cards. Use section headings, dividers, tables, drawers, and tabs for hierarchy.

## User Workspace Patterns

- The first screen must show eligibility: active entitlement, trial remaining, or the exact
  reason usage is blocked.
- Every blocked state includes the next action, such as activating a license or configuring a model.
- Account center groups profile, entitlement, redemption, usage history, and security.
- Task lists use filters, readable status badges, progress, and an explicit failure reason.
- Empty states explain what is missing and include one primary action.

## Admin Console Patterns

- Prefer dense tables, filter bars, metric rows, attention lists, and right-side detail drawers.
- Overview metrics must link to the relevant management view.
- User details show account, verification, trial, entitlement, models, tasks, and admin actions.
- Dangerous actions require a confirmation dialog and a success/error result.
- Use pagination for large collections; do not render unbounded lists.
- Keep admin-only actions visually distinct from read-only information.

## Interaction And Accessibility

- Hover transitions: 150-250ms; do not shift layout with scale transforms.
- Loading states preserve layout and show the operation being performed.
- Respect `prefers-reduced-motion: reduce`.
- Keyboard focus must be visible with a 2px outline and sufficient contrast.
- Dialogs and drawers support Escape to close and restore focus to the trigger.
- Buttons and touch targets are at least 40px high on desktop and 44px on mobile.
- Error messages appear near the failed action and use `role="alert"` when urgent.

## Required Responsive Checks

Before delivery, verify at:

- 375px: mobile navigation, forms, drawers, table access.
- 768px: tablet wrapping and two-column transitions.
- 1024px: compact desktop shell.
- 1440px: full dashboard density and detail drawer.

## Do Not Ship

- Marketing-style hero sections inside authenticated workspaces.
- Glass panels that reduce text contrast.
- Gradient backgrounds, decorative orbs, or bokeh effects.
- Emoji icons or unlabeled icon-only controls.
- Disabled controls without an explanation.
- Empty lists that do not explain the next step.
- Errors that only say “请求失败” or “操作失败”.
