import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:material_ui/material_ui.dart';

import '../../data/dates.dart';
import '../../data/selection.dart';
import '../../data/store.dart';
import '../state.dart';
import '../theme.dart';

const priorityIcons = <String, IconData>{
  'urgent': LucideIcons.chevronsUp,
  'high': LucideIcons.chevronUp,
  'medium': LucideIcons.equal,
  'low': LucideIcons.chevronDown,
};

const priorityLabels = <String, String>{
  'none': 'None',
  'low': 'Low',
  'medium': 'Medium',
  'high': 'High',
  'urgent': 'Urgent',
};

/// Always an icon plus colour, never colour alone (DESIGN.md "Priority").
class PriorityIcon extends StatelessWidget {
  const PriorityIcon(this.priority, {super.key, this.size = 14});
  final String priority;
  final double size;

  @override
  Widget build(BuildContext context) {
    final icon = priorityIcons[priority];
    if (icon == null) return const SizedBox.shrink();
    return Semantics(
      label: '${priorityLabels[priority]} priority',
      child: Icon(icon, size: size, color: context.tack.priority[priority]),
    );
  }
}

/// The colours and icon of a due state: an icon or word always goes with the colour.
({Color fg, Color? bg, IconData? icon}) dueStyle(BuildContext context, DueState state) {
  final t = context.kit;
  return switch (state) {
    DueState.overdue => (fg: t.negative, bg: t.negativeSoft, icon: LucideIcons.flag),
    DueState.dueSoon => (fg: t.warningText, bg: t.warningSoft, icon: LucideIcons.clock),
    DueState.completed => (fg: context.tack.ink3, bg: null, icon: LucideIcons.check),
    _ => (fg: t.textMuted, bg: null, icon: null),
  };
}

/// The date chip: `start → due` or just `due`, in Geist Mono, with its state (SPEC §3.4).
class DateChip extends StatelessWidget {
  const DateChip({super.key, required this.card, required this.now, this.size = 12});
  final TaskCard card;
  final int now;
  final double size;

  @override
  Widget build(BuildContext context) {
    final text = formatChip(card.start, card.due);
    if (text.isEmpty) return const SizedBox.shrink();
    final state = dueState(due: card.due, completed: card.completed, now: now);
    final s = dueStyle(context, state);
    return Container(
      padding: EdgeInsets.symmetric(horizontal: s.bg != null ? 6 : 0, vertical: 1),
      decoration: BoxDecoration(color: s.bg, borderRadius: BorderRadius.circular(Radii.pill)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (s.icon != null) ...[
            Icon(s.icon, size: size + 1, color: state == DueState.completed ? context.kit.positive : s.fg),
            const SizedBox(width: 4),
          ],
          Flexible(
            child: Text(
              text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: context.mono(size, color: s.fg),
            ),
          ),
          if (state == DueState.overdue) ...[
            const SizedBox(width: 6),
            Text(
              'Overdue',
              style: context.text.labelMedium!.copyWith(fontSize: size, color: s.fg, fontWeight: FontWeight.w600),
            ),
          ],
        ],
      ),
    );
  }
}

/// The round 18px checkbox, in a tap target as tall as its row. Ticking pops (1 → 1.15 → 1).
class TackCheckbox extends StatefulWidget {
  const TackCheckbox({
    super.key,
    required this.checked,
    required this.label,
    this.onTap,
    this.square = false,
    this.enabled = true,
  });
  final bool checked;
  final String label;
  final VoidCallback? onTap;

  /// Select mode uses a square box, so picking never looks like completing.
  final bool square;
  final bool enabled;

  @override
  State<TackCheckbox> createState() => _TackCheckboxState();
}

class _TackCheckboxState extends State<TackCheckbox> with SingleTickerProviderStateMixin {
  late final _pop = AnimationController(vsync: this, duration: const Duration(milliseconds: 200));

