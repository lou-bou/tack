import 'package:material_ui/material_ui.dart';

/// Spacing scale (4px base).
abstract final class Space {
  static const double s1 = 4, s2 = 8, s3 = 12, s4 = 16, s5 = 20, s6 = 24, s8 = 32, s10 = 40, s12 = 48;
}

abstract final class Radii {
  static const double xs = 4, sm = 8, md = 12, lg = 18, xl = 24, pill = 999;
}

abstract final class Motion {
  static const fast = Duration(milliseconds: 120);
  static const base = Duration(milliseconds: 200);
  static const slow = Duration(milliseconds: 360);
  static const easeOut = Cubic(0.2, 0.8, 0.2, 1);
  static const spring = Cubic(0.34, 1.56, 0.64, 1);
}

/// The shared colour roles. Each app supplies a light and a dark set; widgets read only these.
@immutable
class KitTokens extends ThemeExtension<KitTokens> {
  const KitTokens({
    required this.bg,
    required this.surface,
    required this.surfaceSunken,
    required this.surfaceHover,
    required this.border,
    required this.borderStrong,
    required this.text,
    required this.textMuted,
    required this.textFaint,
    required this.overlay,
    required this.accent,
    required this.onAccent,
    required this.accentText,
    required this.accentSoft,
    required this.positive,
    required this.positiveSoft,
    required this.negative,
    required this.negativeSoft,
    required this.warningText,
    required this.warningSoft,
    required this.shadow,
  });

  final Color bg, surface, surfaceSunken, surfaceHover, border, borderStrong;
  final Color text, textMuted, textFaint, overlay;
  final Color accent, onAccent, accentText, accentSoft;
  final Color positive, positiveSoft, negative, negativeSoft;
  final Color warningText, warningSoft, shadow;

  /// Warm stone neutrals with a marigold accent.
  static const stoneLight = KitTokens(
    bg: Color(0xFFF6F5F2),
    surface: Color(0xFFFFFFFF),
    surfaceSunken: Color(0xFFEFEDE8),
    surfaceHover: Color(0xFFF2F0EC),
    border: Color(0xFFE4E1DA),
    borderStrong: Color(0xFFCDC9C0),
    text: Color(0xFF1C1B19),
    textMuted: Color(0xFF6B675F),
    textFaint: Color(0xFF9A958B),
    overlay: Color(0x661C1B19),
    accent: Color(0xFFF2A922),
    onAccent: Color(0xFF2A1D04),
    accentText: Color(0xFF8A5A00),
    accentSoft: Color(0xFFFDF0D5),
    positive: Color(0xFF1D8049),
    positiveSoft: Color(0xFFE2F2E8),
    negative: Color(0xFFC2413A),
    negativeSoft: Color(0xFFF8E4E1),
    warningText: Color(0xFF8A5A00),
    warningSoft: Color(0xFFFDF0D5),
    shadow: Color(0x1F1C1B19),
  );

  static const stoneDark = KitTokens(
    bg: Color(0xFF121211),
    surface: Color(0xFF1B1A18),
    surfaceSunken: Color(0xFF0E0E0D),
    surfaceHover: Color(0xFF23221F),
    border: Color(0xFF2C2A27),
    borderStrong: Color(0xFF3D3A35),
    text: Color(0xFFF1EFEA),
    textMuted: Color(0xFFA39F96),
    textFaint: Color(0xFF75716A),
    overlay: Color(0x8C000000),
    accent: Color(0xFFF5B13A),
    onAccent: Color(0xFF2A1D04),
    accentText: Color(0xFFF5B13A),
    accentSoft: Color(0xFF33270F),
    positive: Color(0xFF4CBD78),
    positiveSoft: Color(0xFF142B1D),
    negative: Color(0xFFEC6B61),
    negativeSoft: Color(0xFF361816),
    warningText: Color(0xFFF5B13A),
    warningSoft: Color(0xFF33270F),
    shadow: Color(0x80000000),
  );

  @override
  KitTokens copyWith({
    Color? accent,
    Color? onAccent,
    Color? accentText,
    Color? accentSoft,
  }) => KitTokens(
    bg: bg,
    surface: surface,
    surfaceSunken: surfaceSunken,
    surfaceHover: surfaceHover,
    border: border,
    borderStrong: borderStrong,
    text: text,
    textMuted: textMuted,
    textFaint: textFaint,
    overlay: overlay,
    accent: accent ?? this.accent,
    onAccent: onAccent ?? this.onAccent,
    accentText: accentText ?? this.accentText,
    accentSoft: accentSoft ?? this.accentSoft,
    positive: positive,
    positiveSoft: positiveSoft,
    negative: negative,
    negativeSoft: negativeSoft,
    warningText: warningText,
    warningSoft: warningSoft,
    shadow: shadow,
  );

  @override
  KitTokens lerp(KitTokens? other, double t) {
    if (other == null) return this;
    Color c(Color a, Color b) => Color.lerp(a, b, t)!;
    return KitTokens(
      bg: c(bg, other.bg),
      surface: c(surface, other.surface),
      surfaceSunken: c(surfaceSunken, other.surfaceSunken),
      surfaceHover: c(surfaceHover, other.surfaceHover),
      border: c(border, other.border),
      borderStrong: c(borderStrong, other.borderStrong),
      text: c(text, other.text),
      textMuted: c(textMuted, other.textMuted),
      textFaint: c(textFaint, other.textFaint),
      overlay: c(overlay, other.overlay),
      accent: c(accent, other.accent),
      onAccent: c(onAccent, other.onAccent),
      accentText: c(accentText, other.accentText),
      accentSoft: c(accentSoft, other.accentSoft),
      positive: c(positive, other.positive),
      positiveSoft: c(positiveSoft, other.positiveSoft),
      negative: c(negative, other.negative),
      negativeSoft: c(negativeSoft, other.negativeSoft),
      warningText: c(warningText, other.warningText),
      warningSoft: c(warningSoft, other.warningSoft),
      shadow: c(shadow, other.shadow),
    );
  }
}

extension KitContext on BuildContext {
  KitTokens get kit => Theme.of(this).extension<KitTokens>()!;
  TextTheme get text => Theme.of(this).textTheme;
}

const kitSans = 'packages/kit/Inter';
const kitDisplay = 'packages/kit/Nunito';

/// Figures that line up in columns, for every amount on screen.
const numFeatures = [FontFeature.tabularFigures(), FontFeature.liningFigures()];

extension NumStyle on TextStyle {
  TextStyle get num => copyWith(fontFeatures: numFeatures);
}
