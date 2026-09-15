import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

/// Therapist-portal wireframes C-04/C-06 — the mobile welcome screen
/// shown right after OTP verification for a wizard-invited client.
class WelcomeInfo {
  final String? welcomeNote;
  final String? displayAbbreviation;

  const WelcomeInfo({required this.welcomeNote, required this.displayAbbreviation});

  factory WelcomeInfo.fromJson(Map<String, dynamic> json) {
    return WelcomeInfo(
      welcomeNote: json['welcomeNote'] as String?,
      displayAbbreviation: json['displayAbbreviation'] as String?,
    );
  }
}

/// GET /users/me/welcome — fetched once when the welcome screen opens.
final welcomeInfoProvider = FutureProvider.autoDispose<WelcomeInfo>((ref) async {
  final dio = ref.read(dioClientProvider);
  final response = await dio.get('/users/me/welcome');
  return WelcomeInfo.fromJson(response.data as Map<String, dynamic>);
});

/// PATCH /users/me/welcome — the client editing their own display
/// abbreviation "at first run" per the wireframe. The only client-facing
/// write to ClinicalConfig; every other field on it is therapist-authored.
class WelcomeAbbreviationNotifier extends Notifier<void> {
  @override
  void build() {}

  Future<bool> save(String displayAbbreviation) async {
    final dio = ref.read(dioClientProvider);
    try {
      await dio.patch(
        '/users/me/welcome',
        data: {'display_abbreviation': displayAbbreviation},
      );
      return true;
    } catch (_) {
      return false;
    }
  }
}

final welcomeAbbreviationProvider = NotifierProvider<WelcomeAbbreviationNotifier, void>(
  WelcomeAbbreviationNotifier.new,
);
