import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:material_ui/material_ui.dart';

import '../data/dates.dart';
import '../data/store.dart';
import 'card_page.dart';
import 'state.dart';
import 'theme.dart';
import 'widgets/common.dart';

/// The bell, with its unread dot and the list it opens: the "due tomorrow" notifications of the
/// last 30 days, newest first. Opening the list marks them read (SPEC §3.8).
class BellButton extends ConsumerWidget {
  const BellButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notices = ref.watch(noticesProvider);
    final unread = [
      for (final n in notices)
        if (n.readAt == null) n.id,
    ];
    final t = context.kit;
    return Stack(
      alignment: Alignment.center,
      children: [
        IconBtn(
          icon: LucideIcons.bell,
          label: unread.isEmpty ? 'Notifications' : 'Notifications, ${unread.length} unread',
          onTap: () {
            // What was unread when the list opened stays marked, though it's now saved as read.
            final fresh = unread.toSet();
            ref.read(storeProvider.notifier).markNoticesRead(unread);
            showKitSheet<void>(
              context,
              builder: (context) => _NoticeList(notices: notices, fresh: fresh),
            );
          },
        ),
        if (unread.isNotEmpty)
          Positioned(
            top: 11,
            right: 11,
            child: IgnorePointer(
              child: Container(
                width: 9,
                height: 9,
                decoration: BoxDecoration(
                  color: t.accent,
                  shape: BoxShape.circle,
                  border: Border.all(color: t.bg, width: 1.5),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _NoticeList extends StatelessWidget {
  const _NoticeList({required this.notices, required this.fresh});
  final List<Notice> notices;
  final Set<String> fresh;

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    return KitSheet(
      title: 'Notifications',
      child: notices.isEmpty
          ? Text(
              'Nothing yet. Cards due tomorrow will show up here.',
              style: context.text.bodyLarge!.copyWith(color: t.textMuted),
            )
          : Column(
              children: [
                for (final n in notices)
                  Pressable(
                    scale: 0.99,
                    onTap: () {
                      Navigator.of(context).pop();
                      openCard(context, n.cardId);
                    },
                    child: Container(
                      width: double.infinity,
                      margin: const EdgeInsets.only(bottom: Space.s2),
                      padding: const EdgeInsets.all(Space.s3),
                      decoration: BoxDecoration(
                        color: fresh.contains(n.id) ? t.accentSoft : context.tack.card,
                        borderRadius: BorderRadius.circular(TackRadii.card),
                        border: Border.all(color: t.border),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(n.title, style: context.text.titleSmall, maxLines: 2, overflow: TextOverflow.ellipsis),
                          const SizedBox(height: 2),
                          Text(n.body, style: context.text.bodyMedium!.copyWith(color: t.textMuted)),
                          const SizedBox(height: 4),
                          Text(formatTimestamp(n.createdAt), style: context.mono(12, color: context.tack.ink3)),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
    );
  }
}