  @override
  void didUpdateWidget(TackCheckbox old) {
    super.didUpdateWidget(old);
    if (widget.checked && !old.checked && !MediaQuery.disableAnimationsOf(context)) _pop.forward(from: 0);
  }

  @override
  void dispose() {
    _pop.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    return Semantics(
      checked: widget.checked,
      label: widget.label,
      enabled: widget.enabled,
      button: true,
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: widget.enabled ? widget.onTap : null,
        child: Padding(
          // Wider than the box: the tap target, not the look.
          padding: const EdgeInsets.fromLTRB(2, 1, 10, 1),
          child: AnimatedBuilder(
            animation: _pop,
            builder: (context, child) {
              final v = _pop.isAnimating ? _pop.value : 0.0;
              return Transform.scale(scale: 1 + 0.15 * (v < 0.5 ? v * 2 : (1 - v) * 2), child: child);
            },
            child: AnimatedContainer(
              duration: MediaQuery.disableAnimationsOf(context) ? Duration.zero : Motion.fast,
              width: 18,
              height: 18,
              decoration: BoxDecoration(
                color: widget.checked ? t.accent : null,
                border: Border.all(color: widget.checked ? t.accent : context.tack.ink3, width: 1.5),
                borderRadius: BorderRadius.circular(widget.square ? 5 : 9),
              ),
              child: widget.checked ? Icon(LucideIcons.check, size: 13, color: t.onAccent) : null,
            ),
          ),
        ),
      ),
    );
  }
}

/// A title that strikes through from left to right when the card is ticked.
class _StruckTitle extends StatefulWidget {
  const _StruckTitle({required this.text, required this.style, required this.struck, required this.doneColor});
  final String text;
  final TextStyle style;
  final bool struck;
  final Color doneColor;

  @override
  State<_StruckTitle> createState() => _StruckTitleState();
}

class _StruckTitleState extends State<_StruckTitle> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 240),
    value: widget.struck ? 1 : 0,
  );

  @override
  void didUpdateWidget(_StruckTitle old) {
    super.didUpdateWidget(old);
    if (widget.struck == old.struck) return;
    if (MediaQuery.disableAnimationsOf(context)) {
      _c.value = widget.struck ? 1 : 0;
    } else if (widget.struck) {
      _c.forward(from: 0);
    } else {
      _c.value = 0;
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final done = widget.style.copyWith(
      color: widget.doneColor,
      decoration: TextDecoration.lineThrough,
      decorationColor: widget.doneColor,
    );
    Text line(TextStyle s) => Text(widget.text, maxLines: 2, overflow: TextOverflow.ellipsis, style: s);
    return AnimatedBuilder(
      animation: _c,
      builder: (context, _) {
        if (_c.value == 0) return line(widget.style);
        if (_c.value == 1) return line(done);
        // The struck text is revealed over the plain text, left to right.
        return Stack(
          children: [
            line(widget.style),
            ClipRect(clipper: _Sweep(Curves.easeOut.transform(_c.value)), child: line(done)),
          ],
        );
      },
    );
  }
}

class _Sweep extends CustomClipper<Rect> {
  _Sweep(this.t);
  final double t;
  @override
  Rect getClip(Size size) => Rect.fromLTWH(0, 0, size.width * t, size.height);
  @override
  bool shouldReclip(_Sweep old) => old.t != t;
}

/// A card as it shows in a list, on Today and under a calendar day (SPEC §3.4): checkbox, title
/// (two lines at most), then a meta row that only shows what is set. The whole card opens it,
/// except the checkbox.
class CardFace extends ConsumerWidget {
  const CardFace({
    super.key,
    required this.card,
    required this.now,
    required this.onToggle,
    required this.onOpen,
    this.showCompleted = true,
    this.listName,
    this.selection,
    this.lifted = false,
  });

  final TaskCard card;
  final int now;
  final bool showCompleted;
  final void Function(TaskCard card, bool willHide) onToggle;
  final void Function(TaskCard card) onOpen;

  /// Shown where the card is away from its board, like on Today.
  final String? listName;

