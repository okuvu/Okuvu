import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../home/providers/today_card_provider.dart';

/// Owner round 7 (3 Nov 2026) — Home greeted with the short name saved on the
/// welcome screen ("S") while Settings > Profile showed the account name
/// ("Shubha G"), so a name the user edited in Profile never reached the
/// greeting. The profile name is now the single source; this picks the part
/// people actually greet each other with, and returns null when there is no
/// usable name so the caller can fall back to the welcome-screen short name.
String? greetingFirstName(String? fullName) {
  final trimmed = fullName?.trim();
  if (trimmed == null || trimmed.isEmpty) return null;
  final first = trimmed.split(RegExp(r'\s+')).first;
  return first.isEmpty ? null : first;
}

class ProfileInfo {
  final String? fullName;
  final String? email;
  final DateTime? dateOfBirth;
  final String? gender;

  const ProfileInfo({
    required this.fullName,
    required this.email,
    required this.dateOfBirth,
    required this.gender,
  });

  factory ProfileInfo.fromJson(Map<String, dynamic> json) {
    final dobString = json['date_of_birth'] as String?;
    return ProfileInfo(
      fullName: json['full_name'] as String?,
      email: json['email'] as String?,
      dateOfBirth: dobString != null ? DateTime.tryParse(dobString) : null,
      gender: json['gender'] as String?,
    );
  }
}

/// GET /settings/profile — fetched once when the Profile screen opens.
final profileInfoProvider = FutureProvider.autoDispose<ProfileInfo>((ref) async {
  final dio = ref.read(dioClientProvider);
  final response = await dio.get('/settings/profile');
  return ProfileInfo.fromJson(response.data as Map<String, dynamic>);
});

/// PATCH /settings/profile — email is intentionally excluded (display-only,
/// tied to the invite/auth flow).
class ProfileSaveNotifier extends Notifier<void> {
  @override
  void build() {}

  Future<bool> save({
    required String? fullName,
    required DateTime? dateOfBirth,
    required String? gender,
  }) async {
    final dio = ref.read(dioClientProvider);
    try {
      await dio.patch('/settings/profile', data: {
        'full_name': fullName,
        'date_of_birth': dateOfBirth?.toIso8601String(),
        'gender': gender,
      });
      // Owner round 7 (3 Nov 2026) — the Home greeting now reads the profile
      // name, and both providers cache their response. Without these the name
      // a user just saved would only show up after a restart.
      ref.invalidate(profileInfoProvider);
      ref.invalidate(todayCardProvider);
      return true;
    } catch (_) {
      return false;
    }
  }
}

final profileSaveProvider = NotifierProvider<ProfileSaveNotifier, void>(
  ProfileSaveNotifier.new,
);
