import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:evia/src/config/app_config.dart';
import 'package:evia/src/core/providers.dart';
import 'package:evia/src/features/settings/about_screen.dart';
import 'package:evia/src/features/settings/emergency_contact_screen.dart';
import 'package:evia/src/features/settings/privacy_screen.dart';
import 'package:evia/src/features/settings/settings_screen.dart';
import 'package:evia/src/widgets/voice_toggle.dart';

Dio _createMockDio({bool voiceEnabled = false}) {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        if (options.path == '/settings/voice' && options.method == 'GET') {
          handler.resolve(
            Response(
              requestOptions: options,
              statusCode: 200,
              data: {'voice_enabled': voiceEnabled},
            ),
          );
          return;
        }
        handler.resolve(
          Response(
            requestOptions: options,
            statusCode: 200,
            data: {'success': true},
          ),
        );
      },
    ),
  );
  return dio;
}

class _VoiceStateText extends ConsumerWidget {
  const _VoiceStateText();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(voiceSettingsStateProvider);
    return Text('voiceState=${state.voiceEnabled}');
  }
}

void _installTtsChannelMock() {
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(
    const MethodChannel('flutter_tts'),
    (MethodCall call) async {
      if (call.method == 'isLanguageAvailable') return true;
      if (call.method == 'speak' || call.method == 'stop') return 1;
      return null;
    },
  );
}

void _uninstallTtsChannelMock() {
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(const MethodChannel('flutter_tts'), null);
}

Widget _settingsApp(Dio dio) {
  return ProviderScope(
    overrides: [dioClientProvider.overrideWithValue(dio)],
    child: MaterialApp.router(
      routerConfig: GoRouter(
        initialLocation: '/settings',
        routes: [
          GoRoute(
            path: '/settings',
            builder: (_, __) => const SettingsScreen(),
            routes: [
              GoRoute(
                path: 'emergency',
                builder: (_, __) => const EmergencyContactScreen(),
              ),
              GoRoute(
                path: 'about',
                builder: (_, __) => const AboutScreen(),
              ),
              GoRoute(
                path: 'privacy-policy',
                builder: (_, __) => const PrivacyScreen(),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}

Widget _voiceFixture(Dio dio) {
  return ProviderScope(
    overrides: [dioClientProvider.overrideWithValue(dio)],
    child: const MaterialApp(
      home: Scaffold(
        body: Column(
          children: [
            VoiceToggle(),
            Divider(height: 1),
            VoiceToggle(),
            Divider(height: 1),
            _VoiceStateText(),
          ],
        ),
      ),
    ),
  );
}

void main() {
  AppConfig.init('dev');

  setUp(_installTtsChannelMock);
  tearDown(_uninstallTtsChannelMock);

  group('SettingsScreen', () {
    testWidgets(
      'renders all entries: My Focus Area, Emergency Contact, '
      'Privacy & Data, Language, About, Voice, Delete Account',
      (tester) async {
        await tester.pumpWidget(_settingsApp(_createMockDio()));
        await tester.pumpAndSettle();

        expect(find.text('My Focus Area'), findsOneWidget);
        expect(find.text('Emergency Contact'), findsOneWidget);
        expect(find.text('Privacy & Data'), findsOneWidget);
        expect(find.text('Language'), findsOneWidget);
        expect(find.text('About'), findsOneWidget);
        expect(find.text('Voice'), findsOneWidget);
        expect(find.text('Delete Account'), findsOneWidget);
      },
    );

    testWidgets('About tile navigates to AboutScreen', (tester) async {
      await tester.pumpWidget(_settingsApp(_createMockDio()));
      await tester.pumpAndSettle();

      await tester.tap(find.text('About'));
      await tester.pumpAndSettle();

      expect(find.byType(AboutScreen), findsOneWidget);
    });

    testWidgets('Emergency Contact tile navigates to EmergencyContactScreen',
        (tester) async {
      await tester.pumpWidget(_settingsApp(_createMockDio()));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Emergency Contact'));
      await tester.pumpAndSettle();

      expect(find.byType(EmergencyContactScreen), findsOneWidget);
    });

    testWidgets('displays version string at bottom', (tester) async {
      await tester.pumpWidget(_settingsApp(_createMockDio()));
      await tester.pumpAndSettle();

      expect(find.text('Version 1.0.0'), findsOneWidget);
    });
  });

  group('Voice toggle default state', () {
    testWidgets('voice toggle is OFF by default', (tester) async {
      await tester.pumpWidget(_voiceFixture(_createMockDio()));

      // Flush the initial GET /settings/voice microtask.
      await tester.runAsync(() async {
        await Future<void>.delayed(const Duration(milliseconds: 50));
      });
      await tester.pumpAndSettle();

      // VoiceToggle should render (language available) and show OFF state.
      expect(find.byType(VoiceToggle), findsNWidgets(2));
      expect(find.text('voiceState=false'), findsOneWidget);

      for (final tile in tester.widgetList<SwitchListTile>(
        find.byType(SwitchListTile),
      )) {
        expect(tile.value, false);
      }
    });
  });

  group('Voice toggle cross-screen consistency', () {
    testWidgets(
      'flipping via notifier reflects in every VoiceToggle widget and any '
      'voiceSettingsStateProvider consumer (settings ↔ chat)',
      (tester) async {
        await tester.pumpWidget(_voiceFixture(_createMockDio()));

        await tester.runAsync(() async {
          await Future<void>.delayed(const Duration(milliseconds: 50));
        });
        await tester.pumpAndSettle();

        expect(find.text('voiceState=false'), findsOneWidget);
        expect(find.byType(VoiceToggle), findsNWidgets(2));

        for (final tile in tester.widgetList<SwitchListTile>(
          find.byType(SwitchListTile),
        )) {
          expect(tile.value, false);
        }

        final container = ProviderScope.containerOf(
          tester.element(find.byType(VoiceToggle).first),
        );

        await tester.runAsync(() async {
          await container
              .read(voiceSettingsProvider.notifier)
              .toggleVoice(true);
          await Future<void>.delayed(const Duration(milliseconds: 50));
        });
        await tester.pumpAndSettle();

        for (final tile in tester.widgetList<SwitchListTile>(
          find.byType(SwitchListTile),
        )) {
          expect(tile.value, true);
        }
        expect(find.text('voiceState=true'), findsOneWidget);

        await tester.runAsync(() async {
          await container
              .read(voiceSettingsProvider.notifier)
              .toggleVoice(false);
          await Future<void>.delayed(const Duration(milliseconds: 50));
        });
        await tester.pumpAndSettle();

        for (final tile in tester.widgetList<SwitchListTile>(
          find.byType(SwitchListTile),
        )) {
          expect(tile.value, false);
        }
        expect(find.text('voiceState=false'), findsOneWidget);
      },
    );
  });
}
