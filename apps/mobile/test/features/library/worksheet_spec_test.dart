import 'package:flutter_test/flutter_test.dart';
import 'package:okuvu/src/features/library/worksheet_spec.dart';

/// The app's copy of the worksheet rules, tested on its own. The prompts here
/// are placeholders: this file tests the machinery, never the approved wording.
Map<String, Object?> sampleBody() => {
      'version': 1,
      'intro': 'Intro.',
      'fields': [
        {'id': 'start', 'type': 'instruction', 'prompt': 'A moment from this week.'},
        {'id': 'facts', 'type': 'short_text', 'prompt': 'What happened?', 'required': true},
        {
          'id': 'can_act',
          'type': 'choice',
          'prompt': 'Anything you can do?',
          'required': true,
          'options': [
            {'value': 'yes', 'label': 'Yes'},
            {'value': 'no', 'label': 'Not right now'},
          ],
        },
        {
          'id': 'step',
          'type': 'short_text',
          'prompt': 'One small step?',
          'visibleWhen': {'field': 'can_act', 'in': ['yes']},
        },
        {
          'id': 'park',
          'type': 'datetime',
          'prompt': 'When?',
          'withDate': true,
          'withTime': true,
          'visibleWhen': {'field': 'can_act', 'in': ['no']},
        },
        {'id': 'ending', 'type': 'closing_reflection', 'prompt': 'What do you notice?'},
      ],
      'closing': {
        'text': 'Done.',
        'buttons': [
          {'label': 'Done', 'action': 'done'},
        ],
      },
    };

