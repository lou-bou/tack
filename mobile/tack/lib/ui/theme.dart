import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';
import 'package:material_ui/material_ui.dart';

import '../data/store.dart';

/// Geist for everything, Geist Mono for dates, times and counts (DESIGN.md).
const tackSans = 'Geist';
const tackMono = 'GeistMono';

/// Tack's sizes that differ from kit's (DESIGN.md "Shape and depth").
abstract final class TackRadii {
  static const double card = 10, list = 14, control = 10, sheet = 16;
}

/// Tack's own colour roles on top of kit's tokens: the card and list surfaces, priority and
/// board colours, floating layers and the logo. Every colour in the app comes from here or from
/// [KitTokens]; values are DESIGN.md's (web/src/themes/tokens.css).
@immutable
class TackColors extends ThemeExtension<TackColors> {
  const TackColors({
    required this.card,
    required this.list,
    required this.ink3,
    required this.floating,
    required this.floatingBorder,
    required this.floatingShadow,
    required this.priority,
    required this.boards,
    required this.logoCard,
    required this.logoLineDone,
  });

  /// A card's face.
  final Color card;

  /// List columns, panels and other quiet surfaces.
  final Color list;

  /// Muted and completed text, on [card] only.
  final Color ink3;

  /// Menus, sheets, toasts and a lifted card.
  final Color floating;
  final Color floatingBorder;
  final Color floatingShadow;
  final Map<String, Color> priority;
  final Map<String, Color> boards;
  final Color logoCard;
  final Color logoLineDone;

  /// The logo's fixed colours.
  static const logoTack = Color(0xFF5B8CFF);
  static const logoShine = Color(0xFFB9CCFF);
  static const logoLine = Color(0xFFEDEBE6);

  Color board(String name) => boards[name] ?? boards['neutral']!;

  static const light = TackColors(
    card: Color(0xFFFFFFFF),
    list: Color(0xFFEBEDF2),
    ink3: Color(0xFF717687),
    floating: Color(0xFFFFFFFF),
    floatingBorder: Color(0x00000000),
    floatingShadow: Color(0x291F2233),
    priority: {
      'urgent': Color(0xFFC33439),
      'high': Color(0xFFB8541A),
      'medium': Color(0xFF955F00),
      'low': Color(0xFF557290),
    },
    boards: {
      'neutral': Color(0xFFF4F5F8),
      'slate': Color(0xFFE6EAF0),
      'blue': Color(0xFFE3EBFC),
      'teal': Color(0xFFDDF1EE),
      'green': Color(0xFFE2F1E2),
      'olive': Color(0xFFECEEDC),
      'amber': Color(0xFFF8EED8),
      'coral': Color(0xFFFBE4DC),
      'rose': Color(0xFFF8E1E8),
      'violet': Color(0xFFECE4FA),
    },
    logoCard: Color(0xFF1F2233),
    logoLineDone: Color(0xFF5B5F73),
  );

  static const dark = TackColors(
    card: Color(0xFF242733),
    list: Color(0xFF1B1D26),
    ink3: Color(0xFF898D9F),
    floating: Color(0xFF2B2F3D),
    floatingBorder: Color(0xFF3A3F50),
    floatingShadow: Color(0x3D000000),
    priority: {
      'urgent': Color(0xFFFF6B6E),
      'high': Color(0xFFFF9452),
      'medium': Color(0xFFF2B13C),
      'low': Color(0xFF8FAAC4),
    },
    boards: {
      'neutral': Color(0xFF13141A),
      'slate': Color(0xFF171B24),
      'blue': Color(0xFF141B2E),
      'teal': Color(0xFF11201F),
      'green': Color(0xFF142016),
      'olive': Color(0xFF1C1F13),
      'amber': Color(0xFF241D10),
      'coral': Color(0xFF261612),
      'rose': Color(0xFF24141A),
      'violet': Color(0xFF1C1628),
    },
    logoCard: Color(0xFF2E3350),
    logoLineDone: Color(0xFF6B7090),
  );

  @override
  TackColors copyWith() => this;

  @override
  TackColors lerp(TackColors? other, double t) => t < 0.5 || other == null ? this : other;
}

extension TackContext on BuildContext {
  TackColors get tack => Theme.of(this).extension<TackColors>()!;

  /// Geist Mono with tabular figures, for dates, times and counts.
  TextStyle mono(double size, {Color? color, FontWeight weight = FontWeight.w400}) => TextStyle(
    fontFamily: tackMono,
    fontSize: size,
    height: 1.3,
    color: color ?? kit.textMuted,
    fontWeight: weight,
    fontVariations: [FontVariation.weight(weight.value.toDouble())],
    fontFeatures: numFeatures,
  );
}

Color _tint(Color on, Color c) => Color.lerp(on, c, 0.12)!;

