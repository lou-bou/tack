# Tack: design spec

**What it is:** a personal Kanban board for one user. Boards, lists, cards, a Today view and a calendar. Installable, offline-capable web app on desktop and phone.

**Personality:** "a clean pinboard". Quick, compact and tactile, like index cards tacked to a wall. Everyday screens are flat, dense and calm; the only flourishes are pinning (the splash) and ticking a card off.

**The core rule:** the tack blue means "act here". It appears on primary buttons, the active nav item, focus rings, the checkbox when ticked and the logo. Nothing else is blue.

---

## Logo
A single dark index card, tilted −6°, with one ticked line and two open lines, pinned at the top by a round blue tack with a small highlight. Flat SVG, no outlines, no gradients.

Files in `brand/`:
- `tack-logo.svg`: for light backgrounds.
- `tack-logo-dark.svg`: for dark backgrounds (lighter card body).
- `tack-icon-maskable-light.svg` / `-dark.svg`: full-bleed PWA icons with the mark inside the safe zone.
- PNG exports at 512px. Generate every other size (favicon, 192, apple-touch) from the SVGs.

Wordmark: "Tack" in Geist 700, tracking −0.02em, ink colour, next to the mark.

## Colour
All colours are CSS custom properties in one theme file, with light and dark sets.

| Token | Light | Dark |
|---|---|---|
| `--bg` (app background) | `#F4F5F8` | `#13141A` |
| `--surface` (lists, sidebar, panels) | `#EBEDF2` | `#1B1D26` |
| `--card` | `#FFFFFF` | `#242733` |
| `--border` | `#DDE0E8` | `#2F3342` |
| `--ink` (text) | `#1F2233` | `#ECEDF2` |
| `--ink-2` (secondary text) | `#5E6378` | `#9A9EB2` |
| `--ink-3` (muted, completed; text on `--card` only, use `--ink-2` elsewhere) | `#717687` | `#898D9F` |
| `--accent` | `#3D6BF0` | `#6E98FF` |
| `--on-accent` | `#FFFFFF` | `#0F1424` |
| `--accent-soft` (selected, hover tint; selected text on it uses `--ink`, the icon keeps `--accent`) | `#E4EBFF` | `#232E52` |
| `--danger` (overdue, delete) | `#C33439` | `#FF6B6E` |
| `--warning` (due soon) | `#955F00` | `#F2B13C` |
| `--success` (completed check) | `#1D9B68` | `#3FCB8E` |

Logo colours are fixed: card `#1F2233` (dark variant `#2E3350`), tack `#5B8CFF`, highlight `#B9CCFF`, lines `#EDEBE6` and `#5B5F73`.

### Priority
Always an icon plus colour; the label shows in the panel and on hover/long-press.

| Level | Light | Dark | Lucide icon |
|---|---|---|---|
| Urgent | `#C33439` | `#FF6B6E` | `chevrons-up` |
| High | `#B8541A` | `#FF9452` | `chevron-up` |
| Medium | `#955F00` | `#F2B13C` | `equal` |
| Low | `#557290` | `#8FAAC4` | `chevron-down` |
| None | no icon | no icon | — |

### Board colours
A board's colour tints its tile and the board view background. Ten swatches, each muted enough that cards stay readable. Light value is the background tint; dark value is the dark-theme tint.

| Token | Light | Dark |
|---|---|---|
| `neutral` (default) | `#F4F5F8` | `#13141A` |
| `slate` | `#E6EAF0` | `#171B24` |
| `blue` | `#E3EBFC` | `#141B2E` |
| `teal` | `#DDF1EE` | `#11201F` |
| `green` | `#E2F1E2` | `#142016` |
| `olive` | `#ECEEDC` | `#1C1F13` |
| `amber` | `#F8EED8` | `#241D10` |
| `coral` | `#FBE4DC` | `#261612` |
| `rose` | `#F8E1E8` | `#24141A` |
| `violet` | `#ECE4FA` | `#1C1628` |

**Never:** gradients, glassmorphism, background images, neon glow, emoji in UI chrome (board emojis are user content and are fine), pure black.

## Type
- **Geist** for everything: UI, titles, card text. Titles 600–700, body 400–500.
- **Geist Mono** for dates, times and counts (tabular figures).
- Self-hosted (woff2) so they work offline.
- Sizes: card title 14px compact / 15px roomy, list name 14px 600, board title 20px 700, screen titles 24px 700.
- Sentence case everywhere ("Add card", not "Add Card").

