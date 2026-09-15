import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

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
      return true;
    } catch (_) {
      return false;
    }
  }
}

final profileSaveProvider = NotifierProvider<ProfileSaveNotifier, void>(
  ProfileSaveNotifier.new,
);
