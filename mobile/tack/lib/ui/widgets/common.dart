import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:material_ui/material_ui.dart';

import '../../data/sync.dart';
import '../theme.dart';
import 'logo.dart';

/// 44px tap targets on a phone (DESIGN.md).
const double controlHeight = 44;

/// The top bar's logo, where the splash lands.
final logoKey = GlobalKey(debugLabel: 'logo');

/// An icon with a 44px tap target and a label for screen readers.
class IconBtn extends StatelessWidget {
  const IconBtn({
    super.key,
    required this.icon,
    required this.label,
    this.onTap,
    this.active = false,
    this.color,
    this.size = 20,
  });
  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  /// A pressed toggle: tinted, with the icon in the accent colour.
  final bool active;
  final Color? color;
  final double size;

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    return Tooltip(
      message: label,
      child: Pressable(
        semanticLabel: label,
        onTap: onTap,
        scale: 0.92,
        child: Container(
          width: controlHeight,
          height: controlHeight,
          alignment: Alignment.center,
          child: Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: active ? t.accentSoft : null,
              borderRadius: BorderRadius.circular(TackRadii.control),
            ),
            child: Icon(icon, size: size, color: color ?? (active ? t.accent : t.textMuted)),
          ),
        ),
      ),
    );
  }
}

/// Says why changes aren't reaching the server, and offers the fix when there is one.
class ConnectionPill extends ConsumerWidget {
  const ConnectionPill({super.key, this.onFix});

  /// Opens the connection settings (Access refused, or no server set).
  final VoidCallback? onFix;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(syncProvider);
    final (IconData icon, String label, bool tap) = switch (s.state) {
      SyncState.offline => (LucideIcons.cloudOff, 'Offline · changes will sync', false),
      SyncState.accessDenied => (LucideIcons.logIn, 'Access refused · Check the token', true),
      SyncState.outdated => (LucideIcons.refreshCw, 'Update needed · Install the new version', false),
      SyncState.error => (LucideIcons.cloudOff, 'Sync problem · Tap for details', true),
      SyncState.notConfigured => (LucideIcons.logIn, 'No server set', true),
      _ => (LucideIcons.cloudOff, '', false),
    };
    if (label.isEmpty) return const SizedBox.shrink();
    final t = context.kit;
    final pill = Semantics(
      liveRegion: true,
      child: Container(
        height: 28,
        padding: const EdgeInsets.symmetric(horizontal: Space.s3),
        decoration: BoxDecoration(color: context.tack.list, borderRadius: BorderRadius.circular(Radii.pill)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: t.textMuted),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: context.text.labelMedium!.copyWith(color: t.textMuted),
              ),
            ),
          ],
        ),
      ),
    );
    return Padding(
      padding: const EdgeInsets.fromLTRB(Space.s4, 0, Space.s4, Space.s2),
      child: Align(
        alignment: Alignment.centerLeft,
        child: !tap
            ? pill
            : Pressable(
                onTap: () {
                  if (s.state == SyncState.error) {
                    Toasts.show(s.message ?? 'Sync failed.');
                  } else {
                    onFix?.call();
                  }
                },
                child: pill,
              ),
      ),
    );
  }
}

/// A screen's header: the logo (or a back arrow), the title, then the screen's own actions, with
/// the connection pill on its own line when there is something to say (DESIGN.md "Layout").
class TopBar extends StatelessWidget {
  const TopBar({
    super.key,
    required this.title,
    this.actions = const [],
    this.onBack,
    this.small = false,
    this.onFix,
    this.splashTarget = false,
  });
  final String title;
  final List<Widget> actions;

  /// Inside a board the logo gives way to a back arrow.
  final VoidCallback? onBack;

  /// A board's name is smaller than a screen title (20px against 24px).
  final bool small;
  final VoidCallback? onFix;

  /// The logo the splash lands on (the Boards screen's; one at a time).
  final bool splashTarget;

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top;
    return Padding(
      padding: EdgeInsets.only(top: top),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            height: 56,
            child: Row(
              children: [
                if (onBack != null)
                  Padding(
                    padding: const EdgeInsets.only(left: Space.s1),
                    child: IconBtn(
                      icon: LucideIcons.arrowLeft,
                      label: 'All boards',
                      onTap: onBack,
                      color: context.kit.text,
                    ),
                  )
                else
                  Padding(
                    padding: const EdgeInsets.only(left: Space.s4, right: Space.s2),
                    child: LogoMark(key: splashTarget ? logoKey : null),
                  ),
                Expanded(
                  child: Semantics(
                    header: true,
                    child: Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: context.text.headlineMedium!.copyWith(fontSize: small ? 20 : 24, letterSpacing: -0.4),
                    ),
                  ),
                ),
                ...actions,
                const SizedBox(width: Space.s1),
              ],
            ),
          ),
          ConnectionPill(onFix: onFix),
        ],
      ),
    );
  }
}

