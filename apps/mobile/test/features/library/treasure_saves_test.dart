import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/journal/journal_list_screen.dart';
import 'package:okuvu/src/features/library/library_screen.dart';
import 'package:okuvu/src/features/library/treasure_providers.dart';

/// Saving into the box from somewhere else, and what the note then says about
/// where it came from. One test per door: journal, Library exercise, chat.
class _FakeSaves {
  final List<Map<String, dynamic>> saves = [];

  Dio build({List<Map<String, dynamic>>? journal, List<Map<String, dynamic>>? cards}) {
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        if (options.method == 'GET' && options.path == '/journal') {
          handler.resolve(Response(
            requestOptions: options,
            statusCode: 200,
            data: {'entries': journal ?? const []},
          ));
          return;
        }
        if (options.method == 'GET' && options.path == '/library') {
          handler.resolve(Response(
            requestOptions: options,
            statusCode: 200,
            data: {'cards': cards ?? const []},
          ));
          return;
        }
        if (options.method == 'POST' && options.path == '/treasure/notes') {
          saves.add(Map<String, dynamic>.from(options.data as Map));
          handler.resolve(Response(
            requestOptions: options,
            statusCode: 201,
            data: {
              'success': true,
              'id': 'note-new',
              'safety': {'showHelp': false, 'helpOffer': false},
            },
          ));
          return;
        }
        handler.reject(DioException(requestOptions: options, message: 'unexpected ${options.path}'));
      },
    ));
    return dio;
  }
}

ProviderContainer _container(Dio dio) {
  final container = ProviderContainer(overrides: [dioClientProvider.overrideWithValue(dio)]);
  addTearDown(container.dispose);
  return container;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({'sharing_confirmation_seen': true});
  });

  testWidgets('a journal entry can be kept, and the note says it came from the journal',
      (tester) async {
    final backend = _FakeSaves();
    final container = _container(backend.build(journal: [
      {
        'id': 'e1',
        'emotion': null,
        'intensity': null,
        'content': 'A quiet sentence about the day.',
        'created_at': '2026-11-09T10:00:00.000Z',
        'shared': false,
      },
    ]));

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(home: JournalListScreen()),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('journal_keep_e1')));
    await tester.pumpAndSettle();

    expect(backend.saves, hasLength(1));
    expect(backend.saves.first, {
      'body': 'A quiet sentence about the day.',
      'source': 'journal',
      'sourceRef': 'e1',
    });
    expect(find.text('Kept in your Treasure Box.'), findsOneWidget);
  });

  testWidgets('a Library exercise can be kept, and the note says it came from a worksheet',
      (tester) async {
    final backend = _FakeSaves();
    final container = _container(backend.build(cards: [
      {
        'toolId': 'ws_post_session',
        'label': 'Post-session takeaway',
        'summary': 'Catch what stood out before the day carries on.',
        'section': 'before_after',
        'accessMode': 'open',
        'kind': 'worksheet',
        'available': true,
        'loadLevel': 'light',
        'estMinutes': 3,
      },
    ]));

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(home: LibraryScreen()),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('library_keep_ws_post_session')));
    await tester.pumpAndSettle();

    expect(backend.saves, hasLength(1));
    expect(backend.saves.first['title'], 'Post-session takeaway');
    expect(backend.saves.first['body'], 'Catch what stood out before the day carries on.');
    expect(backend.saves.first['source'], 'worksheet');
    expect(backend.saves.first['sourceRef'], 'ws_post_session');
  });

  test('a chat message can be kept, and the note says it came from OKUVU chat', () async {
    final backend = _FakeSaves();
    final container = _container(backend.build());

    final outcome = await container.read(treasureSaverProvider).saveFromChat(
          message: 'You got through the exam week before.',
          turnId: 'turn-1',
        );

    expect(outcome.ok, isTrue);
    expect(backend.saves.single, {
      'body': 'You got through the exam week before.',
      'source': 'chat',
      'sourceRef': 'turn-1',
    });
  });
}
