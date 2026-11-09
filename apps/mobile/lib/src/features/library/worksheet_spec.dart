/// The worksheet pieces, as the client app reads them.
///
/// This is the Dart twin of `packages/shared-types/worksheet.ts`. The rule is
/// the same on both sides: a worksheet is DATA (approved wording stored in the
/// catalogue), so the app must be able to say "this body is malformed" instead
/// of rendering half of it. The api validates before serving, and this file
/// validates again on arrival — a client halfway through a worksheet whose
/// branch points nowhere would lose what they wrote.
///
/// Deliberate: no score, no instrument name, nothing summed. Sliders are single
/// self-reports (0-10 for a feeling, 0-100 for a percentage). The daily mood
/// check-in's 1-5 value is a separate thing in a separate table.
library;

import 'dart:convert';

/// One option of a choice or checklist piece.
class WorksheetOption {
  const WorksheetOption({required this.value, required this.label, this.description});

  final String value;
  final String label;
  final String? description;
}

/// One feeling in the picker. `parent` points at a broader family.
class WorksheetFeeling {
  const WorksheetFeeling({required this.id, required this.label, this.parent});

  final String id;
  final String label;
  final String? parent;
}

/// A column of an add-your-own-rows list.
class WorksheetRowColumn {
  const WorksheetRowColumn({required this.id, required this.label, required this.type});

  final String id;
  final String label;

  /// 'text' | 'scale_0_10' | 'datetime'
  final String type;
}

/// A forward-only branch: show this piece only when an earlier choice or
/// checklist answer includes one of [values].
class WorksheetBranch {
  const WorksheetBranch({required this.field, required this.values});

  final String field;
  final List<String> values;
}

/// One piece of a worksheet. A single class with nullable extras rather than a
/// sealed hierarchy: the shape arrives as JSON and the validator is the thing
/// that decides whether a given combination is legal, so the model stays a
/// faithful parse of what was sent.
class WorksheetField {
  const WorksheetField({
    required this.id,
    required this.type,
    required this.prompt,
    this.isRequired = false,
    this.helper,
    this.example,
    this.therapistNote = false,
    this.visibleWhen,
    this.maxLength,
    this.minLabel,
    this.maxLabel,
    this.options = const [],
    this.feelings = const [],
    this.maxSelections,
    this.minSelections,
    this.withStrength = false,
    this.columns = const [],
    this.minRows = 0,
    this.maxRows,
    this.addLabel,
    this.withDate = true,
    this.withTime = false,
  });

  final String id;
  final String type;
  final String prompt;

  /// `required` is a Dart keyword, so the flag is `isRequired`.
  final bool isRequired;
  final String? helper;
  final String? example;
  final bool therapistNote;
  final WorksheetBranch? visibleWhen;

  // text-ish
  final int? maxLength;

  // scales
  final String? minLabel;
  final String? maxLabel;

  // choice / checklist
  final List<WorksheetOption> options;
  final int? maxSelections;
  final int? minSelections;

  // feelings
  final List<WorksheetFeeling> feelings;
  final bool withStrength;

  // row list
  final List<WorksheetRowColumn> columns;
  final int minRows;
  final int? maxRows;
  final String? addLabel;

  // datetime
  final bool withDate;
  final bool withTime;

  bool get takesAnAnswer => type != 'instruction';
  bool get isScale => type == 'scale_0_10' || type == 'scale_0_100';
  int get scaleMax => type == 'scale_0_10' ? 10 : 100;
}

/// The closing line and buttons under the last piece.
class WorksheetClosing {
  const WorksheetClosing({this.text, this.buttons = const []});

  final String? text;
  final List<WorksheetClosingButton> buttons;
}

/// A button that ends the worksheet. `action` is one of 'done' | 'treasure_box'.
class WorksheetClosingButton {
  const WorksheetClosingButton({required this.label, required this.action});

  final String label;

  /// 'done' or 'treasure_box'. The app decides what to do; the copy decides
  /// what it says.
  final String action;
}

/// A whole worksheet body.
class WorksheetContent {
  const WorksheetContent({
    required this.version,
    required this.fields,
    this.intro,
    this.closing,
  });

  final int version;
  final String? intro;
  final List<WorksheetField> fields;
  final WorksheetClosing? closing;
}

