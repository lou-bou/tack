# Tack mobile

A Flutter app for Tack, for personal use: built here, installed as an APK from GitHub Releases,
never published. It talks to the same API as the web app (`/api/sync/push`, `/api/sync/pull`,
`/api/events`, `/api/health`). The deploy ignores this folder (`.dockerignore`, Prettier, ESLint).

```
mobile/
  packages/kit/   shared core, copied from Nook (API client, Access token, storage, theme, widgets)
  tack/           the Tack app: data layer, sync, notifications, screens
  keys/           release signing key and its passwords (gitignored, back it up)
```

## How it works

- **Auth.** Every request carries the Cloudflare Access service token
  (`CF-Access-Client-Id` / `CF-Access-Client-Secret`). No cookies, no browser, no login
  redirects; redirects are never followed. If Access refuses the token the app says so
  ("Access refused") instead of looking offline. The server address and token are typed in on
  the phone and kept in the Android Keystore. Nothing secret is in this repo or in the APK.
- **The same sync as the web app.** Field-level last-writer-wins with hybrid logical clocks,
  fractional positions, tombstones and the restore epoch: `shared/src/hlc.ts`, `merge.ts`,
  `positions.ts`, `dates.ts`, `selection.ts` and `calendar.ts` ported to Dart in
  `tack/lib/data/`. `tack/tool/gen_vectors.ts` runs the JS code and writes
  `tack/test/vectors.json`; the Dart tests must give identical results (clocks, merges, position
  keys, dates in Africa/Algiers, Today, Trash, Calendar), and a Dart copy of the server's
  `applyChanges`/`pullChanges` must answer every recorded push and pull exactly like the real
  one. The release workflow regenerates the vectors and stops if `shared/` has moved on.
- **Fast open.** Every board, list, card and queued change lives in SQLite on the phone and is
  loaded before the first frame; the UI never waits for the network. Sync runs on open, on
  resume, when the network returns, just after an edit, when the server announces a change
  (`/api/events`) and every 30 s.
- **Bad connections.** Every edit is written to the phone first, with the change queued in the
  same transaction (one queue entry per row, like the web app). The server merges by field
  clock, so a batch sent twice changes nothing, and an entry leaves the queue only once the
  server has answered for it: a lost answer or a killed app never duplicates or loses anything.
  A pull and its cursor are saved in one transaction.

## What works offline

| Feature | Offline |
|---|---|
| Boards, a board's lists and cards, Today, Calendar, the card panel, the bell list, Trash | Yes |
| Create, edit, move, reorder, tick, plan for today, delete, restore, theme, density | Yes, sent later |
| Delete forever, Empty trash | Yes: gone from the phone at once, sent later |
| Due-date notifications | Yes: scheduled on the phone |
| "Saved on this device" marks and the offline pill | Yes |
| First sync of a new phone, changes from other devices, new bell entries | Needs the server |

## Notifications

The web app gets a Web Push from the server the day before a card is due. An Android app can't
receive Web Push, and there is no Firebase here. Instead the phone schedules the same
notification itself, with the server's rule (SPEC §3.8): one per open, live card, 24 hours
before a timed due date or at 09:00 the day before a date-only one, once per due date value,
never for a date set after that moment. It is recomputed after every sync and every edit.
Settings → Notifications turns it on (Android asks for permission) and sends a test.

What that changes compared with the web push:

- A due date set on another device only notifies on the phone if the phone has synced since
  (opening Tack is enough). There is no background sync.
- It works with the server down, and for dates set offline on the phone.
- The wording is fixed when the notification is scheduled; one shown late (the phone was off)
  still says "Due tomorrow".
- If the PWA is also installed on the phone with notifications on, both notify. Remove one.
- The bell list still comes from the server, through sync.

## Cloudflare Access setup (once)

1. Zero Trust → **Access → Service Auth → Service Tokens**: reuse Nook's or Cairn's token, or
   create one. The secret is shown once.
2. **Access → Applications** → the Tack application (or the wildcard `*.boussaid.me` one) →
   **Policies** → a policy with action **Service Auth**, Include → **Service Token** → that
   token. An Allow policy does not accept service tokens.
3. In the app: `https://tack.boussaid.me`, the client ID and the secret, then **Test and save**.
   In Nook, Settings → Connection → **Copy setup**, then **Paste setup** here (change the
   address).

## Install and update

Releases are built by GitHub (`.github/workflows/mobile-release.yml`):

```sh
git tag mobile-v1.0.0 && git push origin mobile-v1.0.0
```

A few minutes later the signed APK is on the repo's Releases page. Open that page on the phone,
tap `tack-1.0.0.apk`, and allow the browser to install apps the first time. Updates install over
the existing app and keep the saved connection and data.

The workflow needs two repository secrets (Settings → Secrets and variables → Actions), the same
values as Nook's and Cairn's but set again on this repository: `MOBILE_KEYSTORE_BASE64`
(`base64 -w0 mobile/keys/release.jks`) and `MOBILE_KEYSTORE_PASSWORD` (the `storePassword`
value in `mobile/keys/key.properties`).

**Signing key.** `mobile/keys/` is not in git. Updates only install over a copy signed with the
same key; without it the build falls back to the debug key.

To build on this machine (Flutter, JDK 17 and the Android SDK under `~/sdk`):

```sh
cd mobile/tack
flutter build apk --release --target-platform android-arm64
```

WSL has 7.7 GB here; `android/gradle.properties` caps Gradle at 3 GB so a build cannot run it
out of memory.

## Develop

```sh
npx tsx mobile/tack/tool/gen_vectors.ts     # after changing shared/ or the server's sync rules
cd mobile/packages/kit && flutter analyze && flutter test
cd mobile/tack && flutter analyze && flutter test
flutter test tool/screenshots_test.dart --update-goldens   # PNGs of each screen in build/screens/
```

The tests run the real SQLite store and sync engine against the fake server: two- and
three-phone convergence with offline edits, lost and replayed pushes, purges, a server restore
and an app restart; notification scheduling; and the app itself (first run, offline open,
composer, tick and Undo, two-tap due date, drag and drop, Today, Settings). Screenshots show
boxes for emoji: the test renderer has no emoji font; Android does.

## Not done

- iOS: the project folder exists but has not been built or configured (notifications would need
  the iOS permission flow too).
- The description field styles Markdown as you type (headings, lists, checkboxes, bold, links,
  code) with the Markdown marks shown faint; the marks are hidden, and checkboxes and links can
  be tapped, when the field is not being edited. The web app hides the marks while typing too.
- No home-screen widget and no background sync.
- Plain `http://` server addresses are blocked by Android in release builds; use HTTPS.
