import 'package:material_ui/material_ui.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../theme/tokens.dart';
import 'basics.dart';

/// Opens a native-feeling bottom sheet. Build its content with [KitSheet].
Future<T?> showKitSheet<T>(BuildContext context, {required WidgetBuilder builder}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: false,
    builder: builder,
  );
}

/// Sheet layout: grab handle, title, scrolling body that stays above the keyboard, pinned footer.
class KitSheet extends StatelessWidget {
  const KitSheet({super.key, required this.title, required this.child, this.footer});

  final String title;
  final Widget child;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    final mq = MediaQuery.of(context);
    return AnimatedPadding(
      duration: const Duration(milliseconds: 100),
      padding: EdgeInsets.only(bottom: mq.viewInsets.bottom),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: mq.size.height * 0.92),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                margin: const EdgeInsets.only(top: Space.s2),
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: t.borderStrong,
                  borderRadius: BorderRadius.circular(Radii.pill),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(Space.s5, Space.s2, Space.s2, Space.s1),
              child: Row(
                children: [
                  Expanded(child: Text(title, style: context.text.titleLarge)),
                  Pressable(
                    semanticLabel: 'Close',
                    onTap: () => Navigator.of(context).maybePop(),
                    child: Padding(
                      padding: const EdgeInsets.all(Space.s3),
                      child: Icon(LucideIcons.x, color: t.textMuted, size: 20),
                    ),
                  ),
                ],
              ),
            ),
            Flexible(
              child: SingleChildScrollView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.fromLTRB(Space.s5, Space.s2, Space.s5, Space.s5),
                child: child,
              ),
            ),
            if (footer != null)
              Container(
                decoration: BoxDecoration(border: Border(top: BorderSide(color: t.border))),
                padding: EdgeInsets.fromLTRB(
                  Space.s5,
                  Space.s3,
                  Space.s5,
                  Space.s3 + (mq.viewInsets.bottom > 0 ? 0 : mq.viewPadding.bottom),
                ),
                child: footer,
              )
            else
              SizedBox(height: mq.viewInsets.bottom > 0 ? 0 : mq.viewPadding.bottom),
          ],
        ),
      ),
    );
  }
}

/// A yes/no question as a small sheet. Returns true when confirmed.
Future<bool> confirmSheet(
  BuildContext context, {
  required String title,
  String? message,
  required String confirmLabel,
  bool danger = false,
}) async {
  final ok = await showKitSheet<bool>(
    context,
    builder: (context) => KitSheet(
      title: title,
      footer: Row(
        children: [
          Expanded(
            child: KitButton(
              label: 'Cancel',
              block: true,
              onPressed: () => Navigator.of(context).pop(false),
            ),
          ),
          const SizedBox(width: Space.s3),
          Expanded(
            child: KitButton(
              label: confirmLabel,
              block: true,
              variant: danger ? ButtonVariant.danger : ButtonVariant.primary,
              onPressed: () => Navigator.of(context).pop(true),
            ),
          ),
        ],
      ),
      child: message == null
          ? const SizedBox.shrink()
          : Text(
              message,
              style: context.text.bodyLarge!.copyWith(color: context.kit.textMuted),
            ),
    ),
  );
  return ok ?? false;
}