/// Thrown when a body cannot be trusted. The runner shows this as a plain
/// "this isn't ready yet" screen rather than guessing.
class WorksheetContentException implements Exception {
  WorksheetContentException(this.problems);

  final List<String> problems;

  @override
  String toString() => 'WorksheetContentException: ${problems.join('; ')}';
}

const int worksheetContentVersion = 1;

/// Parse and validate a worksheet body. Throws [WorksheetContentException] with
/// every problem found, so a broken worksheet is diagnosable rather than simply
/// "not loading".
WorksheetContent parseWorksheetContent(Object? raw) {
  final problems = <String>[];

  if (raw is! Map) {
    throw WorksheetContentException(['content must be an object']);
  }

  if (raw['version'] != worksheetContentVersion) {
    problems.add('content.version: must be $worksheetContentVersion');
  }

  final intro = raw['intro'];
  if (intro != null && (intro is! String || intro.trim().isEmpty)) {
    problems.add('content.intro: must be a non-empty string when present');
  }

  final rawFields = raw['fields'];
  if (rawFields is! List || rawFields.isEmpty) {
    throw WorksheetContentException([...problems, 'content.fields: at least one piece is required']);
  }

  final seenIds = <String>{};
  final choiceValues = <String, Set<String>>{};
  final fields = <WorksheetField>[];
  var closingSeen = false;

  for (var i = 0; i < rawFields.length; i++) {
    final at = 'fields[$i]';
    final rawField = rawFields[i];
    if (rawField is! Map) {
      problems.add('$at: must be an object');
      continue;
    }

    final type = rawField['type'];
    if (type is! String || !_knownTypes.contains(type)) {
      problems.add('$at.type: unknown piece type "$type"');
      continue;
    }

    final id = rawField['id'];
    if (id is! String || !id.startsWith(RegExp('[a-z]'))) {
      problems.add('$at.id: must be a lowercase id');
    } else if (!seenIds.add(id)) {
      problems.add('$at.id: duplicate id "$id"');
    }

    final prompt = rawField['prompt'];
    if (prompt is! String || prompt.trim().isEmpty) {
      problems.add('$at.prompt: required');
    }

    if (type == 'closing_reflection') {
      if (closingSeen) problems.add('$at: only one closing reflection is allowed');
      closingSeen = true;
      if (i != rawFields.length - 1) {
        problems.add('$at: the closing reflection must be the last piece');
      }
    }

    final options = <WorksheetOption>[];
    final values = <String>{};
    final rawOptions = rawField['options'];
    if (rawOptions is List) {
      for (var oi = 0; oi < rawOptions.length; oi++) {
        final opt = rawOptions[oi];
        if (opt is! Map) {
          problems.add('$at.options[$oi]: must be an object');
          continue;
        }
        final value = opt['value'];
        final label = opt['label'];
        if (value is! String || value.isEmpty) {
          problems.add('$at.options[$oi].value: required');
          continue;
        }
        if (!values.add(value)) problems.add('$at.options[$oi].value: duplicate "$value"');
        if (label is! String || label.isEmpty) problems.add('$at.options[$oi].label: required');
        options.add(
          WorksheetOption(
            value: value,
            label: label is String ? label : value,
            description: opt['description'] is String ? opt['description'] as String : null,
          ),
        );
      }
      if (options.length < 2 && (type == 'choice' || type == 'checklist')) {
        problems.add('$at.options: at least two options are required');
      }
      if (values.isNotEmpty) choiceValues[id is String ? id : ''] = values;
    }

    final feelings = <WorksheetFeeling>[];
    final rawFeelings = rawField['feelings'];
    if (rawFeelings is List) {
      final feelingIds = <String>{};
      for (var fi = 0; fi < rawFeelings.length; fi++) {
        final f = rawFeelings[fi];
        if (f is! Map) {
          problems.add('$at.feelings[$fi]: must be an object');
          continue;
        }
        final fid = f['id'];
        final label = f['label'];
        if (fid is! String || fid.isEmpty) {
          problems.add('$at.feelings[$fi].id: required');
          continue;
        }
        if (!feelingIds.add(fid)) problems.add('$at.feelings[$fi].id: duplicate "$fid"');
        if (label is! String || label.isEmpty) problems.add('$at.feelings[$fi].label: required');
        feelings.add(
          WorksheetFeeling(
            id: fid,
            label: label is String ? label : fid,
            parent: f['parent'] is String ? f['parent'] as String : null,
          ),
        );
      }
      for (final feeling in feelings) {
        if (feeling.parent == null) continue;
        if (!feelingIds.contains(feeling.parent)) {
          problems.add('$at: feeling "${feeling.id}" has an unknown parent');
        } else {
          WorksheetFeeling? parent;
          for (final candidate in feelings) {
            if (candidate.id == feeling.parent) {
              parent = candidate;
              break;
            }
          }
          if (parent?.parent != null) {
            problems.add('$at: feelings nest only one level deep');
          }
        }
      }
      if (feelings.isEmpty) problems.add('$at.feelings: at least one feeling is required');
    } else if (type == 'feelings_picker') {
      problems.add('$at.feelings: at least one feeling is required');
    }

    final columns = <WorksheetRowColumn>[];
    final rawColumns = rawField['columns'];
    if (rawColumns is List) {
      for (var ci = 0; ci < rawColumns.length; ci++) {
        final c = rawColumns[ci];
        if (c is! Map) {
          problems.add('$at.columns[$ci]: must be an object');
          continue;
        }
        final cid = c['id'];
        final label = c['label'];
        final ctype = c['type'];
        if (cid is! String || cid.isEmpty) {
          problems.add('$at.columns[$ci].id: required');
          continue;
        }
        if (label is! String || label.isEmpty) problems.add('$at.columns[$ci].label: required');
        if (ctype is! String || !['text', 'scale_0_10', 'datetime'].contains(ctype)) {
          problems.add('$at.columns[$ci].type: must be text, scale_0_10 or datetime');
          continue;
        }
        columns.add(WorksheetRowColumn(id: cid, label: label is String ? label : cid, type: ctype));
      }
    }
    if (type == 'row_list' && columns.isEmpty) {
      problems.add('$at.columns: at least one column is required');
    }

    WorksheetBranch? branch;
    final rawBranch = rawField['visibleWhen'];
    if (rawBranch is Map) {
      final target = rawBranch['field'];
      final rawIn = rawBranch['in'];
      if (target is! String || target.isEmpty) {
        problems.add('$at.visibleWhen.field: required');
      } else if (!seenIds.contains(target)) {
        problems.add('$at.visibleWhen.field: "$target" is not an earlier piece');
      } else if (!choiceValues.containsKey(target) && rawIn is List) {
        problems.add('$at.visibleWhen.field: "$target" must be a choice or checklist');
      }
      if (rawIn is! List || rawIn.isEmpty) {
        problems.add('$at.visibleWhen.in: at least one option value is required');
      } else {
        final allowed = choiceValues[target];
        for (final v in rawIn) {
          if (v is! String) {
            problems.add('$at.visibleWhen.in: must be option values');
          } else if (allowed != null && !allowed.contains(v)) {
            problems.add('$at.visibleWhen.in: "$v" is not an option of "$target"');
          }
        }
        if (target is String) {
          branch = WorksheetBranch(
            field: target,
            values: rawIn.whereType<String>().toList(growable: false),
          );
        }
      }
    }

    final withDate = rawField['withDate'];
    final withTime = rawField['withTime'];
    if (type == 'datetime') {
      final hasDate = withDate == null ? true : withDate == true;
      final hasTime = withTime == true;
      if (!hasDate && !hasTime) problems.add('$at: a date picker needs at least a date or a time');
    }

    fields.add(
      WorksheetField(
        id: id is String ? id : '',
        type: type,
        prompt: prompt is String ? prompt : '',
        isRequired: rawField['required'] == true,
        helper: rawField['helper'] is String ? rawField['helper'] as String : null,
        example: rawField['example'] is String ? rawField['example'] as String : null,
        therapistNote: rawField['therapistNote'] == true,
        visibleWhen: branch,
        maxLength: rawField['maxLength'] is int ? rawField['maxLength'] as int : null,
        minLabel: rawField['minLabel'] is String ? rawField['minLabel'] as String : null,
        maxLabel: rawField['maxLabel'] is String ? rawField['maxLabel'] as String : null,
        options: options,
        feelings: feelings,
        maxSelections: rawField['maxSelections'] is int ? rawField['maxSelections'] as int : null,
        minSelections: rawField['minSelections'] is int ? rawField['minSelections'] as int : null,
        withStrength: rawField['withStrength'] == true,
        columns: columns,
        minRows: rawField['minRows'] is int ? rawField['minRows'] as int : 0,
        maxRows: rawField['maxRows'] is int ? rawField['maxRows'] as int : null,
        addLabel: rawField['addLabel'] is String ? rawField['addLabel'] as String : null,
        withDate: withDate == null ? true : withDate == true,
        withTime: withTime == true,
      ),
    );
  }

  WorksheetClosing? closing;
  final rawClosing = raw['closing'];
  if (rawClosing is Map) {
    final buttons = <WorksheetClosingButton>[];
    final rawButtons = rawClosing['buttons'];
    if (rawButtons is List) {
      for (final b in rawButtons) {
        if (b is! Map) continue;
        final label = b['label'];
        final action = b['action'];
        if (label is! String || label.isEmpty) {
          problems.add('content.closing.buttons: label is required');
          continue;
        }
        if (action is! String || !['done', 'treasure_box'].contains(action)) {
          problems.add('content.closing.buttons: unknown action "$action"');
          continue;
        }
        buttons.add(WorksheetClosingButton(label: label, action: action));
      }
    }
    closing = WorksheetClosing(
      text: rawClosing['text'] is String ? rawClosing['text'] as String : null,
      buttons: buttons,
    );
  }

  if (problems.isNotEmpty) throw WorksheetContentException(problems);

  return WorksheetContent(version: worksheetContentVersion, intro: intro as String?, fields: fields, closing: closing);
}

