# Tack: build plan

Source of truth: `SPEC.md` and `DESIGN.md`. This plan covers how they get built. It only adds decisions they leave open, and section 5 lists every place they needed interpreting.

The toolchain and deployment copy Cairn, because it already runs on the same ThinkPad behind the same Cloudflare setup. The real difference is data: Cairn is server-first and read-only offline, while Tack is local-first, with every edit working offline and merging later. That sync layer is the main new work and the main risk, so it gets built first.

## 1. Stack

| Area | Choice | Why |
|---|---|---|
| Language, repo | TypeScript, npm workspaces: `shared/`, `server/`, `web/` | Same as Cairn. Node 24. |
| Server | Fastify, better-sqlite3 (WAL), numbered SQL migrations, Zod | Same as Cairn. One user and one process don't need Postgres. |
| Web | React 19, Vite, React Router, CSS Modules on tokens | Same as Cairn. No SSR needed. |
| Local data | Dexie (IndexedDB) with `liveQuery` | The UI reads only from the device. Changes reach other tabs automatically. |
| Sync | Hand-written, about 500 lines (section 2) | Spec's rules are simple: field-level LWW. CRDT libraries and sync services add much more than that needs. |
| Realtime | Server-Sent Events as a "something changed" signal, followed by a normal pull | One-way is enough, and pushes already go over HTTP. Heartbeat every 25s so Cloudflare keeps it open. |
| PWA | `vite-plugin-pwa` with `injectManifest` (custom worker for push), `useCredentials: true` | Same plugin as Cairn. The custom worker is needed for push and notification clicks. |
| Drag and drop | dnd-kit | Supports the long-press delay, custom lifted card and slide-aside animation. Native HTML5 drag can't do these on phones. |
| Description editor | CodeMirror 6 with custom live-preview decorations | The Markdown text is the document, so it can't be altered by a round trip. Rich-text editors convert back and forth. Lazy-loaded, then precached. |
| Menus, dialogs, selects | Radix primitives, styled with tokens | Keyboard and focus behaviour comes for free. |
| Calendar, date and time pickers | Hand-written, with `date-fns` and `@date-fns/tz` | Native inputs follow the device locale, so they can show AM/PM or a Monday week start, which the spec forbids. Calendar libraries are heavy and hard to fit to these tokens. |
| Emoji picker | `emoji-picker-element`, with its data self-hosted and precached | Its default data source is a CDN, which breaks offline use. |
| Push | `web-push` (VAPID) | Standard library. |
| Other | `lucide-react`, Geist from `@fontsource`, `fractional-indexing` | Named in the design, or the obvious fit. |
| Quality | Vitest, fast-check, fake-indexeddb, Playwright, axe-core, ESLint, Prettier | Cairn's set plus the sync test tools. |
| Token enforcement | Cairn's `stylelint.config.js`, adapted | Makes "no hard-coded values" (SPEC §5) a lint failure instead of a review item. |
| Backups | Cairn's `backup/` container (Alpine, sqlite3, rclone, supercronic) | Already written and tested. It needs renaming, not redesigning. |

## 2. Key technical decisions

**IDs.** UUIDv7, generated on the client so anything can be created offline.

**Sync model: state-based, per-field LWW**
- Each row carries `clocks`, a JSON map of field to hybrid logical clock (HLC) value, and `seq`, taken from one global server counter on every change.
- A client edit is `{table, id, fields, clocks}`. Merging keeps whichever value has the higher clock for each field. The merge is idempotent, so resending a batch after a dropped connection is harmless and no op log is needed.
- `POST /api/sync/push` takes a batch. `GET /api/sync/pull?since=<seq>` returns every row with a higher `seq`, plus tombstones.
- The merge function lives in `shared/` and is the same code on both sides.
- `shared/` also holds the field lists, so a field that isn't declared can't sync.