## Shape and depth
- 4px spacing grid.
- Cards: 10px radius, 1px `--border`, no resting shadow. List columns: 14px radius on `--surface`. Buttons and inputs: 10px radius. Chips: pill.
- Controls: 44px tall on touch, 36px with a mouse.
- Shadows only on floating things: a lifted (dragged) card, menus, the card panel on desktop, sheets and toasts. In dark mode, floating layers use a lighter surface plus a faint border instead of a heavy shadow.
- Icons: Lucide, 18px on cards, 20px elsewhere, 1.75 stroke.

## Density
| | Compact (default) | Roomy |
|---|---|---|
| Card padding | 8px 10px | 12px 14px |
| Gap between cards | 6px | 10px |
| List width (desktop) | 272px | 300px |
| Meta row | inline under title, 12px | own row, 13px |

Compact matches Trello's card density.

## Layout
**Phone (< 900px)**
- Top bar: logo + screen title on the left; bell and offline pill on the right.
- Bottom tab bar: Boards, Today, Calendar, Settings, with icon + label, active tab in `--accent` (same pattern as Cairn, Whirl and Cahier).
- Board view: one list at a time, each list ~88% of the screen width so the next one peeks in; horizontal swipe with snap. A scrollable strip of list names sits under the board header; the current list is underlined in `--accent`.
- Card panel: full-screen sheet sliding up; the bottom tab bar hides while it's open.
- Forms and pickers (new board, date picker, quick-add) open as bottom sheets.

**Desktop (≥ 900px)**
- 15rem left sidebar (collapsible to a 64px icon rail): logo, Today, Calendar, a divider, the boards (emoji + name, overdue dot), and Settings pinned at the bottom.
- Board view: lists in a horizontally scrolling row on the board's colour; vertical scroll inside each list.
- Card panel: 28rem right-side panel over the board, which stays usable on its left.
- Today: a single centred column up to 46rem wide.
- Calendar: full width; month cells show up to 3 cards then "+N more".

## Components
- **Card face:** round 18px checkbox (border `--ink-3`; ticked = filled `--accent` with `--on-accent` check), title (2 lines max, then ellipsis), meta row (priority icon, date chip, description icon). The whole card is the tap target except the checkbox.
- **Completed card:** title in `--ink-3` with strikethrough, chip shows a check in `--success`.
- **Date chip:** pill, Geist Mono 12px, states as in `SPEC.md` §3.4. Overdue: `--danger` text on a 12% `--danger` tint with `flag` icon and "Overdue". Due soon: `--warning` text on its tint with `clock` icon.
- **Priority control (panel):** five-segment pill control, each segment icon + label.
- **Add card composer:** a card-shaped textarea in place, with an "Add" button and ×.
- **Offline pill:** `cloud-off` icon + "Offline · changes will sync", `--surface` background, `--ink-2` text.
- **Toasts:** bottom centre (above the tab bar on phone), with an Undo action where relevant, 5 seconds.
- **Empty states:** one short line and one action, no illustrations.

## Motion
Everyday transitions are quick (120–240ms, ease-out). Buttons shrink slightly when pressed. No tap highlight on touch; hover effects only on devices with a mouse.

1. **Opening the app (once per launch):** the card drops in from slightly above and settles at its −6° tilt, the tack presses down with a small squash, then the logo flies into the top bar / sidebar. Done by ~1.6s.
2. **Ticking a card:** the checkbox fills with a quick pop (scale 1 → 1.15 → 1, 200ms), the title strikes through left to right; if completed cards are hidden, the card then collapses out (250ms) and the Undo toast appears.
3. **Dragging:** the lifted card scales to 1.03, tilts 2° and gets its floating shadow; other cards slide aside smoothly.

With reduced motion on, the splash shows the logo still, ticking changes state instantly, and drag has no tilt or scale.

## Accessibility
- Body text contrast at least 4.5:1 in both themes, including on every board colour.
- Visible `--accent` focus rings (2px, 2px offset) on everything focusable.
- Priority, due states and completion never rely on colour alone.
- The checkbox and drag handles have accessible labels; moves announce "Moved to {list}".
