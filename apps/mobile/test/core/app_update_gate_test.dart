import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:okuvu/src/core/app_update/app_update_gate.dart';
import 'package:okuvu/src/core/app_update/version_policy.dart';

const _policy = VersionPolicy(
  minimumSupportedVersionCode: 22,
  latestVersionCode: 24,
  latestVersionName: '1.0.23',
  storeUrl: 'https://play.google.com/store/apps/details?id=ai.okuvu.app',
);

class _FakeUpdateService extends AppUpdateService {
  _FakeUpdateService({this.outcome = AppUpdateOutcome.playUpdateStarted});

  final AppUpdateOutcome outcome;
  int calls = 0;
  String? lastStoreUrl;

  @override
  Future<AppUpdateOutcome> requestUpdate({required String storeUrl}) async {
    calls++;
    lastStoreUrl = storeUrl;
    return outcome;
  }
}

Widget _harness({
  required VersionPolicy? policy,
  required int buildNumber,
  AppUpdateService? service,
}) {
  return ProviderScope(
    overrides: [
      versionPolicyProvider.overrideWith((ref) async => policy),
      appBuildInfoProvider.overrideWith(
        (ref) async => buildNumber <= 0
            ? AppBuildInfo.unknown
            : AppBuildInfo(versionName: '1.0.13', buildNumber: buildNumber),
      ),
      if (service != null) appUpdateServiceProvider.overrideWithValue(service),
    ],
    child: const MaterialApp(
      home: AppUpdateGate(child: Scaffold(body: Text('app content'))),
    ),
  );
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('AppUpdateGate', () {
    testWidgets('blocks a build below the server floor', (tester) async {
      await tester.pumpWidget(_harness(policy: _policy, buildNumber: 21));
      await tester.pumpAndSettle();

      expect(find.text('Okuvu needs an update'), findsOneWidget);
      expect(find.text('app content'), findsNothing);
      // No dismiss control: a build carrying a fix must not be sat on.
      expect(find.text('Not now'), findsNothing);
    });

    testWidgets('renders the app when the build is at the floor', (
      tester,
    ) async {
      await tester.pumpWidget(_harness(policy: _policy, buildNumber: 22));
      await tester.pumpAndSettle();

      expect(find.text('app content'), findsOneWidget);
      expect(find.text('Okuvu needs an update'), findsNothing);
    });

    testWidgets('offers an update below the newest build without blocking', (
      tester,
    ) async {
      await tester.pumpWidget(_harness(policy: _policy, buildNumber: 23));
      await tester.pumpAndSettle();

      expect(find.text('A new version is ready'), findsOneWidget);
      expect(find.text('app content'), findsOneWidget);

      await tester.tap(find.text('Not now'));
      await tester.pumpAndSettle();

      expect(find.text('A new version is ready'), findsNothing);
      expect(find.text('app content'), findsOneWidget);
    });

    testWidgets('runs the update when the client accepts', (tester) async {
      final service = _FakeUpdateService();
      await tester.pumpWidget(
        _harness(policy: _policy, buildNumber: 23, service: service),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Update now'));
      await tester.pumpAndSettle();

      expect(service.calls, 1);
      expect(service.lastStoreUrl, _policy.storeUrl);
    });

    testWidgets('the blocking screen updates without a way out', (
      tester,
    ) async {
      final service = _FakeUpdateService();
      await tester.pumpWidget(
        _harness(policy: _policy, buildNumber: 20, service: service),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Update now'));
      await tester.pumpAndSettle();

      expect(service.calls, 1);
    });

    testWidgets('tells the client when the store could not be opened', (
      tester,
    ) async {
      final service = _FakeUpdateService(outcome: AppUpdateOutcome.failed);
      await tester.pumpWidget(
        _harness(policy: _policy, buildNumber: 20, service: service),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Update now'));
      await tester.pumpAndSettle();

      expect(
        find.text(
          'Could not open the Play Store. Update Okuvu from the Play Store app.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('renders the app when the policy cannot be read', (
      tester,
    ) async {
      await tester.pumpWidget(_harness(policy: null, buildNumber: 20));
      await tester.pumpAndSettle();

      // Fail open: a config read that failed must never lock a client out.
      expect(find.text('app content'), findsOneWidget);
      expect(find.text('Okuvu needs an update'), findsNothing);
    });

    testWidgets('renders the app when the installed build cannot be read', (
      tester,
    ) async {
      await tester.pumpWidget(_harness(policy: _policy, buildNumber: 0));
      await tester.pumpAndSettle();

      expect(find.text('app content'), findsOneWidget);
    });

    testWidgets('does not re-offer the same release after a dismissal', (
      tester,
    ) async {
      SharedPreferences.setMockInitialValues({
        kUpdateDismissedCodeKey: _policy.latestVersionCode,
      });

      await tester.pumpWidget(_harness(policy: _policy, buildNumber: 23));
      await tester.pumpAndSettle();

      expect(find.text('A new version is ready'), findsNothing);
      expect(find.text('app content'), findsOneWidget);
    });
  });
}
