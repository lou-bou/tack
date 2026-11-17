import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import '../theme/tokens.dart';

/// A tap target that dips slightly while pressed and ticks on tap, like a native control.
class Pressable extends StatefulWidget {
  const Pressable({
    super.key,
    required this.child,
    this.onTap,
    this.onLongPress,
    this.scale = 0.97,
    this.haptic = true,
    this.semanticLabel,
  });

  final Widget child;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final double scale;
  final bool haptic;
  final String? semanticLabel;

  @override
  State<Pressable> createState() => _PressableState();
}

class _PressableState extends State<Pressable> {
  bool _down = false;

  void _set(bool v) {
    if (_down != v && mounted) setState(() => _down = v);
  }

  @override
  Widget build(BuildContext context) {
    final enabled = widget.onTap != null || widget.onLongPress != null;
    return Semantics(
      button: true,
      enabled: enabled,
      label: widget.semanticLabel,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: enabled ? (_) => _set(true) : null,
        onTapUp: enabled ? (_) => _set(false) : null,
        onTapCancel: enabled ? () => _set(false) : null,
        onTap: widget.onTap == null
            ? null
            : () {
                if (widget.haptic) HapticFeedback.selectionClick();
                widget.onTap!();
              },
        onLongPress: widget.onLongPress,
        child: AnimatedScale(
          scale: _down ? widget.scale : 1,
          duration: Motion.fast,
          curve: Motion.easeOut,
          child: AnimatedOpacity(
            opacity: enabled ? (_down ? 0.85 : 1) : 0.45,
            duration: Motion.fast,
            child: widget.child,
          ),
        ),
      ),
    );
  }
}

enum ButtonVariant { primary, secondary, ghost, positive, negative, danger }

class KitButton extends StatelessWidget {
  const KitButton({
    super.key,
    required this.label,
    this.onPressed,
    this.icon,
    this.variant = ButtonVariant.secondary,
    this.small = false,
    this.block = false,
    this.busy = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final ButtonVariant variant;
  final bool small;
  final bool block;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    final (Color bg, Color fg, Color? line) = switch (variant) {
      ButtonVariant.primary => (t.accent, t.onAccent, null),
      ButtonVariant.secondary => (t.surface, t.text, t.borderStrong),
      ButtonVariant.ghost => (Colors.transparent, t.textMuted, null),
      ButtonVariant.positive => (t.positiveSoft, t.positive, null),
      ButtonVariant.negative => (t.negativeSoft, t.negative, null),
      ButtonVariant.danger => (t.negative, Colors.white, null),
    };
    final style = context.text.labelLarge!.copyWith(color: fg, fontSize: small ? 13 : 15);
    final content = Row(
      mainAxisSize: block ? MainAxisSize.max : MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (busy)
          SizedBox(
            width: 16,
            height: 16,
            child: CircularProgressIndicator(strokeWidth: 2, color: fg),
          )
        else if (icon != null)
          Icon(icon, size: small ? 16 : 18, color: fg),
        if (busy || icon != null) const SizedBox(width: Space.s2),
        Flexible(child: Text(label, style: style, maxLines: 1, overflow: TextOverflow.ellipsis)),
      ],
    );
    return Pressable(
      onTap: busy ? null : onPressed,
      child: Container(
        height: small ? 36 : 48,
        padding: EdgeInsets.symmetric(horizontal: small ? Space.s3 : Space.s4),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(Radii.md),
          border: line == null ? null : Border.all(color: line),
        ),
        child: content,
      ),
    );
  }
}

class KitCard extends StatelessWidget {
  const KitCard({super.key, required this.child, this.padding = const EdgeInsets.all(Space.s4)});

  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    return Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(Radii.lg),
        border: Border.all(color: t.border),
      ),
      // List tiles and ink inside a card paint on this, not behind the card's fill.
      child: Material(type: MaterialType.transparency, child: child),
    );
  }
}

class CardHeader extends StatelessWidget {
  const CardHeader({super.key, required this.title, this.action});

  final String title;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: Space.s3),
      child: Row(
        children: [
          Expanded(child: Text(title, style: context.text.titleMedium)),
          ?action,
        ],
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, this.body});

  final IconData icon;
  final String title;
  final String? body;

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Space.s6, horizontal: Space.s4),
      child: Column(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(color: t.surfaceSunken, shape: BoxShape.circle),
            child: Icon(icon, color: t.textMuted, size: 22),
          ),
          const SizedBox(height: Space.s3),
          Text(title, style: context.text.titleMedium, textAlign: TextAlign.center),
          if (body != null) ...[
            const SizedBox(height: Space.s1),
            Text(
              body!,
              style: context.text.bodyMedium!.copyWith(color: t.textMuted),
              textAlign: TextAlign.center,
            ),
          ],
        ],
      ),
    );
  }
}

/// A small rounded status label, optionally tappable.
class StatusPill extends StatelessWidget {
  const StatusPill({
    super.key,
    required this.label,
    this.icon,
    this.onTap,
    this.warning = true,
  });

  final String label;
  final IconData? icon;
  final VoidCallback? onTap;
  final bool warning;

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    final fg = warning ? t.warningText : t.textMuted;
    final pill = Container(
      height: 28,
      padding: const EdgeInsets.symmetric(horizontal: Space.s2 + 2),
      decoration: BoxDecoration(
        color: warning ? t.warningSoft : t.surfaceSunken,
        borderRadius: BorderRadius.circular(Radii.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 14, color: fg), const SizedBox(width: 5)],
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: context.text.labelMedium!.copyWith(color: fg, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
    return onTap == null ? pill : Pressable(onTap: onTap, child: pill);
  }
}

/// A coloured badge such as "Reached".
class Badge2 extends StatelessWidget {
  const Badge2({super.key, required this.label, this.done = false});

  final String label;
  final bool done;

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Space.s2, vertical: 3),
      decoration: BoxDecoration(
        color: done ? t.positiveSoft : t.surfaceSunken,
        borderRadius: BorderRadius.circular(Radii.pill),
      ),
      child: Text(
        label,
        style: context.text.labelSmall!.copyWith(
          color: done ? t.positive : t.textMuted,
          letterSpacing: 0,
        ),
      ),
    );
  }
}
