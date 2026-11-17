import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:material_ui/material_ui.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../data/api.dart';
import '../data/dates.dart';
import '../data/selection.dart';
import '../data/store.dart';
import '../data/sync.dart';
import '../notify/notifier.dart';
import '../notify/schedule.dart';
import 'state.dart';
import 'theme.dart';
import 'widgets/common.dart';

const repositoryUrl = 'https://github.com/lou-bou/tack';

/// The connection form as its own screen (Settings, and the pill when Access refuses).
Future<void> openConnection(BuildContext context) => Navigator.of(context, rootNavigator: true).push(
  MaterialPageRoute<void>(
    builder: (context) => Consumer(
      builder: (context, ref, _) => ConnectionScreen(
        appName: 'Tack',
        healthPath: TackApi.healthPath,
        isHealthy: TackApi.isHealthy,
        onSaved: () {
          ref.read(syncProvider.notifier).sync();
          Navigator.of(context).pop();
        },
      ),
    ),
  ),
);

/// Settings (SPEC §3.9): appearance, notifications, Trash, the connection, about.
class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ColoredBox(
      color: context.kit.bg,
      child: Column(
        children: [
          TopBar(title: 'Settings', onFix: () => openConnection(context)),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(Space.s4, Space.s2, Space.s4, Space.s10),
              children: const [
                _Appearance(),
                SizedBox(height: Space.s3),
                _Notifications(),
                SizedBox(height: Space.s3),
                _Trash(),
                SizedBox(height: Space.s3),
                _Connection(),
                SizedBox(height: Space.s3),
                _About(),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children, this.action});
  final String title;
  final List<Widget> children;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(Space.s4),
    decoration: BoxDecoration(
      color: context.tack.card,
      borderRadius: BorderRadius.circular(TackRadii.list),
      border: Border.all(color: context.kit.border),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Semantics(header: true, child: Text(title, style: context.text.titleMedium)),
            ),
            ?action,
          ],
        ),
        const SizedBox(height: Space.s3),
        ...children,
      ],
    ),
  );
}

class _Appearance extends ConsumerWidget {
  const _Appearance();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lib = ref.watch(storeProvider);
    final store = ref.read(storeProvider.notifier);
    return _Section(
      title: 'Appearance',
      children: [
        const SectionLabel('Theme'),
        KitSegmented<String>(
          value: lib.theme,
          options: const [SegOption('system', 'System'), SegOption('light', 'Light'), SegOption('dark', 'Dark')],
          onChanged: store.setTheme,
        ),
        const SizedBox(height: Space.s4),
        const SectionLabel('Card density'),
        KitSegmented<String>(
          value: lib.density,
          options: const [SegOption('compact', 'Compact'), SegOption('roomy', 'Roomy')],
          onChanged: store.setDensity,
        ),
        const SizedBox(height: Space.s2),
        Text('Shared by all your devices.', style: context.text.bodySmall),
      ],
    );
  }
}

/// Due-date reminders, scheduled on this phone from the cards' due dates (no push service).
class _Notifications extends ConsumerStatefulWidget {
  const _Notifications();

  @override
  ConsumerState<_Notifications> createState() => _NotificationsState();
}

class _NotificationsState extends ConsumerState<_Notifications> {
  bool? _allowed;

  @override
  void initState() {
    super.initState();
    _check();
  }

  Future<void> _check() async {
    final ok = await ref.read(dueNotifierProvider).allowed();
    if (mounted) setState(() => _allowed = ok);
  }

  Future<void> _set(bool on) async {
    final prefs = ref.read(prefsProvider.notifier);
    if (!on) {
      prefs.set(notifyPref, false);
      return;
    }
    final ok = await ref.read(dueNotifierProvider).request();
    if (!mounted) return;
    setState(() => _allowed = ok);
    if (!ok) {
      Toasts.show("Notifications are blocked in this phone's settings.");
      return;
    }
    prefs.set(notifyPref, true);
  }

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    final on = ref.watch(prefsProvider.select((p) => p[notifyPref] == true));
    final status = _allowed == false && on
        ? "Blocked in this phone's settings."
        : on
        ? 'On for this phone.'
        : 'Off on this phone.';
    return _Section(
      title: 'Notifications',
      children: [
        Semantics(
          toggled: on,
          label: 'Due-date reminders on this phone',
          excludeSemantics: true,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => _set(!on),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Due-date reminders on this phone', style: context.text.bodyLarge),
                      Text(status, style: context.text.bodySmall),
                    ],
                  ),
                ),
                IgnorePointer(
                  child: Switch(value: on, onChanged: (_) {}, activeTrackColor: t.accent),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: Space.s2),
        Text(
          'One notification the day before a card is due: 24 hours ahead, or at 09:00 for a card '
          'with no time. Scheduled on this phone after every sync, so a date set on another device '
          'only notifies here once the phone has synced.',
          style: context.text.bodySmall,
        ),
        const SizedBox(height: Space.s3),
        Align(
          alignment: Alignment.centerLeft,
          child: KitButton(
            label: 'Send test',
            icon: LucideIcons.bell,
            small: true,
            onPressed: () async {
              final notifier = ref.read(dueNotifierProvider);
              if (!await notifier.allowed() && !await notifier.request()) {
                Toasts.show("Notifications are blocked in this phone's settings.");
                return;
              }
              await notifier.show(id: 1, title: 'Tack test notification', body: 'Notifications are working.');
            },
          ),
        ),
      ],
    );
  }
}

const _kindLabel = {TrashKind.board: 'Board', TrashKind.list: 'List', TrashKind.card: 'Card'};

String _describe(TrashRow row) {
  final kind = _kindLabel[row.kind]!;
  final what = row.kind == TrashKind.card ? kind : '$kind, ${cardCount(row.cardCount)}';
  return row.where.isEmpty ? what : '$what · from ${row.where}';
}

