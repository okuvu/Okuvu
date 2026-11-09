import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/library/treasure_box_screen.dart';

/// A dio that answers the box's five reads and writes and records what the
/// screen asked for.
class _FakeBox {
  _FakeBox({this.notes = const [], this.pinnedNote, this.saveSafety});

  final List<Map<String, dynamic>> notes;
  final Map<String, dynamic>? pinnedNote;
  final Map<String, dynamic>? saveSafety;

  final List<Map<String, dynamic>> saves = [];
  int picks = 0;

  Map<String, dynamic> _note(Map<String, dynamic> note) => {
        'id': note['id'],
        'title': note['title'],
        'body': note['body'],
        'source': note['source'] ?? 'self',
        'sourceLabel': note['sourceLabel'] ?? 'Me',
        'collection_id': note['collection_id'],
        'tags': note['tags'] ?? const <String>[],
        'pinned': note['pinned'] ?? false,
        'shared_with_therapist': note['shared'] ?? false,
        'created_at': note['created_at'] ?? '2026-11-09T10:00:00.000Z',
      };

  List<String> _tags() {
    final all = <String>{};
    for (final note in notes) {
      all.addAll((note['tags'] as List? ?? const []).whereType<String>());
    }
    return all.toList();
  }

  Dio build() {
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        if (options.method == 'GET' && options.path == '/treasure') {
          handler.resolve(Response(
            requestOptions: options,
            statusCode: 200,
            data: {
              'collections': [
                {
                  'id': 'c-anxious',
                  'name': 'Open when I feel anxious',
                  'system_key': 'anxious',
                  'count': 0,
                },
              ],
              'tags': _tags(),
              'notes': notes.map(_note).toList(),
            },
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
              'id': 'new-note',
              'safety': saveSafety ?? {'showHelp': false, 'helpOffer': false},
            },
          ));
          return;
        }
        if (options.method == 'GET' && options.path == '/treasure/pick') {
          picks += 1;
          if (pinnedNote == null) {
            handler.reject(DioException(
              requestOptions: options,
              response: Response(
                requestOptions: options,
                statusCode: 404,
                data: {
                  'error': {'code': 'NO_PINNED', 'message': 'Nothing pinned'},
                },
              ),
            ));
            return;
          }
          handler.resolve(Response(
            requestOptions: options,
            statusCode: 200,
            data: {'note': _note(pinnedNote!)},
          ));
          return;
        }
        handler.reject(DioException(requestOptions: options, message: 'unexpected ${options.path}'));
      },
    ));
    return dio;
  }
}

Widget _app(Dio dio, ProviderContainer container) {
  return UncontrolledProviderScope(
    container: container,
    child: const MaterialApp(home: TreasureBoxScreen()),
  );
}

ProviderContainer _container(Dio dio) {
  final container = ProviderContainer(
    overrides: [dioClientProvider.overrideWithValue(dio)],
  );
  addTearDown(container.dispose);
  return container;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({'sharing_confirmation_seen': true});
  });

  testWidgets('a note starts Private, shows where it came from, and is not shared',
      (tester) async {
    final box = _FakeBox(notes: [
      {
        'id': 'n1',
        'title': 'A line that helped',
        'body': 'Anxious is not the same as unsafe.',
        'source': 'journal',
        'sourceLabel': 'From my journal',
        'shared': false,
        'pinned': true,
        'tags': ['anxious'],
      },
    ]);
    final container = _container(box.build());
    await tester.pumpWidget(_app(box.build(), container));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('treasure_note_n1')), findsOneWidget);
    expect(find.text('Private'), findsOneWidget);
    expect(find.text('From my journal'), findsOneWidget);
    // Once as the note's tag, once as the tag filter chip.
    expect(find.text('anxious'), findsWidgets);

    final shareSwitch = tester.widget<Switch>(
      find.byKey(const Key('treasure_share_switch_n1')),
    );
    expect(shareSwitch.value, isFalse);
  });

  testWidgets('a new note is saved as the client\'s own, then appears with its source',
      (tester) async {
    final box = _FakeBox();
    final container = _container(box.build());
    await tester.pumpWidget(_app(box.build(), container));
    await tester.pumpAndSettle();

    // Empty box: the approved empty wording is on screen.
    expect(find.byKey(const Key('treasure_empty_line')), findsOneWidget);

    await tester.tap(find.byKey(const Key('treasure_add')));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('treasure_editor_body')),
      'The auto driver did not argue about the fare.',
    );
    await tester.enterText(find.byKey(const Key('treasure_editor_tags')), 'small win');
    await tester.tap(find.byKey(const Key('treasure_editor_save')));
    await tester.pumpAndSettle();

    expect(box.saves, hasLength(1));
    expect(box.saves.first['body'], 'The auto driver did not argue about the fare.');
    expect(box.saves.first['source'], 'self');
    expect(box.saves.first['tags'], ['small win']);
    // Privacy is never sent as a choice: the api's default is private.
    expect(box.saves.first.containsKey('shared'), isFalse);
  });

  testWidgets('crisis words in a note raise the help card', (tester) async {
    final box = _FakeBox(
      saveSafety: {'showHelp': true, 'helpOffer': false},
    );
    final container = _container(box.build());
    await tester.pumpWidget(_app(box.build(), container));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('treasure_add')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('treasure_editor_body')),
      'I want to die and I have nobody to call.',
    );
    await tester.tap(find.byKey(const Key('treasure_editor_save')));
    await tester.pumpAndSettle();

    expect(container.read(crisisOverlayProvider), isTrue);
  });

  testWidgets('"Pick one for me" shows a pinned note', (tester) async {
    final box = _FakeBox(
      notes: [
        {
          'id': 'n1',
          'title': 'Worth keeping',
          'body': 'You got through the exam week before.',
          'pinned': true,
        },
      ],
      pinnedNote: {
        'id': 'n1',
        'title': 'Worth keeping',
        'body': 'You got through the exam week before.',
        'pinned': true,
      },
    );
    final container = _container(box.build());
    await tester.pumpWidget(_app(box.build(), container));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('treasure_pick_one')));
    await tester.pumpAndSettle();

    expect(box.picks, 1);
    expect(find.text('You got through the exam week before.'), findsWidgets);
  });

  testWidgets('"Pick one for me" says so when nothing is pinned', (tester) async {
    final box = _FakeBox();
    final container = _container(box.build());
    await tester.pumpWidget(_app(box.build(), container));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('treasure_pick_one')));
    await tester.pumpAndSettle();

    expect(find.text('Pin a note you want to come back to first.'), findsOneWidget);
  });

  testWidgets('the approved privacy line is on the screen', (tester) async {
    final box = _FakeBox();
    final container = _container(box.build());
    await tester.pumpWidget(_app(box.build(), container));
    await tester.pumpAndSettle();

    expect(
      find.textContaining("Your therapist can't read this unless you choose to share it"),
      findsOneWidget,
    );
  });
}