/// Parse straight from the JSON string the catalogue hands over.
WorksheetContent parseWorksheetContentJson(String json) => parseWorksheetContent(jsonDecode(json));

const _knownTypes = {
  'instruction',
  'short_text',
  'long_text',
  'voice_note',
  'scale_0_10',
  'scale_0_100',
  'feelings_picker',
  'checklist',
  'choice',
  'row_list',
  'datetime',
  'closing_reflection',
};

// ─── Answers ─────────────────────────────────────────────────────────────

/// Keyed by [WorksheetField.id]. Values are: String (text, choice, datetime),
/// int (scale), a list of strings (checklist), a map with `picked`/`strength`
/// (feelings), or a list of row maps (rows).
typedef WorksheetAnswers = Map<String, Object?>;

/// Is this piece on screen given what has been answered so far?
bool isFieldVisible(WorksheetField field, WorksheetAnswers answers) {
  final branch = field.visibleWhen;
  if (branch == null) return true;
  final answer = answers[branch.field];
  if (answer is String) return branch.values.contains(answer);
  if (answer is List) return answer.any((v) => v is String && branch.values.contains(v));
  return false;
}

/// The pieces the client is actually shown, in order.
List<WorksheetField> visibleFields(WorksheetContent content, WorksheetAnswers answers) =>
    content.fields.where((f) => isFieldVisible(f, answers)).toList(growable: false);

