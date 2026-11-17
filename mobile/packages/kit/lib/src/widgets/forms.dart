import 'package:material_ui/material_ui.dart';

import '../theme/tokens.dart';
import 'basics.dart';

enum Tone { neutral, positive, negative }

class SegOption<T> {
  const SegOption(this.value, this.label, {this.tone = Tone.neutral});
  final T value;
  final String label;
  final Tone tone;
}

/// A segmented control whose selection slides between options.
class KitSegmented<T> extends StatelessWidget {
  const KitSegmented({
    super.key,
    required this.value,
    required this.options,
    required this.onChanged,
    this.dense = false,
    this.expand = true,
  });

  final T value;
  final List<SegOption<T>> options;
  final ValueChanged<T>? onChanged;
  final bool dense;

  /// Fill the available width (true) or hug the labels (false).
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    final n = options.length;
    final index = options.indexWhere((o) => o.value == value);
    final selected = index >= 0 ? options[index] : null;
    final thumbColor = switch (selected?.tone) {
      Tone.positive => t.positiveSoft,
      Tone.negative => t.negativeSoft,
      _ => t.surface,
    };

    Widget body = Stack(
      children: [
        if (index >= 0)
          Positioned.fill(
            child: AnimatedAlign(
              alignment: Alignment(n == 1 ? 0 : -1 + 2 * index / (n - 1), 0),
              duration: Motion.base,
              curve: Motion.easeOut,
              child: FractionallySizedBox(
                widthFactor: 1 / n,
                heightFactor: 1,
                child: AnimatedContainer(
                  duration: Motion.base,
                  decoration: BoxDecoration(
                    color: thumbColor,
                    borderRadius: BorderRadius.circular(Radii.sm + 1),
                    boxShadow: [
                      BoxShadow(color: t.shadow, blurRadius: 3, offset: const Offset(0, 1)),
                    ],
                  ),
                ),
              ),
            ),
          ),
        Row(
          children: [
            for (final o in options)
              Expanded(
                child: Pressable(
                  scale: 1,
                  haptic: o.value != value,
                  onTap: onChanged == null
                      ? null
                      : () {
                          if (o.value != value) onChanged!(o.value);
                        },
                  child: _SegLabel(option: o, selected: o.value == value, dense: dense),
                ),
              ),
          ],
        ),
      ],
    );
    if (!expand) body = IntrinsicWidth(child: body);

    return Semantics(
      container: true,
      child: Container(
        height: dense ? 34 : 44,
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          color: t.surfaceSunken,
          borderRadius: BorderRadius.circular(Radii.md),
        ),
        child: body,
      ),
    );
  }
}

class _SegLabel extends StatelessWidget {
  const _SegLabel({required this.option, required this.selected, required this.dense});

  final SegOption<dynamic> option;
  final bool selected;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    final color = !selected
        ? t.textMuted
        : switch (option.tone) {
            Tone.positive => t.positive,
            Tone.negative => t.negative,
            Tone.neutral => t.text,
          };
    return Semantics(
      selected: selected,
      child: Container(
        alignment: Alignment.center,
        padding: EdgeInsets.symmetric(horizontal: dense ? Space.s3 : Space.s2),
        child: AnimatedDefaultTextStyle(
          duration: Motion.fast,
          style: context.text.labelLarge!.copyWith(color: color, fontSize: dense ? 13 : 14),
          child: Text(option.label, maxLines: 1, overflow: TextOverflow.ellipsis),
        ),
      ),
    );
  }
}

class ChipOption<T> {
  const ChipOption(this.value, this.label, {this.swatch});
  final T value;
  final String label;
  final Color? swatch;
}

/// Single-choice chips that wrap onto several lines.
class KitChips<T> extends StatelessWidget {
  const KitChips({super.key, required this.value, required this.options, required this.onChanged});

  final T? value;
  final List<ChipOption<T>> options;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    return Wrap(
      spacing: Space.s2,
      runSpacing: Space.s2,
      children: [
        for (final o in options)
          Pressable(
            onTap: () => onChanged(o.value),
            child: AnimatedContainer(
              duration: Motion.fast,
              height: 40,
              padding: const EdgeInsets.symmetric(horizontal: Space.s3),
              decoration: BoxDecoration(
                color: o.value == value ? t.accentSoft : t.surface,
                borderRadius: BorderRadius.circular(Radii.pill),
                border: Border.all(
                  color: o.value == value ? t.accent : t.borderStrong,
                  width: o.value == value ? 1.5 : 1,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (o.swatch != null) ...[
                    Container(
                      width: 10,
                      height: 10,
                      decoration: BoxDecoration(color: o.swatch, shape: BoxShape.circle),
                    ),
                    const SizedBox(width: Space.s2),
                  ],
                  Text(
                    o.label,
                    style: context.text.labelLarge!.copyWith(
                      color: o.value == value ? t.accentText : t.text,
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

/// A labelled form row with an optional hint and error line.
class KitField extends StatelessWidget {
  const KitField({super.key, required this.label, required this.child, this.error, this.hint});

  final String label;
  final Widget child;
  final String? error;
  final String? hint;

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: Text(label, style: context.text.labelMedium!.copyWith(fontSize: 13)),
        ),
        child,
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(error!, style: context.text.bodySmall!.copyWith(color: t.negative)),
          )
        else if (hint != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(hint!, style: context.text.bodySmall),
          ),
      ],
    );
  }
}

/// A form-level error box.
class FormError extends StatelessWidget {
  const FormError(this.message, {super.key});
  final String? message;

  @override
  Widget build(BuildContext context) {
    if (message == null) return const SizedBox.shrink();
    final t = context.kit;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(Space.s3),
      decoration: BoxDecoration(
        color: t.negativeSoft,
        borderRadius: BorderRadius.circular(Radii.md),
      ),
      child: Text(message!, style: context.text.bodyMedium!.copyWith(color: t.negative)),
    );
  }
}

/// A tappable row that looks like an input and opens a picker (dates, long option lists).
class PickerField extends StatelessWidget {
  const PickerField({super.key, required this.value, this.placeholder, this.icon, this.onTap});

  final String? value;
  final String? placeholder;
  final IconData? icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    return Pressable(
      scale: 0.99,
      onTap: onTap,
      child: Container(
        height: 48,
        padding: const EdgeInsets.symmetric(horizontal: Space.s3),
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: BorderRadius.circular(Radii.md),
          border: Border.all(color: t.borderStrong),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                value ?? placeholder ?? '',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: context.text.bodyLarge!.copyWith(color: value == null ? t.textFaint : t.text),
              ),
            ),
            if (icon != null) Icon(icon, size: 18, color: t.textMuted),
          ],
        ),
      ),
    );
  }
}