void main() {
  group('parseWorksheetContent', () {
    test('accepts a well-formed worksheet', () {
      final content = parseWorksheetContent(sampleBody());
      expect(content.fields, hasLength(6));
      expect(content.fields.first.type, 'instruction');
      expect(content.closing?.text, 'Done.');
      expect(content.closing?.buttons.first.action, 'done');
    });

    test('rejects a non-object', () {
      expect(
        () => parseWorksheetContent('nope'),
        throwsA(isA<WorksheetContentException>()),
      );
    });

    test('rejects an empty worksheet', () {
      expect(
        () => parseWorksheetContent({'version': 1, 'fields': <Object?>[]}),
        throwsA(isA<WorksheetContentException>()),
      );
    });

    test('rejects an unknown piece type', () {
      final body = sampleBody();
      (body['fields'] as List).add({'id': 'score', 'type': 'phq9', 'prompt': 'Down?'});
      expect(() => parseWorksheetContent(body), throwsA(isA<WorksheetContentException>()));
    });

    test('rejects duplicate ids and missing prompts', () {
      final duplicate = sampleBody();
      (duplicate['fields'] as List)[1]['id'] = 'can_act';
      expect(() => parseWorksheetContent(duplicate), throwsA(isA<WorksheetContentException>()));

      final noPrompt = sampleBody();
      (noPrompt['fields'] as List)[1].remove('prompt');
      expect(() => parseWorksheetContent(noPrompt), throwsA(isA<WorksheetContentException>()));
    });

    test('rejects a branch pointing at a later or non-choice piece', () {
      final later = sampleBody();
      (later['fields'] as List)[3]['visibleWhen'] = {'field': 'park', 'in': ['yes']};
      expect(() => parseWorksheetContent(later), throwsA(isA<WorksheetContentException>()));

      final notAChoice = sampleBody();
      (notAChoice['fields'] as List)[3]['visibleWhen'] = {'field': 'facts', 'in': ['yes']};
      expect(() => parseWorksheetContent(notAChoice), throwsA(isA<WorksheetContentException>()));
    });

    test('rejects a branch value that is not one of the options', () {
      final body = sampleBody();
      (body['fields'] as List)[3]['visibleWhen'] = {'field': 'can_act', 'in': ['maybe']};
      expect(() => parseWorksheetContent(body), throwsA(isA<WorksheetContentException>()));
    });

    test('rejects a closing reflection that is not last', () {
      final body = sampleBody();
      final fields = body['fields'] as List;
      final ending = fields.removeLast();
      fields.insert(0, ending);
      expect(() => parseWorksheetContent(body), throwsA(isA<WorksheetContentException>()));
    });

    test('rejects a date piece with neither date nor time', () {
      final body = {
        'version': 1,
        'fields': [
          {'id': 'when', 'type': 'datetime', 'prompt': 'When?', 'withDate': false, 'withTime': false},
        ],
      };
      expect(() => parseWorksheetContent(body), throwsA(isA<WorksheetContentException>()));
    });

    test('rejects feelings nested more than one level', () {
      final body = {
        'version': 1,
        'fields': [
          {
            'id': 'feelings',
            'type': 'feelings_picker',
            'prompt': 'Which?',
            'feelings': [
              {'id': 'scared', 'label': 'Scared'},
              {'id': 'worried', 'label': 'Worried', 'parent': 'scared'},
              {'id': 'exams', 'label': 'About exams', 'parent': 'worried'},
            ],
          },
        ],
      };
      expect(() => parseWorksheetContent(body), throwsA(isA<WorksheetContentException>()));
    });
  });

  group('branching', () {
    late WorksheetContent content;
    setUp(() => content = parseWorksheetContent(sampleBody()));

    test('shows only the branch that applies', () {
      final yes = visibleFields(content, {'can_act': 'yes'}).map((f) => f.id);
      expect(yes, contains('step'));
      expect(yes, isNot(contains('park')));

      final no = visibleFields(content, {'can_act': 'no'}).map((f) => f.id);
      expect(no, contains('park'));
      expect(no, isNot(contains('step')));
    });

    test('shows neither branch until the choice is answered', () {
      final ids = visibleFields(content, const {}).map((f) => f.id).toList();
      expect(ids, isNot(contains('step')));
      expect(ids, isNot(contains('park')));
    });

    test('matches any of several values, which is how "yes or partly" works', () {
      final field = content.fields[3];
      final branched = WorksheetField(
        id: field.id,
        type: field.type,
        prompt: field.prompt,
        visibleWhen: const WorksheetBranch(field: 'can_act', values: ['yes', 'no']),
      );
      expect(isFieldVisible(branched, {'can_act': 'no'}), isTrue);
    });
  });

  group('answers', () {
    late WorksheetContent content;
    setUp(() => content = parseWorksheetContent(sampleBody()));

    test('blocks Next only while a required piece is empty', () {
      final facts = content.fields[1];
      expect(canAdvanceFrom(facts, const {}), isFalse);
      expect(canAdvanceFrom(facts, {'facts': 'A thing happened'}), isTrue);

      final instruction = content.fields[0];
      expect(canAdvanceFrom(instruction, const {}), isTrue);
    });

    test('does not require a piece the branch hid', () {
      expect(missingRequiredFields(content, {'facts': 'x', 'can_act': 'no'}), isEmpty);
    });

    test('reports a missing required answer and an out-of-range scale', () {
      final problems = worksheetAnswerProblems(content, {'can_act': 'yes'});
      expect(problems.join(' '), contains('facts: an answer is required'));

      final scale = parseWorksheetContent({
        'version': 1,
        'fields': [
          {'id': 'strength', 'type': 'scale_0_10', 'prompt': 'How strong?', 'required': true},
          {'id': 'belief', 'type': 'scale_0_100', 'prompt': 'How much do you believe it?'},
        ],
      });
      expect(worksheetAnswerProblems(scale, {'strength': 0}), isEmpty);
      expect(worksheetAnswerProblems(scale, {'strength': 10, 'belief': 100}), isEmpty);
      expect(worksheetAnswerProblems(scale, {'strength': 11}).join(' '), contains('0 and 10'));
      expect(worksheetAnswerProblems(scale, {'strength': 5, 'belief': 101}).join(' '), contains('0 and 100'));
    });

    test('rejects an answer to a hidden branch and to an instruction', () {
      expect(
        worksheetAnswerProblems(content, {'facts': 'x', 'can_act': 'yes', 'park': '2026-11-10T18:00'}).join(' '),
        contains('park: answered but not shown'),
      );
      expect(
        worksheetAnswerProblems(content, {'start': 'oops', 'facts': 'x', 'can_act': 'yes'}).join(' '),
        contains('does not take an answer'),
      );
    });

    test('checks feelings picks, checklist limits and date strings', () {
      final feelings = parseWorksheetContent({
        'version': 1,
        'fields': [
          {
            'id': 'feelings',
            'type': 'feelings_picker',
            'prompt': 'Which?',
            'withStrength': true,
            'feelings': [
              {'id': 'scared', 'label': 'Scared'},
              {'id': 'worried', 'label': 'Worried', 'parent': 'scared'},
            ],
          },
        ],
      });
      expect(
        worksheetAnswerProblems(feelings, {
          'feelings': {
            'picked': ['scared'],
            'strength': {'scared': 8},
          },
        }),
        isEmpty,
      );
      expect(
        worksheetAnswerProblems(feelings, {
          'feelings': {
            'picked': ['scared'],
            'strength': {'scared': 12},
          },
        }).join(' '),
        contains('between 0 and 10'),
      );

      final when = parseWorksheetContent({
        'version': 1,
        'fields': [
          {'id': 'when', 'type': 'datetime', 'prompt': 'When?', 'withDate': true, 'withTime': true},
        ],
      });
      expect(worksheetAnswerProblems(when, {'when': '2026-11-10T18:30'}), isEmpty);
      expect(worksheetAnswerProblems(when, {'when': '10/11/2026'}).join(' '), contains('YYYY-MM-DD'));
      expect(worksheetAnswerProblems(when, {'when': '2026-11-10T25:00'}).join(' '), contains('HH:mm'));
    });

    test('counts progress over answerable pieces, growing when a branch appears', () {
      expect(worksheetProgress(content, const {}), (answered: 0, total: 2));
      expect(worksheetProgress(content, {'facts': 'x', 'can_act': 'yes'}), (answered: 2, total: 3));
    });
  });

  group('WorksheetDraft', () {
    test('round-trips through JSON', () {
      final draft = WorksheetDraft(
        answers: {'facts': 'a', 'can_act': 'yes'},
        stepIndex: 2,
        updatedAt: DateTime.parse('2026-11-09T10:00:00.000Z'),
      );
      final restored = WorksheetDraft.fromJson(draft.toJson());
      expect(restored, isNotNull);
      expect(restored!.answers['facts'], 'a');
      expect(restored.stepIndex, 2);
      expect(restored.updatedAt.toUtc().toIso8601String(), '2026-11-09T10:00:00.000Z');
    });

    test('ignores a draft that is not the shape it expects', () {
      expect(WorksheetDraft.fromJson('nope'), isNull);
      expect(WorksheetDraft.fromJson({'answers': 'nope'}), isNull);
    });
  });
}