/// True when a piece has something in it.
bool isAnswerPresent(Object? answer) {
  if (answer == null) return false;
  if (answer is String) return answer.trim().isNotEmpty;
  if (answer is int) return true;
  if (answer is List) return answer.isNotEmpty;
  if (answer is Map) {
    final picked = answer['picked'];
    return picked is List && picked.isNotEmpty;
  }
  return false;
}

/// How far through the client is. Instructions and the closing reflection are
/// not answerable steps, so they do not move the bar.
({int answered, int total}) worksheetProgress(WorksheetContent content, WorksheetAnswers answers) {
  final answerable = visibleFields(content, answers)
      .where((f) => f.type != 'instruction' && f.type != 'closing_reflection')
      .toList(growable: false);
  final answered = answerable.where((f) => isAnswerPresent(answers[f.id])).length;
  return (answered: answered, total: answerable.length);
}

/// The pieces that still block "next". Empty means this step is complete.
List<WorksheetField> missingRequiredFields(WorksheetContent content, WorksheetAnswers answers) =>
    visibleFields(content, answers)
        .where((f) => f.isRequired && f.takesAnAnswer && !isAnswerPresent(answers[f.id]))
        .toList(growable: false);

/// Can the client move on from [field]?
bool canAdvanceFrom(WorksheetField field, WorksheetAnswers answers) {
  if (!field.isRequired || !field.takesAnAnswer) return true;
  return isAnswerPresent(answers[field.id]);
}

