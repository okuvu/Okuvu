import 'package:flutter/material.dart';

import 'app_colors.dart';

/// OKUVU brand kit — replaces the old `colorSchemeSeed: Colors.teal`
/// theme. Built via `ColorScheme.fromSeed` (so every Material 3 role gets
/// a sensible, internally-consistent value) then `.copyWith` overrides the
/// specific roles this app actually reads (`Theme.of(context).colorScheme.*`
/// throughout `lib/src/features/`) with exact brand-kit hex values, rather
/// than hand-specifying all ~30 ColorScheme fields by hand.
class AppTheme {
  AppTheme._();

  static ThemeData get theme {
    final colorScheme = ColorScheme.fromSeed(
      seedColor: AppColors.violet,
      brightness: Brightness.light,
    ).copyWith(
      primary: AppColors.violet,
      onPrimary: Colors.white,
      primaryContainer: AppColors.lavenderWash,
      onPrimaryContainer: AppColors.royalPurple,
      secondary: AppColors.honeyDeep,
      onSecondary: Colors.white,
      secondaryContainer: AppColors.honeyTint,
      onSecondaryContainer: AppColors.honeyDeep,
      tertiary: AppColors.sageDeep,
      onTertiary: Colors.white,
      tertiaryContainer: AppColors.sageTint,
      onTertiaryContainer: AppColors.sageDeep,
      error: AppColors.crisis,
      onError: Colors.white,
      errorContainer: AppColors.crisisTint,
      onErrorContainer: AppColors.crisis,
      surface: AppColors.oat,
      onSurface: AppColors.charcoalInk,
      onSurfaceVariant: AppColors.inkSoft,
      surfaceContainerHighest: AppColors.lavenderWash,
      outline: AppColors.hairline,
      outlineVariant: AppColors.hairline,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      // Brand kit: Poppins, weights 300/400/600 only (bundled in
      // assets/fonts/ — see pubspec.yaml). Flutter synthesizes any
      // TextTheme weight outside that set from the nearest bundled one.
      fontFamily: 'Poppins',
      scaffoldBackgroundColor: AppColors.oat,
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.royalPurple,
        foregroundColor: AppColors.lavenderTint,
        elevation: 0,
        centerTitle: false,
      ),
    );
  }
}
