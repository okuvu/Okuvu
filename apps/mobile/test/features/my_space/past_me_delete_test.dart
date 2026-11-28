import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/my_space/past_me_screen.dart';

/// A dio that answers the timeline, records the delete and records a share.
class _FakeTimeline {
  final List<String> deletes = [];
  final List<Map<String, dynamic>> shares = [];

  Dio build() {
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        if (options.method == 'GET' && options.path == '/past-me') {
          handler.resolve(Response(
            requestOptions: options,
            statusCode: 200,
            data: {
              'items': [
                {
                  'kind': 'worksheet_response',
                  'id': 'w1',
                  'at': '2026-11-09T10:00:00.000Z',
                  'toolId': 'ws_energy_audit',
                  'toolLabel': 'Energy audit',
                  'excerpt': 'Back-to-back classes',
                  'shared': false,
                  'feelingBefore': 7,
                  'feelingAfter': 4,
                },
              ],
              'filters': [
                {'toolId': null, 'label': 'Everything', 'count': 1},
              ],
            },
          ));
          return;
        }
        if (options.method == 'POST' && options.path == '/sharing') {
          shares.add(Map<String, dynamic>.from(options.data as Map));
          handler.resolve(Response(
            requestOptions: options,
            statusCode: 200,
            data: {'shared': true},
          ));
          return;
        }
        if (options.method == 'DELETE' && options.path.startsWith('/me/items/')) {
          deletes.add(options.path);
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

Widget _screen(ProviderContainer container) => UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(home: PastMeScreen()),
    );

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({'sharing_confirmation_seen': true}));

  // Owner's round, 28 Nov 2026: an exercise a client finished on their own
  // arrived private with no way to change it, because the only share control
  // lived in the journal. The label on a Past me row is now the control.
  testWidgets('sharing a worksheet answer from Past me posts the share', (tester) async {
    final backend = _FakeTimeline();
    final container = ProviderContainer(
      overrides: [dioClientProvider.overrideWithValue(backend.build())],
    );
    addTearDown(container.dispose);

    await tester.pumpWidget(_screen(container));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('share_label_private')), findsOneWidget);

    await tester.tap(find.byKey(const Key('past_me_share_w1')));
    await tester.pumpAndSettle();

    expect(backend.shares, [
      {'kind': 'worksheet_response', 'id': 'w1', 'shared': true},
    ]);
  });

  testWidgets('the first share asks before anything is shared', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final backend = _FakeTimeline();
    final container = ProviderContainer(
      overrides: [dioClientProvider.overrideWithValue(backend.build())],
    );
    addTearDown(container.dispose);

    await tester.pumpWidget(_screen(container));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('past_me_share_w1')));
    await tester.pumpAndSettle();

    // The owner's approved first-share line, and nothing written yet.
    expect(
      find.text('Your therapist will be able to read this. You can stop sharing anytime.'),
      findsOneWidget,
    );
    expect(backend.shares, isEmpty);

    await tester.tap(find.widgetWithText(FilledButton, 'Share'));
    await tester.pumpAndSettle();

    expect(backend.shares, [
      {'kind': 'worksheet_response', 'id': 'w1', 'shared': true},
    ]);
  });

  testWidgets('a worksheet answer can be deleted from Past me, after confirming',
      (tester) async {
    final backend = _FakeTimeline();
    final container = ProviderContainer(
      overrides: [dioClientProvider.overrideWithValue(backend.build())],
    );
    addTearDown(container.dispose);

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(home: PastMeScreen()),
    ));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('past_me_item_w1')), findsOneWidget);
    expect(find.text('Energy audit'), findsOneWidget);

    await tester.tap(find.byKey(const Key('past_me_delete_w1')));
    await tester.pumpAndSettle();

    // The same confirmation the journal and the Treasure Box use: it names the
    // loss, and nothing is removed until Delete is tapped.
    expect(find.text('Delete this?'), findsOneWidget);
    expect(
      find.text('It will be removed from your timeline and from anywhere it was shared. '
          'This cannot be undone.'),
      findsOneWidget,
    );
    expect(backend.deletes, isEmpty);

    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();

    expect(backend.deletes, ['/me/items/worksheet_response/w1']);
  });

  testWidgets('cancelling keeps the answer', (tester) async {
    final backend = _FakeTimeline();
    final container = ProviderContainer(
      overrides: [dioClientProvider.overrideWithValue(backend.build())],
    );
    addTearDown(container.dispose);

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(home: PastMeScreen()),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('past_me_delete_w1')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();

    expect(backend.deletes, isEmpty);
  });
}
