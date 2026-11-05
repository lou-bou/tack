# Tack: product spec

Tack is a personal, self-hosted task board for one user (Lou). Boards hold lists, lists hold cards, and cards move between lists. It replaces Trello for solo work: university courses and assignments, client work, language learning and other personal projects.

The whole point is to be **minimal and fast**. Every feature not described here is out of scope. Setting a date, a priority or marking something done must take one or two taps, never a menu hunt.

Read this file together with `DESIGN.md` (look, layout, motion) and the logo files in `brand/`. Technical choices not fixed here (framework, database, libraries, test strategy, project layout) are yours to make; pick boring, well-supported options that meet the requirements below.

---

## 1. Context and constraints

| Item | Value |
|---|---|
| Users | Exactly one. No sign-up, no login screen, no user table, no sharing or collaboration. |
| Access control | Handled outside the app by Cloudflare Zero Trust (email OTP) in front of the tunnel. The app trusts every request that reaches it. |
| Hosting | Lou's home server: a ThinkPad running Debian, exposed through a Cloudflare Tunnel. |
| URL | `https://tack.boussaid.me` |
| Deployment | Docker Compose (not systemd). One `docker compose up -d` starts everything. |
| Backups | Daily backup of all data (database dump plus any files) to a local folder and to Google Drive with rclone, keeping the last 30 days. Provide the script, the compose service or cron entry, and a restore procedure in the README. |
| Clients | Desktop browsers and phone, used equally. Installable PWA on both. |
| Language | English UI only. |
| Locale | Dates shown as `DD/MM/YYYY`, 24-hour time, week starts on **Sunday**, time zone `Africa/Algiers`. |
| Open source | Public repo, MIT licence, clear README with self-hosting steps. No other community features. |

**Cloudflare Access gotcha:** browsers fetch the web manifest without cookies by default, which Access blocks. Use `<link rel="manifest" crossorigin="use-credentials">` and make sure the service worker, icons and push endpoints keep working behind Access.

---

## 2. Data model

### Board
- `name` (required)
- `emoji` (optional, one emoji, chosen from a picker)
- `color` (one of the board colour tokens in `DESIGN.md`, default `neutral`)
- `showCompleted` (boolean, default `false`)
- `position` (order on the boards screen)
- `createdAt`, `updatedAt`, `deletedAt`

### List
- `boardId`, `name` (required), `position`
- `createdAt`, `updatedAt`, `deletedAt`

### Card
- `listId`, `position`
- `title` (required, single line)
- `description` (Markdown, optional)
- `startDate` (optional date, optional time)
- `dueDate` (optional date, optional time)
- `priority`: `none` | `low` | `medium` | `high` | `urgent` (default `none`)
- `completed` (boolean), `completedAt`
- `createdAt`, `updatedAt`, `deletedAt`

Dates store the date and an optional time separately (or an explicit "all day" flag) so a date-only due date never shifts across time zones. `startDate` must not be after `dueDate`; the UI prevents it.

### Settings (single row)
- `theme`: `system` (default) | `light` | `dark`
- `density`: `compact` (default) | `roomy`
- Push subscription(s) for the phone

There are no labels, members, checklists, attachments, comments, custom fields, covers, archive or activity log.

---

## 3. Screens and behaviour

### 3.1 Navigation
- **Phone:** bottom tab bar with four tabs: **Boards**, **Today**, **Calendar**, **Settings**. Top bar shows the logo, the screen title, the notifications bell and the offline pill when relevant.
- **Desktop (≥ 900px):** a left sidebar replaces the tab bar. It shows the logo, Today, Calendar, then every board (emoji + name, drag to reorder), then Settings at the bottom. The sidebar collapses to an icon rail.

### 3.2 Boards screen
- Grid of board tiles: emoji, name, board colour as the tile's tint, and a small count of open cards and of overdue cards (overdue only shown when > 0).
- **New board**: name, emoji, colour. Opens the new empty board.
- Drag tiles to reorder.
- Board menu (on the tile and inside the board): Rename, Change emoji, Change colour, Delete.

### 3.3 Board view (Kanban)
- Lists side by side, each with a name, a card count and a **+ Add card** composer at the bottom.
- **+ Add list** after the last list.
- The board header shows emoji + name, a **Show completed** toggle (per board, saved on the board, off by default) and the board menu.
- **Add card:** type a title, Enter adds it and keeps the composer open for the next one; Escape or tapping outside closes it. Empty titles are ignored.
- **Drag and drop:** reorder cards within a list, move cards between lists of the same board, reorder lists. Cards and lists never move between boards.
  - Desktop: mouse drag.
  - Phone: long-press (~250ms) lifts the card with a haptic tick where supported; dragging near the screen edge pages to the next list; dropping on the list-name strip at the top drops it at the end of that list.
  - Keyboard / non-drag alternative: the card panel has a **List** selector and a **Move up / Move down** action.
- **Lists:** rename inline by tapping the name; list menu has Delete. Deleting a list moves it and its cards to Trash.
- **Completing:** each card has a round checkbox. Ticking it marks it completed. If **Show completed** is off, the card plays its done animation and disappears, with a 5-second **Undo** toast. If it's on, completed cards stay in place, muted and struck through.
- Phone layout: one list at a time, swiped horizontally with snap, and a scrollable strip of list names at the top to jump between them (see `DESIGN.md`).

### 3.4 Card face
In order: checkbox, title, then a meta row that only shows what is set:
- priority icon (no icon for `none`)
- date chip: `start → due` or just `due`, with time if set
- a small "has description" icon

