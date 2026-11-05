// Round 8 (3 Nov 2026) — "no changes made in the settings tab are getting
// saved". Every Settings write used to be fire-and-forget: the control moved
// optimistically, the PATCH was dispatched with `unawaited`, and every error
// was logged and dropped. A rejected save therefore looked identical to a
// stored one until the next app launch.
//
// These tests pin the three behaviours that make a failure visible:
//   1. the notifier reports false when the server rejects the write,
//   2. the value goes back to what the server last confirmed, and
//   3. the screen says so out loud instead of pretending.
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/settings/language_notifier.dart';
import 'package:okuvu/src/features/settings/notification_settings_notifier.dart';
import 'package:okuvu/src/features/settings/notifications_screen.dart';
import 'package:okuvu/src/features/settings/quote_of_day_notifier.dart';
import 'package:okuvu/src/features/settings/settings_save_feedback.dart';

/// Resolves reads from [values] and answers every write with [writeStatus].
Dio _fakeDio({
  Map<String, Map<String, dynamic>> values = const {},
  int writeStatus = 200,
}) {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        if (options.method == 'GET') {
          handler.resolve(
            Response(
              requestOptions: options,
              statusCode: 200,
              data: values[options.path] ?? <String, dynamic>{},
            ),
          );
          return;
        }
        if (writeStatus >= 400) {
          handler.reject(
            DioException(
              requestOptions: options,
              response: Response(
                requestOptions: options,
                statusCode: writeStatus,
                data: {
                  'error': {'code': 'SERVER_ERROR', 'message': 'nope'},
                },
              ),
              type: DioExceptionType.badResponse,
            ),
            true,
          );
          return;
        }
        handler.resolve(
          Response(
            requestOptions: options,
            statusCode: writeStatus,
            data: {'success': true},
          ),
        );
      },
    ),
  );
  return dio;
}

/// The notifiers kick off their initial GET from a microtask in `build()`;
/// two event-loop turns let that resolve before the test asserts on state.
Future<void> _flush() async {
  // Dio resolves through several await hops even when the adapter answers
  // synchronously, so a single microtask turn is not enough for the initial
  // GET to land. The delay has to be real, not Duration.zero.
  await Future<void>.delayed(const Duration(milliseconds: 20));
}

ProviderContainer _container(Dio dio) {
  final container = ProviderContainer(
    overrides: [dioClientProvider.overrideWithValue(dio)],
  );
  addTearDown(container.dispose);
  return container;
}

void main() {
  group('a rejected settings write is reported, not swallowed', () {
    test('voice reverts to the stored value and returns false', () async {
      final container = _container(_fakeDio(
        values: {
          '/settings/voice': {'voice_enabled': false},
        },
        writeStatus: 500,
      ));
      container.listen(voiceSettingsProvider, (_, __) {});
      await _flush();

      final saved = await container
          .read(voiceSettingsProvider.notifier)
          .toggleVoice(true);

      expect(saved, isFalse);
      expect(container.read(voiceSettingsProvider).voiceEnabled, isFalse,
          reason: 'the switch must not keep showing a value the API rejected');
    });

    test('quote of the day reverts and returns false', () async {
      final container = _container(_fakeDio(
        values: {
          '/settings/quote-of-day': {'enabled': false},
        },
        writeStatus: 500,
      ));
      container.listen(quoteOfDaySettingsProvider, (_, __) {});
      await _flush();

      final saved = await container
          .read(quoteOfDaySettingsProvider.notifier)
          .setEnabled(true);

      expect(saved, isFalse);
      expect(container.read(quoteOfDaySettingsProvider).enabled, isFalse);
    });

    test('language reverts and returns false', () async {
      final container = _container(_fakeDio(
        values: {
          '/settings/language': {'language_mode': 'english'},
        },
        writeStatus: 500,
      ));
      container.listen(languageSettingsProvider, (_, __) {});
      await _flush();

      final saved = await container
          .read(languageSettingsProvider.notifier)
          .setLanguageMode('mirror');

      expect(saved, isFalse);
      expect(container.read(languageSettingsProvider).languageMode, 'english');
    });

    test('notification preferences revert and return false', () async {
      final container = _container(_fakeDio(
        values: {
          '/settings/notifications': {
            'appointment_reminders_enabled': true,
            'chat_nudges_enabled': true,
          },
        },
        writeStatus: 503,
      ));
      container.listen(notificationSettingsProvider, (_, __) {});
      await _flush();

      final saved = await container
          .read(notificationSettingsProvider.notifier)
          .setChatNudges(false);

      expect(saved, isFalse);
      expect(container.read(notificationSettingsProvider).chatNudgesEnabled,
          isTrue);
    });

    test('a write the server accepts returns true and keeps the new value',
        () async {
      final container = _container(_fakeDio(
        values: {
          '/settings/voice': {'voice_enabled': false},
        },
      ));
      container.listen(voiceSettingsProvider, (_, __) {});
      await _flush();

      final saved = await container
          .read(voiceSettingsProvider.notifier)
          .toggleVoice(true);

      expect(saved, isTrue);
      expect(container.read(voiceSettingsProvider).voiceEnabled, isTrue);
    });
  });

  testWidgets('a failed notification toggle tells the user on screen',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          dioClientProvider.overrideWithValue(_fakeDio(
            values: {
              '/settings/notifications': {
                'appointment_reminders_enabled': true,
                'chat_nudges_enabled': true,
              },
            },
            writeStatus: 500,
          )),
        ],
        child: const MaterialApp(home: NotificationsScreen()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('chat_nudges_toggle')));
    await tester.pumpAndSettle();

    expect(find.text(settingsSaveFailureMessage('Chat nudges')), findsOneWidget);
    final toggle = tester.widget<SwitchListTile>(
      find.byKey(const ValueKey('chat_nudges_toggle')),
    );
    expect(toggle.value, isTrue, reason: 'the switch must fall back');
  });
}
