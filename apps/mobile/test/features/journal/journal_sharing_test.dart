import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/journal/journal_list_screen.dart';

/// A dio that answers the journal list and records share writes.
class _FakeBackend {
  _FakeBackend({required this.shared});

  final bool shared;
  final List<Map<String, dynamic>> shareCalls = [];
  bool deleteCalled = false;

  Dio build() {
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        if (options.method == 'GET' && options.path == '/journal') {
          handler.resolve(Response(
            requestOptions: options,
            statusCode: 200,
            data: {
              'entries': [
                {
                  'id': 'e1',
                  'emotion': null,
                  'intensity': null,
                  'content': 'A quiet sentence about the day.',
                  'created_at': '2026-11-09T10:00:00.000Z',
                  'shared': shared,
                },
              ],
            },
          ));
          return;
        }
        if (options.method == 'POST' && options.path == '/sharing') {
          shareCalls.add(Map<String, dynamic>.from(options.data as Map));
          handler.resolve(Response(
            requestOptions: options,
            statusCode: 200,
            data: {
              'kind': options.data['kind'],
              'id': options.data['id'],
              'shared': options.data['shared'],
              'label': options.data['shared'] == true ? 'Shared with my therapist' : 'Private',
            },
          ));
          return;
        }
        if (options.method == 'DELETE' && options.path.startsWith('/me/items/')) {
          deleteCalled = true;
          handler.resolve(Response(
            requestOptions: options,
            statusCode: 200,
            data: {'deleted': true},
          ));
          return;
        }
        handler.reject(DioException(requestOptions: options, message: 'unexpected ${options.path}'));
      },
    ));
    return dio;
  }
}

Widget _app(Dio dio) {
  return ProviderScope(
    overrides: [dioClientProvider.overrideWithValue(dio)],
    child: const MaterialApp(home: JournalListScreen()),
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({'sharing_confirmation_seen': false});
  });

  testWidgets('every entry shows Private, and the switch is the only share path',
      (tester) async {
    final backend = _FakeBackend(shared: false);
    await tester.pumpWidget(_app(backend.build()));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('share_label_private')), findsOneWidget);
    expect(find.text('Private'), findsOneWidget);

    final switchWidget = tester.widget<Switch>(
      find.byKey(const Key('journal_share_switch_e1')),
    );
    expect(switchWidget.value, isFalse);
  });

  testWidgets('the first share shows the approved confirmation before writing',
      (tester) async {
    final backend = _FakeBackend(shared: false);
    await tester.pumpWidget(_app(backend.build()));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('journal_share_switch_e1')));
    await tester.pumpAndSettle();

    expect(
      find.text('Your therapist will be able to read this. You can stop sharing anytime.'),
      findsOneWidget,
    );
    // Nothing has been written yet: the confirmation is the gate.
    expect(backend.shareCalls, isEmpty);

    await tester.tap(find.text('Share'));
    await tester.pumpAndSettle();

    expect(backend.shareCalls, hasLength(1));
    expect(backend.shareCalls.single, {
      'kind': 'journal_entry',
      'id': 'e1',
      'shared': true,
    });
  });

  testWidgets('an already shared entry shows the shared label and can be stopped',
      (tester) async {
    final backend = _FakeBackend(shared: true);
    await tester.pumpWidget(_app(backend.build()));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('share_label_shared')), findsOneWidget);
    expect(find.text('Shared with my therapist'), findsOneWidget);

    await tester.tap(find.byKey(const Key('journal_share_switch_e1')));
    await tester.pumpAndSettle();

    // Stopping is immediate and asks nothing: consent was for sharing.
    expect(backend.shareCalls.single['shared'], false);
    expect(find.text('Your therapist will be able to read this. You can stop sharing anytime.'),
        findsNothing);
  });

  testWidgets('deleting asks first and then calls the one delete route', (tester) async {
    final backend = _FakeBackend(shared: false);
    await tester.pumpWidget(_app(backend.build()));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('journal_delete_e1')));
    await tester.pumpAndSettle();
    expect(find.text('Delete this entry?'), findsOneWidget);

    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();

    expect(backend.deleteCalled, isTrue);
  });
}