String _daysLeft(int days) => days == 0 ? 'Under a day left' : (days == 1 ? '1 day left' : '$days days left');

/// Every deleted board, list and card, newest first (SPEC §3.9).
class _Trash extends ConsumerWidget {
  const _Trash();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.kit;
    final lib = ref.watch(storeProvider);
    final now = ref.watch(nowProvider);
    final rows = selectTrash(lib.boards, lib.lists, lib.cards.values, now);
    final store = ref.read(storeProvider.notifier);
    return _Section(
      title: 'Trash',
      action: rows.isEmpty
          ? null
          : KitButton(
              label: 'Empty trash',
              small: true,
              variant: ButtonVariant.negative,
              onPressed: () async {
                final ok = await confirmSheet(
                  context,
                  title: 'Empty trash?',
                  message: "All ${rows.length} items will be gone for good. This can't be undone.",
                  confirmLabel: 'Empty trash',
                  danger: true,
                );
                if (!ok) return;
                for (final r in rows) {
                  store.purgeForever(r.kind, r.id);
                }
              },
            ),
      children: [
        if (rows.isEmpty) Text('Trash is empty.', style: context.text.bodyMedium!.copyWith(color: t.textMuted)),
        for (final (i, r) in rows.indexed) ...[
          if (i > 0) Divider(color: t.border, height: Space.s5),
          Text(r.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: context.text.titleSmall),
          const SizedBox(height: 2),
          Text(_describe(r), style: context.text.bodySmall),
          Text(_daysLeft(r.daysLeft), style: context.mono(12, color: context.tack.ink3)),
          const SizedBox(height: Space.s2),
          Row(
            children: [
              if (r.needsBoard)
                Text('Restore the board first', style: context.text.bodySmall!.copyWith(fontStyle: FontStyle.italic))
              else
                KitButton(
                  label: 'Restore',
                  icon: LucideIcons.rotateCcw,
                  small: true,
                  onPressed: () {
                    store.restoreFromTrash(r.kind, r.id);
                    Toasts.show('${_kindLabel[r.kind]} restored');
                  },
                ),
              const Spacer(),
              KitButton(
                label: 'Delete forever',
                small: true,
                variant: ButtonVariant.ghost,
                onPressed: () async {
                  final ok = await confirmSheet(
                    context,
                    title: 'Delete forever?',
                    message: '"${r.name}" will be gone for good. This can\'t be undone.',
                    confirmLabel: 'Delete forever',
                    danger: true,
                  );
                  if (ok) store.purgeForever(r.kind, r.id);
                },
              ),
            ],
          ),
        ],
      ],
    );
  }
}

class _Connection extends ConsumerWidget {
  const _Connection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.kit;
    final conn = ref.watch(connectionProvider);
    final s = ref.watch(syncProvider);
    final pending = ref.watch(storeProvider.select((l) => l.outbox.length));
    final (label, color) = switch (s.state) {
      SyncState.synced => ('Up to date', t.positive),
      SyncState.syncing => ('Syncing…', t.textMuted),
      SyncState.offline => ("Can't reach the server", t.warningText),
      SyncState.accessDenied => ('Access refused the token', t.negative),
      SyncState.outdated => ('This app needs updating', t.negative),
      SyncState.error => ('Sync problem', t.negative),
      SyncState.notConfigured => ('Not set up', t.textMuted),
    };
    Widget row(String k, String v, {Color? color, bool mono = false}) => Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 96,
            child: Text(k, style: context.text.bodyMedium!.copyWith(color: t.textMuted)),
          ),
          Expanded(
            child: Text(
              v,
              style: mono
                  ? context.mono(13, color: color ?? t.text)
                  : context.text.bodyMedium!.copyWith(color: color, fontWeight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );
    final last = s.lastSyncAt;
    return _Section(
      title: 'Connection',
      children: [
        row('Server', conn?.baseUrl ?? '—'),
        row('Status', label, color: color),
        if (last != null) row('Last sync', formatTimestamp(last.toUtc().toIso8601String()), mono: true),
        row(
          'Unsent',
          pending == 0 ? 'Nothing waiting' : '$pending ${pending == 1 ? 'change' : 'changes'} saved on this phone',
        ),
        if (s.message != null && s.state != SyncState.synced) ...[
          const SizedBox(height: Space.s1),
          Text(s.message!, style: context.text.bodySmall),
        ],
        const SizedBox(height: Space.s3),
        Wrap(
          spacing: Space.s2,
          runSpacing: Space.s2,
          children: [
            KitButton(
              label: 'Sync now',
              icon: LucideIcons.refreshCw,
              small: true,
              onPressed: () => ref.read(syncProvider.notifier).sync(),
            ),
            KitButton(label: 'Change connection', small: true, onPressed: () => openConnection(context)),
          ],
        ),
      ],
    );
  }
}

final _versionProvider = FutureProvider<String>((ref) async {
  try {
    final info = await PackageInfo.fromPlatform();
    return info.version;
  } catch (_) {
    return '';
  }
});

class _About extends ConsumerWidget {
  const _About();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final version = ref.watch(_versionProvider).value ?? '';
    return _Section(
      title: 'About',
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                version.isEmpty ? 'Tack for Android' : 'Tack for Android $version',
                style: context.text.bodyLarge,
              ),
            ),
            KitButton(
              label: 'Repository',
              icon: LucideIcons.externalLink,
              small: true,
              variant: ButtonVariant.ghost,
              onPressed: () => launchUrl(Uri.parse(repositoryUrl), mode: LaunchMode.externalApplication),
            ),
          ],
        ),
      ],
    );
  }
}