/// Check the whole answer set before it is handed to the api. Returns problems;
/// empty means it can be submitted. Mirrors `validateWorksheetAnswers` on the
/// server, so a client never waits for a round trip to learn a slider is empty.
List<String> worksheetAnswerProblems(WorksheetContent content, WorksheetAnswers answers) {
  final problems = <String>[];

  for (final field in content.fields) {
    if (!isFieldVisible(field, answers)) continue;
    final answer = answers[field.id];
    final present = isAnswerPresent(answer);

    if (!present) {
      if (field.isRequired && field.type != 'instruction') {
        problems.add('${field.id}: an answer is required');
      }
      continue;
    }

    switch (field.type) {
      case 'instruction':
        problems.add('${field.id}: this piece does not take an answer');
      case 'short_text':
      case 'long_text':
      case 'voice_note':
      case 'closing_reflection':
        if (answer is! String) {
          problems.add('${field.id}: must be text');
        } else {
          final ceiling = field.maxLength ?? (field.type == 'short_text' ? 500 : 10000);
          if (answer.length > ceiling) problems.add('${field.id}: over $ceiling characters');
        }
      case 'scale_0_10':
      case 'scale_0_100':
        if (answer is! int || answer < 0 || answer > field.scaleMax) {
          problems.add('${field.id}: must be a whole number between 0 and ${field.scaleMax}');
        }
      case 'choice':
        if (answer is! String || !field.options.any((o) => o.value == answer)) {
          problems.add('${field.id}: must be one of its options');
        }
      case 'checklist':
        if (answer is! List || answer.any((v) => v is! String)) {
          problems.add('${field.id}: must be a list of option values');
          break;
        }
        final values = field.options.map((o) => o.value).toList(growable: false);
        for (final v in answer) {
          if (!values.contains(v)) problems.add('${field.id}: "$v" is not one of its options');
        }
        final min = field.minSelections ?? 0;
        final max = field.maxSelections;
        if (answer.length < min) problems.add('${field.id}: at least $min selections');
        if (max != null && answer.length > max) problems.add('${field.id}: at most $max selections');
      case 'feelings_picker':
        if (answer is! Map || answer['picked'] is! List) {
          problems.add('${field.id}: must be a list of picked feelings');
          break;
        }
        final picked = (answer['picked'] as List).whereType<String>().toList(growable: false);
        final ids = field.feelings.map((f) => f.id).toList(growable: false);
        for (final p in picked) {
          if (!ids.contains(p)) problems.add('${field.id}: "$p" is not one of its feelings');
        }
        final max = field.maxSelections ?? 3;
        if (picked.length > max) problems.add('${field.id}: at most $max feelings');
        final strength = answer['strength'];
        if (strength is Map) {
          strength.forEach((key, value) {
            if (!picked.contains(key)) {
              problems.add('${field.id}: strength given for unpicked feeling "$key"');
            }
            if (value is! int || value < 0 || value > 10) {
              problems.add('${field.id}.strength.$key: must be a whole number between 0 and 10');
            }
          });
        }
      case 'row_list':
        if (answer is! List) {
          problems.add('${field.id}: must be a list of rows');
          break;
        }
        final max = field.maxRows ?? 25;
        if (answer.length > max) problems.add('${field.id}: at most $max rows');
        if (answer.length < field.minRows) {
          problems.add('${field.id}: at least ${field.minRows} rows');
        }
        for (final row in answer) {
          if (row is! Map) {
            problems.add('${field.id}: rows must be objects');
            break;
          }
          for (final column in field.columns) {
            final value = row[column.id];
            if (value == null) continue;
            if (column.type == 'text' && value is! String) {
              problems.add('${field.id}.${column.id}: must be text');
            }
            if (column.type == 'scale_0_10' && (value is! int || value < 0 || value > 10)) {
              problems.add('${field.id}.${column.id}: must be a whole number between 0 and 10');
            }
          }
        }
      case 'datetime':
        if (answer is! String) {
          problems.add('${field.id}: must be a date or date-time string');
          break;
        }
        final parts = answer.split('T');
        if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(parts.first)) {
          problems.add('${field.id}: date must be YYYY-MM-DD');
        }
        if (parts.length > 1 && !RegExp(r'^([01]\d|2[0-3]):[0-5]\d$').hasMatch(parts[1])) {
          problems.add('${field.id}: time must be HH:mm');
        }
    }
  }

  for (final key in answers.keys) {
    WorksheetField? field;
    for (final candidate in content.fields) {
      if (candidate.id == key) {
        field = candidate;
        break;
      }
    }
    if (field == null) {
      problems.add('$key: not a piece of this worksheet');
    } else if (!isFieldVisible(field, answers)) {
      // The branch flipped after this was written; it is not part of this
      // submission and must not travel with it.
      problems.add('$key: answered but not shown for the branch taken');
    }
  }

  return problems;
}

