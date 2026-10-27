import 'package:flutter/foundation.dart';

/// Amazon Cognito user-pool configuration for the mobile client.
///
/// Values come from `--dart-define` at build time — the same names the API and
/// infrastructure use (see `docs/AWS-CUTOVER-SPEC.md`):
///
/// ```bash
/// flutter build apk --flavor prod \
///   --dart-define=COGNITO_REGION=ap-south-1 \
///   --dart-define=COGNITO_USER_POOL_ID=ap-south-1_XXXXXXXX \
///   --dart-define=COGNITO_CLIENT_ID=<mobile app client id>
/// ```
@immutable
class CognitoConfig {
  const CognitoConfig({
    required this.region,
    required this.clientId,
    this.poolId = '',
  });

  /// Builds the config from `--dart-define` values.
  ///
  /// Missing values are not fatal at construction time: an unconfigured client
  /// only fails when it actually calls Cognito, so widget tests and the dev
  /// bypass path keep working with no defines at all.
  factory CognitoConfig.fromEnvironment() {
    return const CognitoConfig(
      region: String.fromEnvironment(
        'COGNITO_REGION',
        defaultValue: 'ap-south-1',
      ),
      clientId: String.fromEnvironment('COGNITO_CLIENT_ID', defaultValue: ''),
      poolId: String.fromEnvironment('COGNITO_USER_POOL_ID', defaultValue: ''),
    );
  }

  final String region;
  final String clientId;
  final String poolId;

  bool get isConfigured => clientId.isNotEmpty;

  /// Regional Cognito IDP endpoint. Every operation is a POST here with an
  /// `X-Amz-Target` header naming the operation.
  String get endpoint => 'https://cognito-idp.$region.amazonaws.com/';

  /// `https://cognito-idp.<region>.amazonaws.com/<pool>` — the `iss` claim the
  /// API verifies.
  String get issuer => 'https://cognito-idp.$region.amazonaws.com/$poolId';

  @override
  String toString() =>
      'CognitoConfig(region: $region, poolId: $poolId, clientId: '
      '${clientId.isEmpty ? '<unset>' : clientId})';
}