**Clocks.** The client corrects its clock using the server time from the latest response. The server clamps timestamps more than 5 minutes in the future, so one phone with a wrong clock can't win every conflict from then on.

**Fields that merge as one unit.** `start` and `due` are each a single `{date, time}` value. Merging date and time separately could produce a time from one edit on a date from another.

**Merges can break `start ≤ due`.** The UI prevents it, but two devices editing offline can still produce it. The merged data is kept as is, the display tolerates it, and the next edit fixes it. Nothing crashes and nothing is silently rewritten.

**Dates.** Stored as the strings `YYYY-MM-DD` and `HH:MM`, always read as Africa/Algiers wall-clock time, and never converted. "Today" is computed in that zone from one constant in `shared/`, regardless of the device's zone. The tests run under several `TZ` values to prove it.

**Positions.** Fractional index strings with a little random jitter, with `id` as the tie-break. A move writes `listId` and `position`, both ordinary LWW fields. Hidden completed cards keep their positions, so un-ticking one returns it to where it was.

**Client data flow**
- Writes: one Dexie transaction updates the table and adds to `outbox`, so an edit can't be applied and then lost.
- Reads: components use `liveQuery` only.
- The "saved on this device" marker means "this row has an entry in `outbox`".
- One tab holds the sync role through the Web Locks API.
- Sync runs on startup, SSE signal, reconnect, window focus and after each write. iOS has no Background Sync, so nothing depends on it.
- Description typing is coalesced and flushed after 500ms, and on blur or close. A remote update doesn't replace the text in an editor that has focus.

**Offline detection and Cloudflare Access expiry**
- `navigator.onLine` isn't reliable, so the pill follows real request results.
- When the Access session expires, API calls get redirected to Cloudflare rather than failing like an outage. Worse, the service worker keeps serving the cached shell, so the login page never appears and edits queue up silently.
- So a redirect from the API is treated as its own state: a "Session expired · Sign in" pill that does a full navigation past the worker. The queue stays intact. This isn't in the spec, but without it the app looks healthy while nothing is syncing.
- Set a long Access session duration. Bypass rules for `/manifest.webmanifest`, `/icons/*` and `/sw.js` are a fallback if the step 1 device test shows they're needed.

**Trash: derived, not cascaded**
- Deleting a list sets `deletedAt` on the list only. A card is visible only if it and its list and board are all live.
- So restoring a list brings back exactly the cards it had, and a card trashed earlier stays trashed. A card added offline to a list deleted elsewhere just travels with the list.
- Trash shows one row per item that was deleted directly ("Physics list, 5 cards").
- Purging or Delete forever removes the row and its implicitly trashed children, and writes a tombstone so other devices drop them too. Tombstones are kept forever, since they are tiny at this scale.

**Notifications**
- A server loop runs each minute. It finds live, incomplete cards with a due date whose trigger moment has passed, and sends those with no row yet for that `(cardId, dueValue)`.
- A unique constraint on that pair enforces "at most once per due date value", including when a date is changed away and back.
- Rows in `notifications` also sync to devices, which gives the bell its list.
- Dead subscriptions (404 or 410 from the push service) are removed.
- Late sends after server downtime are covered in section 6, question 2.

**Routing.** The card panel is a `?card=<id>` search param on any route, so it works over Boards, Today and Calendar. Notifications and shared links use the same param, and the back button closes it.

**Settings.** Theme and density sync like any other row, and are mirrored to `localStorage` so an inline script can set the theme before first paint and avoid a flash.

**Client updates.** Pushes and pulls carry a protocol version. A client that's too old holds its queue and reloads to the new worker. Dexie schema versions upgrade without touching `outbox`.

## 3. Repo layout

```
tack/
  shared/   types, Zod schemas, HLC + merge, date rules, today/calendar selection, positions
  server/   Fastify, migrations, sync routes, SSE, scheduler, push, trash purge
  web/      React app, Dexie + sync client, service worker, themes/, components
  backup/   from Cairn
  brand/    logo files from the zip
  scripts/  gen-brand (icon sizes from SVG), seed-perf, gen-vapid, screenshots
  docker-compose.yml  Dockerfile  Makefile  .env.example  LICENSE  README.md
```