class MenuItem {
  const MenuItem(this.label, this.icon, this.onSelect, {this.danger = false});
  final String label;
  final IconData icon;
  final VoidCallback onSelect;
  final bool danger;
}

/// A short list of actions, as a bottom sheet.
Future<void> showMenuSheet(BuildContext context, {required String title, required List<MenuItem> items}) async {
  final picked = await showKitSheet<MenuItem>(
    context,
    builder: (context) => KitSheet(
      title: title,
      child: Column(
        children: [
          for (final item in items)
            Pressable(
              scale: 0.99,
              onTap: () => Navigator.of(context).pop(item),
              child: SizedBox(
                height: 48,
                child: Row(
                  children: [
                    Icon(item.icon, size: 20, color: item.danger ? context.kit.negative : context.kit.textMuted),
                    const SizedBox(width: Space.s3),
                    Text(
                      item.label,
                      style: context.text.bodyLarge!.copyWith(color: item.danger ? context.kit.negative : null),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    ),
  );
  picked?.onSelect();
}

/// The small heading above a group of controls.
class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: Space.s2),
    child: Text(text, style: context.text.labelMedium!.copyWith(fontSize: 13)),
  );
}

/// One short line and at most one action, no illustrations (DESIGN.md).
class EmptyLine extends StatelessWidget {
  const EmptyLine(this.message, {super.key, this.action});
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: Space.s10, horizontal: Space.s5),
    child: Column(
      children: [
        Text(
          message,
          textAlign: TextAlign.center,
          style: context.text.bodyLarge!.copyWith(color: context.kit.textMuted),
        ),
        if (action != null) ...[const SizedBox(height: Space.s4), action!],
      ],
    ),
  );
}

/// The bar along the bottom while picking cards: how many, what to do with them, and Cancel.
class SelectionBar extends StatelessWidget {
  const SelectionBar({super.key, required this.count, required this.onCancel, required this.actions});
  final int count;
  final VoidCallback onCancel;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final colors = context.tack;
    return Container(
      margin: const EdgeInsets.fromLTRB(Space.s3, 0, Space.s3, Space.s3),
      padding: const EdgeInsets.all(Space.s3),
      decoration: BoxDecoration(
        color: colors.floating,
        borderRadius: BorderRadius.circular(TackRadii.list),
        border: Border.all(color: colors.floatingBorder),
        boxShadow: [BoxShadow(color: colors.floatingShadow, blurRadius: 24, offset: const Offset(0, 8))],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            liveRegion: true,
            child: Text(count == 0 ? 'Tap cards to select them' : '$count selected', style: context.text.titleSmall),
          ),
          const SizedBox(height: Space.s2),
          Wrap(
            spacing: Space.s2,
            runSpacing: Space.s2,
            alignment: WrapAlignment.end,
            children: [
              ...actions,
              KitButton(label: 'Cancel', small: true, onPressed: onCancel),
            ],
          ),
        ],
      ),
    );
  }
}

/// A pill that can be on or off, for the calendar's board filter.
class FilterPill extends StatelessWidget {
  const FilterPill({super.key, required this.label, required this.on, required this.onTap});
  final String label;
  final bool on;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    return Semantics(
      selected: on,
      child: Pressable(
        onTap: onTap,
        child: AnimatedContainer(
          duration: Motion.fast,
          height: 36,
          padding: const EdgeInsets.symmetric(horizontal: Space.s3),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: on ? t.accentSoft : t.surface,
            borderRadius: BorderRadius.circular(Radii.pill),
            border: Border.all(color: on ? t.accent : t.border),
          ),
          child: Text(
            label,
            style: context.text.labelLarge!.copyWith(fontSize: 13, fontWeight: on ? FontWeight.w600 : FontWeight.w500),
          ),
        ),
      ),
    );
  }
}

/// What floats above the page: a lifted card, the selection bar.
BoxDecoration floatingDecoration(BuildContext context, {double radius = TackRadii.card}) {
  final colors = context.tack;
  return BoxDecoration(
    borderRadius: BorderRadius.circular(radius),
    boxShadow: [BoxShadow(color: colors.floatingShadow, blurRadius: 24, offset: const Offset(0, 8))],
  );
}