  /// Set while the screen is in Select mode.
  final CardSelection? selection;

  /// Drawn under the finger while dragging: floating colours and shadow.
  final bool lifted;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.kit;
    final colors = context.tack;
    final d = ref.watch(densityProvider);
    final unsent = ref.watch(unsentProvider.select((s) => s.contains(card.id)));
    final sel = selection;
    final selecting = sel != null;
    final selectable = sel == null || (sel.canSelect?.call(card) ?? true);
    final picked = sel != null && sel.selected.contains(card.id);

    final titleStyle = context.text.bodyMedium!.copyWith(fontSize: d.title, height: 1.3, fontWeight: FontWeight.w500);
    final meta = <Widget>[
      if (isPlanned(card, now))
        Semantics(
          label: 'Planned for today',
          child: Icon(LucideIcons.sun, size: d.metaIcon, color: t.textMuted),
        ),
      if (card.priority != 'none') PriorityIcon(card.priority, size: d.metaIcon),
      if (card.due != null || card.start != null) DateChip(card: card, now: now, size: d.meta),
      if (card.description.isNotEmpty)
        Semantics(
          label: 'Has description',
          child: Icon(LucideIcons.fileText, size: d.metaIcon, color: colors.ink3),
        ),
      if (listName != null && listName!.isNotEmpty)
        Text(
          listName!,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: context.text.bodySmall!.copyWith(fontSize: d.meta, color: colors.ink3),
        ),
      if (unsent)
        Semantics(
          label: 'Saved on this device',
          child: Icon(LucideIcons.cloudUpload, size: d.metaIcon, color: colors.ink3),
        ),
    ];

    final body = Container(
      decoration: BoxDecoration(
        color: picked ? t.accentSoft : (lifted ? colors.floating : colors.card),
        borderRadius: BorderRadius.circular(TackRadii.card),
        border: Border.all(
          color: picked ? t.accent : (lifted && colors.floatingBorder.a > 0 ? colors.floatingBorder : t.border),
        ),
      ),
      padding: d.padding,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (selecting)
            TackCheckbox(
              checked: picked,
              square: true,
              enabled: selectable,
              label: 'Select ${card.title}',
              onTap: () => sel.toggle(card.id),
            )
          else
            TackCheckbox(
              checked: card.completed,
              label: 'Complete ${card.title}',
              onTap: () => onToggle(card, !showCompleted),
            ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _StruckTitle(
                  text: card.title,
                  style: titleStyle,
                  struck: card.completed && !selecting,
                  doneColor: colors.ink3,
                ),
                if (meta.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: Wrap(
                      spacing: Space.s2,
                      runSpacing: 2,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: meta,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );

    return Opacity(
      opacity: selecting && !selectable ? 0.5 : 1,
      child: Semantics(
        button: true,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: selecting ? (selectable ? () => sel.toggle(card.id) : null) : () => onOpen(card),
          child: body,
        ),
      ),
    );
  }
}

/// A card's place in a list, with the collapse used when a ticked card leaves (250ms). On a
/// board the collapse waits for the tick's own animation first.
class CardSlot extends StatelessWidget {
  const CardSlot({super.key, required this.child, this.leaving = false, this.gap = 0, this.afterTick = false});
  final Widget child;
  final bool leaving;

  /// The space under the card, which collapses with it.
  final double gap;

  /// Let the checkbox pop and the title strike through (200ms) before collapsing.
  final bool afterTick;

  @override
  Widget build(BuildContext context) {
    final still = MediaQuery.disableAnimationsOf(context);
    return AnimatedSize(
      duration: still ? Duration.zero : Duration(milliseconds: afterTick ? 450 : 250),
      curve: afterTick ? const Interval(0.44, 1, curve: Motion.easeOut) : Motion.easeOut,
      alignment: Alignment.topCenter,
      child: leaving
          ? const SizedBox(width: double.infinity)
          : Padding(
              padding: EdgeInsets.only(bottom: gap),
              child: child,
            ),
    );
  }
}
