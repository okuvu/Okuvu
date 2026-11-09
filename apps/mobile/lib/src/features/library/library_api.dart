import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

/// One card in the Library.
///
/// `available` is false when the therapist has not assigned a worksheet that
/// only opens after assignment. The card is still shown, so the client knows it
/// exists, but it does not open.
class LibraryCard {
  const LibraryCard({
    required this.toolId,
    required this.label,
    required this.summary,
    required this.section,
    required this.accessMode,
    required this.kind,
    required this.available,
    this.loadLevel,
    this.estMinutes,
  });

  final String toolId;
  final String label;
  final String? summary;
  final String? section;
  final String accessMode;
  final String kind;
  final bool available;
  final String? loadLevel;
  final int? estMinutes;
}

class LibraryChild {
  const LibraryChild({required this.toolId, required this.label, required this.summary});

  final String toolId;
  final String label;
  final String? summary;
}

class LibraryEntry {
  const LibraryEntry({
    required this.toolId,
    required this.label,
    required this.kind,
    required this.content,
    required this.children,
    this.accessMode = 'open',
  });

  final String toolId;
  final String label;
  final String kind;

  /// 'open' | 'assigned' | 'in_session'. Assigned worksheets ask the
  /// did-you-do-it question; the rest do not.
  final String accessMode;

  /// The worksheet body, validated on arrival by `parseWorksheetContent`.
  final Map<String, dynamic> content;
  final List<LibraryChild> children;
}

/// The Library, as the api serves it.
///
/// The client does not filter. Every rule about what may be shown (approved
/// only, hidden placeholders never, assignment gating) is enforced by the api,
/// and this class only carries what came back. A second filter here would be a
/// second set of rules that could disagree with the first.
class LibraryApi {
  LibraryApi(this._dio);

  final Dio _dio;

  Future<List<LibraryCard>> cards() async {
    final res = await _dio.get<Map<String, dynamic>>('/library');
    final raw = res.data?['cards'];
    if (raw is! List) return const [];

    return raw.whereType<Map<String, dynamic>>().map((card) {
      return LibraryCard(
        toolId: card['toolId'] as String,
        label: card['label'] as String,
        summary: card['summary'] as String?,
        section: card['section'] as String?,
        accessMode: (card['accessMode'] as String?) ?? 'open',
        kind: (card['kind'] as String?) ?? 'worksheet',
        available: card['available'] as bool? ?? true,
        loadLevel: card['loadLevel'] as String?,
        estMinutes: card['estMinutes'] as int?,
      );
    }).toList();
  }

  /// One worksheet body.
  ///
  /// `feelingNow` is the answer to the gate question, and the api requires it
  /// for a demanding worksheet: without it the request is refused
  /// (FEELING_NOT_GIVEN), and above 5 out of 10 it is refused with
  /// DEMANDING_GATE and the approved "try something calming first" copy. The
  /// gate lives on the server so a build that never asked the question still
  /// cannot open the worksheet.
  Future<LibraryEntry> entry(String toolId, {int? feelingNow}) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/library/$toolId',
      queryParameters: feelingNow == null ? null : {'feelingNow': feelingNow},
    );
    final body = res.data!;
    final content = body['content'];
    final children = body['children'];

    return LibraryEntry(
      toolId: body['toolId'] as String,
      label: body['label'] as String,
      kind: (body['kind'] as String?) ?? 'worksheet',
      accessMode: (body['accessMode'] as String?) ?? 'open',
      content: content is Map<String, dynamic>
          ? content
          : jsonDecode(jsonEncode(content)) as Map<String, dynamic>,
      children: children is List
          ? children.whereType<Map<String, dynamic>>().map((child) {
              return LibraryChild(
                toolId: child['toolId'] as String,
                label: child['label'] as String,
                summary: child['summary'] as String?,
              );
            }).toList()
          : const [],
    );
  }

  /// "What does this step mean?" — the reviewed AI explanation, or null.
  ///
  /// Null means the api refused (the review blocked the draft, the model was
  /// unavailable, or the step is not part of this worksheet). The caller says
  /// nothing rather than inventing a line: the step is already on screen.
  Future<String?> help(String toolId, String stepId) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/worksheets/$toolId/help',
        data: {'stepId': stepId},
      );
      final text = res.data?['text'];
      return text is String && text.trim().isNotEmpty ? text.trim() : null;
    } on DioException {
      return null;
    }
  }

  /// Hand a finished worksheet to the api.
  ///
  /// This is the only save path for a worksheet: the api runs the same safety
  /// check chat runs on every answer before it stores it, so a disclosure typed
  /// into a worksheet produces the help card and the therapist alert exactly as
  /// a chat message does. The client cannot skip it by not rendering anything —
  /// the check is inside the write.
  Future<WorksheetSubmitResult> submit(
    String toolId, {
    required Map<String, Object?> answers,
    int? feelingBefore,
    int? feelingAfter,
    String? barriers,
    bool? helped,
  }) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/worksheets/$toolId',
      data: {
        'answers': answers,
        if (feelingBefore != null) 'feelingBefore': feelingBefore,
        if (feelingAfter != null) 'feelingAfter': feelingAfter,
        if (barriers != null && barriers.trim().isNotEmpty) 'barriers': barriers.trim(),
        if (helped != null) 'helped': helped,
      },
    );
    final safety = res.data?['safety'];
    return WorksheetSubmitResult(
      id: (res.data?['id'] as String?) ?? '',
      showHelp: safety is Map && safety['showHelp'] == true,
      helpOffer: safety is Map && safety['helpOffer'] == true,
    );
  }

  /// Keep a finished worksheet in the client's Treasure Box.
  ///
  /// The note is a copy of the client's own answers, so it is client-typed text
  /// arriving at a write path — which is why it goes through POST /treasure/notes
  /// and not around it: that route runs the same safety check as everything
  /// else. `source_ref` points at the worksheet response it came from.
  Future<bool> saveToTreasureBox({
    required String title,
    required String body,
    String? sourceRef,
  }) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/treasure/notes',
        data: {
          'title': title,
          'body': body,
          'source': 'worksheet',
          if (sourceRef != null && sourceRef.isNotEmpty) 'sourceRef': sourceRef,
        },
      );
      return true;
    } on DioException {
      return false;
    }
  }
}

/// What the api answered when a finished worksheet was handed over.
class WorksheetSubmitResult {
  const WorksheetSubmitResult({
    required this.id,
    required this.showHelp,
    this.helpOffer = false,
  });

  final String id;

  /// The client's own words tripped the safety check: show the help card now.
  /// The answers are already saved; nothing is lost.
  final bool showHelp;

  /// The check could not run: moderate concern, not a crisis. Offer help
  /// ("Help is here if you need it.") and let the client carry on — the answers
  /// were saved and are screened again when the service is back.
  final bool helpOffer;
}

final libraryApiProvider = Provider<LibraryApi>((ref) {
  return LibraryApi(ref.watch(dioClientProvider));
});

final libraryCardsProvider = FutureProvider<List<LibraryCard>>((ref) {
  return ref.watch(libraryApiProvider).cards();
});