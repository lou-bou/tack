import 'package:cupertino_ui/cupertino_ui.dart' show CupertinoPageTransitionsBuilder;
import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import 'tokens.dart';

/// Builds the Material theme every app shares from a set of [KitTokens].
ThemeData buildKitTheme(
  KitTokens t,
  Brightness brightness, {
  List<ThemeExtension<dynamic>> extensions = const [],
}) {
  final scheme = ColorScheme(
    brightness: brightness,
    primary: t.accent,
    onPrimary: t.onAccent,
    secondary: t.accent,
    onSecondary: t.onAccent,
    error: t.negative,
    onError: Colors.white,
    surface: t.surface,
    onSurface: t.text,
    surfaceContainerHighest: t.surfaceSunken,
    onSurfaceVariant: t.textMuted,
    outline: t.borderStrong,
    outlineVariant: t.border,
    scrim: t.overlay,
  );

  TextStyle s(double size, FontWeight w, {double? height, Color? color, double? spacing}) =>
      TextStyle(
        fontFamily: kitSans,
        fontSize: size,
        height: height ?? 1.4,
        color: color ?? t.text,
        letterSpacing: spacing ?? 0,
        fontVariations: [FontVariation.weight(w.value.toDouble())],
        fontWeight: w,
      );

  final textTheme = TextTheme(
    displayLarge: s(40, FontWeight.w700, height: 1.1, spacing: -0.8),
    displayMedium: s(28, FontWeight.w700, height: 1.15, spacing: -0.5),
    headlineMedium: s(22, FontWeight.w700, height: 1.2, spacing: -0.4),
    titleLarge: s(18, FontWeight.w600, height: 1.25),
    titleMedium: s(16, FontWeight.w600, height: 1.3),
    titleSmall: s(14, FontWeight.w600, height: 1.3),
    bodyLarge: s(16, FontWeight.w400),
    bodyMedium: s(14, FontWeight.w400),
    bodySmall: s(12, FontWeight.w400, color: t.textMuted),
    labelLarge: s(14, FontWeight.w600, height: 1.2),
    labelMedium: s(12, FontWeight.w500, height: 1.2, color: t.textMuted),
    labelSmall: s(11, FontWeight.w600, height: 1.2, color: t.textMuted, spacing: 0.6),
  );

  OutlineInputBorder border(Color c, [double w = 1]) => OutlineInputBorder(
    borderRadius: BorderRadius.circular(Radii.md),
    borderSide: BorderSide(color: c, width: w),
  );

  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    scaffoldBackgroundColor: t.bg,
    canvasColor: t.bg,
    fontFamily: kitSans,
    textTheme: textTheme,
    splashFactory: NoSplash.splashFactory,
    highlightColor: Colors.transparent,
    dividerTheme: DividerThemeData(color: t.border, thickness: 1, space: 1),
    iconTheme: IconThemeData(color: t.text, size: 20),
    extensions: [t, ...extensions],
    pageTransitionsTheme: const PageTransitionsTheme(
      builders: {
        TargetPlatform.android: PredictiveBackPageTransitionsBuilder(),
        TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
      },
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: t.bg,
      foregroundColor: t.text,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: textTheme.titleLarge,
      systemOverlayStyle: overlayStyle(t, brightness),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: t.surface,
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: Space.s3, vertical: 13),
      hintStyle: textTheme.bodyLarge!.copyWith(color: t.textFaint),
      border: border(t.borderStrong),
      enabledBorder: border(t.borderStrong),
      focusedBorder: border(t.accent, 2),
      errorBorder: border(t.negative),
      focusedErrorBorder: border(t.negative, 2),
      errorStyle: const TextStyle(height: 0, fontSize: 0),
    ),
    textSelectionTheme: TextSelectionThemeData(
      cursorColor: t.accentText,
      selectionColor: t.accent.withValues(alpha: 0.3),
      selectionHandleColor: t.accent,
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: t.surface,
      surfaceTintColor: Colors.transparent,
      modalBarrierColor: t.overlay,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(Radii.xl)),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: t.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.lg)),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: brightness == Brightness.light ? t.text : t.surfaceHover,
      contentTextStyle: textTheme.bodyMedium!.copyWith(
        color: brightness == Brightness.light ? t.bg : t.text,
      ),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.md)),
      insetPadding: const EdgeInsets.fromLTRB(Space.s4, 0, Space.s4, Space.s3),
      elevation: 3,
    ),
    datePickerTheme: DatePickerThemeData(
      backgroundColor: t.surface,
      surfaceTintColor: Colors.transparent,
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: t.accent),
  );
}

/// Edge-to-edge system bars whose icons match the theme.
SystemUiOverlayStyle overlayStyle(KitTokens t, Brightness brightness) {
  final icons = brightness == Brightness.light ? Brightness.dark : Brightness.light;
  return SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: icons,
    statusBarBrightness: brightness,
    systemNavigationBarColor: Colors.transparent,
    systemNavigationBarIconBrightness: icons,
    systemNavigationBarContrastEnforced: false,
  );
}
