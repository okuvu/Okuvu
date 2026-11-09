import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/my_space/past_me_screen.dart';

/// A dio that answers the timeline and records the delete.
class _FakeTimeline {
  final List<String> deletes = [];

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

void main() {
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