/// DESIGN.md's colour table as kit tokens. Kit's "surface" is what cards, inputs and sheets are
/// drawn on, which is Tack's `--card`; its "sunken" surface is Tack's `--surface`.
KitTokens tackTokens(Brightness b) {
  if (b == Brightness.dark) {
    const card = Color(0xFF242733);
    const danger = Color(0xFFFF6B6E);
    const warning = Color(0xFFF2B13C);
    const success = Color(0xFF3FCB8E);
    return KitTokens(
      bg: const Color(0xFF13141A),
      surface: card,
      surfaceSunken: const Color(0xFF1B1D26),
      surfaceHover: const Color(0xFF2B2F3D),
      border: const Color(0xFF2F3342),
      borderStrong: const Color(0xFF3A3F50),
      text: const Color(0xFFECEDF2),
      textMuted: const Color(0xFF9A9EB2),
      textFaint: const Color(0xFF898D9F),
      overlay: const Color(0x80000000),
      accent: const Color(0xFF6E98FF),
      onAccent: const Color(0xFF0F1424),
      accentText: const Color(0xFF6E98FF),
      accentSoft: const Color(0xFF232E52),
      positive: success,
      positiveSoft: _tint(card, success),
      negative: danger,
      negativeSoft: _tint(card, danger),
      warningText: warning,
      warningSoft: _tint(card, warning),
      shadow: const Color(0x3D000000),
    );
  }
  const card = Color(0xFFFFFFFF);
  const danger = Color(0xFFC33439);
  const warning = Color(0xFF955F00);
  const success = Color(0xFF1D9B68);
  return KitTokens(
    bg: const Color(0xFFF4F5F8),
    surface: card,
    surfaceSunken: const Color(0xFFEBEDF2),
    surfaceHover: const Color(0xFFE4E7EE),
    border: const Color(0xFFDDE0E8),
    borderStrong: const Color(0xFFC9CDD8),
    text: const Color(0xFF1F2233),
    textMuted: const Color(0xFF5E6378),
    textFaint: const Color(0xFF717687),
    overlay: const Color(0x661F2233),
    accent: const Color(0xFF3D6BF0),
    onAccent: const Color(0xFFFFFFFF),
    accentText: const Color(0xFF3D6BF0),
    accentSoft: const Color(0xFFE4EBFF),
    positive: success,
    positiveSoft: _tint(card, success),
    negative: danger,
    negativeSoft: _tint(card, danger),
    warningText: warning,
    warningSoft: _tint(card, warning),
    shadow: const Color(0x291F2233),
  );
}

ThemeData tackTheme(Brightness b) {
  final t = tackTokens(b);
  final colors = b == Brightness.dark ? TackColors.dark : TackColors.light;
  final base = buildKitTheme(t, b, extensions: [colors], fontFamily: tackSans);
  return base.copyWith(
    // Floating layers: lighter with a faint border in dark, a soft shadow in light.
    bottomSheetTheme: base.bottomSheetTheme.copyWith(
      backgroundColor: colors.floating,
      shape: RoundedRectangleBorder(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(TackRadii.sheet)),
        side: BorderSide(color: colors.floatingBorder),
      ),
    ),
    snackBarTheme: base.snackBarTheme.copyWith(
      backgroundColor: b == Brightness.light ? t.text : colors.floating,
      actionTextColor: b == Brightness.light ? TackColors.logoShine : t.accent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(TackRadii.control),
        side: BorderSide(color: colors.floatingBorder),
      ),
    ),
  );
}

/// Theme and density are synced settings, the same on every device (SPEC §3.9).
final tackThemeModeProvider = Provider<ThemeMode>((ref) {
  return switch (ref.watch(storeProvider.select((l) => l.theme))) {
    'light' => ThemeMode.light,
    'dark' => ThemeMode.dark,
    _ => ThemeMode.system,
  };
});

/// Card sizes for the two densities (DESIGN.md "Density").
class Density {
  const Density._({
    required this.padding,
    required this.gap,
    required this.title,
    required this.meta,
    required this.metaIcon,
  });
  final EdgeInsets padding;
  final double gap;
  final double title;
  final double meta;
  final double metaIcon;

  static const compact = Density._(
    padding: EdgeInsets.symmetric(vertical: 8, horizontal: 10),
    gap: 6,
    title: 14,
    meta: 12,
    metaIcon: 14,
  );
  static const roomy = Density._(
    padding: EdgeInsets.symmetric(vertical: 12, horizontal: 14),
    gap: 10,
    title: 15,
    meta: 13,
    metaIcon: 15,
  );
}

final densityProvider = Provider<Density>(
  (ref) => ref.watch(storeProvider.select((l) => l.density)) == 'roomy' ? Density.roomy : Density.compact,
);