## 4. Build steps

Each step ends with a working app and a commit. The order puts risk first: anything that could change the architecture gets tested on real devices before UI is built on it.

| # | Step | Done when |
|---|---|---|
| 1 | **Scaffold and deploy test.** Workspaces, tooling from Cairn, `brand/`, icon generation, tokens, fonts, PWA shell with a test push button, Dockerfile, compose, Makefile, LICENSE. Deploy to the ThinkPad behind Access. | The shell installs on your real phone and desktop through Access, opens with no connection, and receives a test push. SSE stays connected through the tunnel. |
| 2 | **Domain core in `shared/`.** Date rules, chip states, Today selection and sort, HLC, merge, positions. | Unit tests pass, including under other `TZ` values. |
| 3 | **Sync engine.** Schema, push, pull, SSE, tombstones, Dexie store, outbox, leader tab, a bare debug page. | A randomized test (fast-check) with several clients, reordered and repeated batches and offline periods always converges. Two real browsers show edits within a second. |
| 4 | **App shell.** Sidebar and rail, tab bar, top bar, theme, density, toasts, sheet and menu primitives, offline pill, Settings appearance section. | All nav works at both widths in both themes. |
| 5 | **Boards and board view.** Tiles and counts, new board, board menu, lists, composer, card face, ticking with Undo, Show completed, phone swipe and name strip. | A board can be used for real, without drag. |
| 6 | **Drag and drop, with the performance gate.** Reorder and move on desktop, long-press and edge paging on phone, list reorder, sidebar and tile reorder, move announcements. | The `seed-perf` board (10 lists, 200 cards) drags and scrolls smoothly on a real mid-range phone. If not, fix it here, before more UI depends on it. |
| 7 | **Card panel.** Panel and sheet, `?card=`, priority control, date chips and picker, list selector, move up/down, description editor. | Setting a due date from a preset takes two taps. A Playwright test covers it. |
| 8 | **Trash.** Delete everywhere, restore rules, Delete forever, Empty trash, daily purge. | Tests cover every restore case in section 5. |
| 9 | **Today.** Screen, grouping, sort order, badge, ticking in place. | Matches SPEC §3.6, with tests on the selection rules. |
| 10 | **Calendar.** Month and week, spanning bars, board filter, phone dots and day list, drag to change date, quick-add. | Dragging shifts start with due and keeps the time. |
| 11 | **Notifications.** Scheduler, push, bell, unread dot, Settings rows, test button, iPhone hint, tap opens card. | Tested with a fake clock in CI, then a real push on your phone. |
| 12 | **Offline polish.** "Saved on this device" marker, session-expired state, update flow, an end-to-end offline run. | Playwright: edit offline, reload, reconnect, and the second client catches up. |
| 13 | **Backups.** Port Cairn's service, retention, restore. | `make test-backup` passes. A real Drive upload and a restore are run on the ThinkPad. |
| 14 | **Design and accessibility pass.** Splash and tick animations, reduced motion, density, axe-core on each screen, keyboard-only run, 44px target check, contrast test over all token pairs. | Each screen reviewed at both widths and in both themes against `DESIGN.md`. |
| 15 | **README and release.** Screenshots, local dev, deploy, Tunnel and Access notes, VAPID keys, backups and restore. | Steps followed from a clean clone work. |

**Where Docker gets tested.** The compose stack only ever runs on the ThinkPad, run by Lou. Local dev uses `npm run dev`. The difference from Cairn is that step 1 deploys straight away, because the Access and PWA risks can only be tested there.

**Manual device checks.** Automated tests can't cover real push delivery, haptics, PWA install, long-press feel or phone performance. Steps 1, 6 and 11 need you to try them on your phone.

