import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../dio_client.dart';

/// The build the server says this handset must be on.
///
/// Served by `GET /app/version` — public, no session, because the first launch
/// after an install asks before any token exists. The app also calls it after a
/// token expires, so a 401 there would read to the client as "Okuvu is broken"
/// rather than "you are out of date".
class VersionPolicy {
  const VersionPolicy({
    required this.minimumSupportedVersionCode,
    required this.latestVersionCode,
    required this.latestVersionName,
    required this.storeUrl,
  });

  /// Below this build the app refuses to continue. Set by the server, so
  /// raising the floor never needs an app release.
  final int minimumSupportedVersionCode;

  /// The newest build on Play. Below this the app offers an update.
  final int latestVersionCode;
  final String latestVersionName;

  /// Where to send a client who cannot use the in-app update flow — a phone
  /// without Play services, or a build Play will not update in place.
  final String storeUrl;

  factory VersionPolicy.fromJson(Map<String, dynamic> json) {
    return VersionPolicy(
      minimumSupportedVersionCode:
          (json['minimumSupportedVersionCode'] as num?)?.toInt() ?? 0,
      latestVersionCode: (json['latestVersionCode'] as num?)?.toInt() ?? 0,
      latestVersionName: (json['latestVersionName'] as String?) ?? '',
      storeUrl: (json['storeUrl'] as String?) ?? '',
    );
  }
}

/// What this handset actually is, read from the installed package.
///
/// Deliberately not a constant in the source: the app's Settings screen used to
/// print a hardcoded `1.0.0`, which no build ever matched, so it could never
/// answer "which version am I on".
class AppBuildInfo {
  const AppBuildInfo({required this.versionName, required this.buildNumber});

  final String versionName;
  final int buildNumber;

  bool get isKnown => buildNumber > 0;

  /// The one string shown in Settings and About.
  String get label {
    if (!isKnown) return 'Version unavailable';
    if (versionName.isEmpty) return 'Version $buildNumber';
    return 'Version $versionName ($buildNumber)';
  }

  static const AppBuildInfo unknown =
      AppBuildInfo(versionName: '', buildNumber: 0);
}

/// No auth interceptor on purpose: this endpoint must answer before sign-in,
/// and the payload carries nothing about the user.
final _versionDioProvider = Provider<Dio>((ref) => createDioClient());

/// Fails open. If the config read fails the app opens normally — a client in
/// distress must never be locked out of their own companion because a version
/// endpoint was unreachable. The gate is a delivery mechanism, not a safety
/// control; the safety copy that matters lives on the server and reaches every
/// build regardless.
final versionPolicyProvider = FutureProvider<VersionPolicy?>((ref) async {
  final dio = ref.watch(_versionDioProvider);
  try {
    final response = await dio.get<Map<String, dynamic>>('/app/version');
    final data = response.data;
    if (data == null) return null;
    final policy = VersionPolicy.fromJson(data);
    if (policy.latestVersionCode <= 0) return null;
    return policy;
  } catch (_) {
    return null;
  }
});

final appBuildInfoProvider = FutureProvider<AppBuildInfo>((ref) async {
  try {
    final info = await PackageInfo.fromPlatform();
    return AppBuildInfo(
      versionName: info.version,
      buildNumber: int.tryParse(info.buildNumber) ?? 0,
    );
  } catch (_) {
    // No platform channel (widget tests, or a host that cannot read the
    // package): report unknown rather than throwing during startup.
    return AppBuildInfo.unknown;
  }
});