Date chip states:
- **Overdue** (due date/time passed, not completed): danger colour, flag icon and the word "Overdue".
- **Due soon** (within the next 24 hours): warning colour and clock icon.
- **Completed:** muted, check icon.
- Otherwise neutral.

Overdue cards are only flagged. They never move automatically.

### 3.5 Card panel
Opens as a right-side panel on desktop (the board stays visible and interactive behind it) and as a full-screen sheet on phone. Every change saves immediately; there is no Save button.

Contents, top to bottom:
1. Checkbox + title (editable inline).
2. Board / list breadcrumb with the **List** selector.
3. **Priority:** a segmented control with the five levels. One tap sets it.
4. **Dates:** two chips, **Start** and **Due**. Tapping a chip opens a compact picker with presets **Today**, **Tomorrow**, **Next week** (next Sunday) and a month calendar. An **Add time** toggle reveals a time field (default 23:59 for due, 09:00 for start). A clear (×) button removes the date. Setting a due date from a preset is two taps total.
5. **Description:** Markdown with live preview while typing (styled headings, lists, bold, links, code and checkbox lists render in place as you type; the stored value is plain Markdown).
6. Footer: created / updated times, **Move up / Move down**, **Delete** (to Trash).

Escape or the close button closes it on desktop; swipe down or the back button closes it on phone. Opening a card updates the URL so links and the browser back button work.

### 3.6 Today
One screen answering "what do I have to do today", across all boards. It includes every non-completed card that is:
- **overdue**, or
- **due today**, or
- **in progress**: start date is today or earlier and due date is after today.

Cards are grouped by board (board emoji + name as the group header, in board order). Inside a group: overdue first, then by due time (cards with a time before date-only ones), then by priority (urgent → none). Each row is a normal card face plus its list name; ticking the checkbox completes it in place with Undo. Tapping opens the card panel. Empty state: a short line saying nothing is due today.

The Today tab/sidebar item shows a badge with the number of overdue + due-today cards.

### 3.7 Calendar
- **Month** and **Week** views, toggled with a segmented control (remember the last choice). Weeks start on Sunday. Today is highlighted. Arrows move back and forward; a **Today** button returns.
- Cards appear on their due date. Cards with both a start and a due date appear as a bar spanning the days between them.
- Optional **board filter** (all boards by default) as a row of board chips.
- Completed cards follow each board's **Show completed** setting.
- Tapping a card opens the card panel. Dragging a card to another day changes its due date (keeping the time, and shifting the start date by the same amount if set).
- Tapping an empty day opens a quick-add sheet: title, board, list, with the due date preset to that day.
- Phone month view shows dots per day; tapping a day lists its cards below the grid.

### 3.8 Notifications
- **Trigger:** one notification per card when its due moment is 24 hours away. For date-only due dates, that is 09:00 on the day before. Never for completed or deleted cards. If the due date changes, the notification is rescheduled; it is sent at most once per due date value. If the date is set when the trigger moment has already passed, no notification is sent. If the server was down at the trigger moment, it is sent late as long as the card is not yet due, with wording based on the real day ("Due today at 18:00").
- **Push:** Web Push (VAPID) to the phone only. Settings has an **Enable notifications on this phone** button that asks permission and registers the subscription. The notification shows the card title and "Due tomorrow at HH:MM" or "Due tomorrow"; tapping it opens the card. iPhone requires the PWA to be installed to the home screen first; the Settings row says so when relevant.
- **In-app:** a bell in the top bar / sidebar with an unread dot. It opens a short list of the same "due tomorrow" notifications (newest first, last 30 days), each opening its card. Opening the list marks them read.
- No email notifications.

### 3.9 Settings
- **Appearance:** Theme (System / Light / Dark), Card density (Compact / Roomy).
- **Notifications:** enable on this phone; test notification button.
- **Trash:** every deleted board, list and card, newest first, with type, name, where it came from and days left. **Restore** puts it back where it was (a card whose list is gone goes to the first list of its board; restoring a list restores its cards). **Delete forever** and **Empty trash** ask for confirmation. Items are purged automatically after 30 days.
- **About:** version and a link to the repository.

---

## 4. Offline and sync

- The app shell, fonts and icons are cached so the app opens with no connection, on desktop and phone.
- All data the UI needs is kept on the device (e.g. IndexedDB). Every edit is applied locally first and queued; the queue is sent when the connection returns. The UI is never blocked.
- A small pill in the top bar says **Offline · changes will sync** while offline, and cards with unsent changes show a subtle "saved on this device" marker until they sync.
- **Realtime:** when online, changes made on one device or tab appear on the others within about a second, without a refresh.
- **Conflicts:** last write wins per field, based on the time of the edit. Ordering uses fractional positions so concurrent moves don't collide.
- Push notifications are scheduled and sent by the server, so they work even if the phone app was offline when the date was set (once that edit syncs).

---

## 5. Quality bar

- Fast: board with ~10 lists and ~200 cards scrolls and drags smoothly on a mid-range phone.
- Accessible: everything reachable by keyboard on desktop, visible focus rings, 44px tap targets on phone, colour never the only signal (priority, due states and completion always have an icon or word), respects reduced motion.
- Every visual value comes from the design tokens in `DESIGN.md`; no hard-coded colours, fonts, radii or shadows in components.
- README covers: what Tack is, screenshots, local dev, Docker Compose deploy, Cloudflare Tunnel and Access notes, VAPID key generation, backups and restore.