/// The draft a closed app comes back to: the answers, the step they were on,
/// and when it was last touched. Stored on the phone, never uploaded until the
/// client finishes.
class WorksheetDraft {
  const WorksheetDraft({
    required this.answers,
    required this.stepIndex,
    required this.updatedAt,
  });

  final WorksheetAnswers answers;
  final int stepIndex;
  final DateTime updatedAt;

  Map<String, Object?> toJson() => {
        'answers': answers,
        'step_index': stepIndex,
        'updated_at': updatedAt.toIso8601String(),
      };

  static WorksheetDraft? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final answers = raw['answers'];
    if (answers is! Map) return null;
    return WorksheetDraft(
      answers: answers.map((key, value) => MapEntry(key.toString(), value)),
      stepIndex: raw['step_index'] is int ? raw['step_index'] as int : 0,
      updatedAt: raw['updated_at'] is String
          ? DateTime.tryParse(raw['updated_at'] as String) ?? DateTime.now()
          : DateTime.now(),
    );
  }
}

/// A finished worksheet as plain text, for the Treasure Box.
///
/// The answers are the client's own words, laid out under the prompts they
/// answered, so a kept thought record still reads as a thought record months
/// later. Only the pieces that are actually on screen for the answers given are
/// included — a branch the client never saw is not something they wrote.
///
/// Long answers are cut at 5000 characters, which is the Treasure Box's note
/// limit: the note is a keepsake, and the full response is already stored
/// against the worksheet itself.
const int treasureNoteMaxLength = 5000;

String worksheetAsNoteText(WorksheetContent content, WorksheetAnswers answers) {
  final blocks = <String>[];

  for (final field in visibleFields(content, answers)) {
    if (field.type == 'instruction') continue;
    final text = _answerAsText(field, answers[field.id]);
    if (text == null || text.trim().isEmpty) continue;
    blocks.add('${field.prompt}\n${text.trim()}');
  }

  final joined = blocks.join('\n\n');
  if (joined.length <= treasureNoteMaxLength) return joined;
  return '${joined.substring(0, treasureNoteMaxLength - 1)}…';
}

String? _answerAsText(WorksheetField field, Object? value) {
  if (value == null) return null;

  String labelFor(String raw) {
    for (final option in field.options) {
      if (option.value == raw) return option.label;
    }
    for (final feeling in field.feelings) {
      if (feeling.id == raw) return feeling.label;
    }
    return raw;
  }

  if (value is String) return value;
  if (value is int) return '$value';

  if (value is List) {
    if (value.isEmpty) return null;
    // row_list: each row is a map keyed by column id.
    if (value.first is Map) {
      final rows = <String>[];
      for (final row in value.whereType<Map>()) {
        final cells = <String>[];
        for (final column in field.columns) {
          final cell = row[column.id];
          if (cell == null) continue;
          if (cell is String && cell.trim().isEmpty) continue;
          cells.add(
            field.columns.length > 1 ? '${column.label}: $cell' : '$cell',
          );
        }
        if (cells.isNotEmpty) rows.add(cells.join(' · '));
      }
      return rows.isEmpty ? null : rows.join('\n');
    }
    return value.map((entry) => labelFor(entry.toString())).join(', ');
  }

  if (value is Map) {
    final picked = value['picked'];
    if (picked is List) {
      final strength = value['strength'];
      return picked.map((id) {
        final label = labelFor(id.toString());
        if (strength is Map && strength[id] is int) {
          return '$label (${strength[id]}/10)';
        }
        return label;
      }).join(', ');
    }
  }

  return value.toString();
}