**Status.** Steps 1 to 3 are done. Lou's device test through Access passed on a real phone: install, service worker, server, realtime stream, offline queue and resend, and test push. Still to confirm on a device: two-device realtime, the stream staying connected for several minutes, and tapping a notification with the app closed. Step 4 is next.

## 5. Places the spec needed interpreting

Defaults I'll use unless you say otherwise.

| Topic | Default |
|---|---|
| When a date-only due date is overdue | From 00:00 the day after. Due today is never overdue. |
| "Due soon" for a date-only card | On the due day only. A timed card uses the literal 24 hours. |
| "Next week" preset when today is Sunday | The following Sunday, 7 days on. |
| Card with a start date but no due date | Appears in neither Today nor Calendar, following SPEC §3.6 and §3.7 literally. It only shows on its board. |
| "Completes in place" on Today | Stays visible and struck through while the Undo toast runs, then collapses out. |
| List card count | Counts what's visible: open cards, plus completed ones when Show completed is on. |
| Move up / Move down | Steps past visible neighbours, so hidden cards never make a press look like it did nothing. |
| Week view | Seven day columns with cards and bars, and no hourly grid. |
| Restoring a card whose list is gone | Goes to the end of the first live list. If the board has no lists, a list called "Restored" is created. |
| Restoring an item whose board is in Trash | Row says "Restore the board first". Restoring the board silently would also bring back everything else in it. |
| Purging | Each item's 30 days run from its own `deletedAt`. A purged board takes everything in it. |
| "Enable on this phone" on desktop | Hidden unless the device has a touch-primary pointer. |
| Rail icon for a board with no emoji | Its first letter. |
| Ticked checkbox colour in dark mode | Uses `--on-accent`. DESIGN says "white check", but white on dark `--accent` is only 2.76:1, while `--on-accent` gives 6.63:1. |
| Trello import | Out of scope, since the spec doesn't list it. Boards start empty. |

## 6. Decisions from Lou

1. **Contrast fixes: applied.** `DESIGN.md` now has the corrected `--ink-3`, `--danger`, `--warning`, `--success`, Urgent and Medium values. `--ink-3` is text on `--card` only, with `--ink-2` everywhere else. Selected text on `--accent-soft` uses `--ink`.
2. **Notifications inside the 24-hour window: skip, but send late after downtime.** Recorded in SPEC §3.8. When an edit sets a due date whose trigger has already passed, a `skipped` row is written for that `(cardId, dueValue)`. Anything else overdue for sending goes out late while the card is not yet due, with wording based on the real day.
3. **Zip: removed.** `brand/` is extracted and the docs are committed.
4. **`cloudflared` runs on the server. Tack uses `127.0.0.1:8097`,** clear of the ports in use there (8000, 8001, 8080, 8081, 8088, 8095 and others).

**This machine is the dev client, and the server is remote.** Docker, rclone and everything else server-side gets written here and run by Lou. Each such step ends with exact instructions, as does anything else manual, such as phone tests.

## 7. Risks

| Risk | How it's handled |
|---|---|
| Install, manifest, icons or push misbehave behind Access, especially on iPhone | Tested on real devices in step 1, before anything depends on it. Bypass rules are the fallback. |
| Long-press drag conflicts with swipe paging and vertical scroll on phones | Performance and gesture gate in step 6. |
| dnd-kit is slow with 200 sortable cards | Memoized cards, one in-memory board snapshot, and the step 6 gate. Virtualizing lists is the fallback. |
| Sync bugs that lose data | Randomized convergence tests, shared merge code, an atomic outbox, and daily backups. |
| Live-preview editor takes longer than expected, especially on phone keyboards | It's self-contained in step 7. Plain editing keeps working if the decorations need more time. |

## 8. Working rules

- Commits and PRs carry no AI attribution (your rule from `study-hub/CLAUDE.md`).
- `npm run check` (types, lint, format, tests) passes before every commit.
