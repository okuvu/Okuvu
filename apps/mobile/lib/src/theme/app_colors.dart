import 'package:flutter/material.dart';

/// OKUVU brand kit (`OKUVU-Brand-Kit-Simple/OKUVU-Brand-Kit/`) — ported
/// 1:1 from `01-Palette/03b-design-tokens.json`. This is the same source
/// used for the therapist portal's rebrand this session; keep both in
/// sync if the brand kit itself ever changes.
///
/// Crisis red is deliberately NOT sourced from here — crisis/safety colors
/// are a separate, clinically-owned decision, not a brand-identity one
/// (same precedent as the portal's `danger` token). See [crisis] below.
class AppColors {
  AppColors._();

  // Purple family
  static const royalNight = Color(0xFF2A0F4E);
  static const royalPurple = Color(0xFF5E2E91);
  static const indigoViolet = Color(0xFF6E62B4);
  static const violet = Color(0xFF7B6CD9);
  static const orchid = Color(0xFFA78BFA);
  static const orchidSoft = Color(0xFFC4B5FD);
  static const lavenderTint = Color(0xFFEDE9FE);

  // Honey (warmth / first light)
  static const honey = Color(0xFFE8A33D);
  static const honeyBright = Color(0xFFF0B25E);
  static const honeyDeep = Color(0xFFD68F24);
  static const honeyTint = Color(0xFFFBF0DC);

  // Pastels
  static const lavenderWash = Color(0xFFEDE6FB);
  static const lilac = Color(0xFFE4DAFA);
  static const orchidWash = Color(0xFFEFE9FC);

  // Soft sage (complementary green — pastel only, never neon)
  static const sage = Color(0xFF7C9E8F);
  static const sageDeep = Color(0xFF4E7564);
  static const sageTint = Color(0xFFE4EFE9);
  static const pastelMint = Color(0xFFD8EBE0);

  // Neutrals
  static const oat = Color(0xFFF7F3FD);
  static const oatElevated = Color(0xFFFEFCFF);
  static const charcoalInk = Color(0xFF26222E);
  static const inkSoft = Color(0xFF6E658A);
  static const hairline = Color(0xFFE7DEF6);

  /// Crisis/safety red — unchanged hue from the pre-rebrand app
  /// (Material's default error red). Not part of the brand kit.
  static const crisis = Color(0xFFBA1A1A);
  static const crisisTint = Color(0xFFFDF2F1);

  /// Portal's `--brand-thread` gradient, same 3 stops — used for AppBars
  /// here so the chrome bar matches the therapist portal's exactly.
  static const brandGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [royalNight, indigoViolet, orchid],
  );
}
