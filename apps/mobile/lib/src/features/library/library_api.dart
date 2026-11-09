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
  });

  final String toolId;
  final String label;
  final String kind;

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

  Future<LibraryEntry> entry(String toolId) async {
    final res = await _dio.get<Map<String, dynamic>>('/library/$toolId');
    final body = res.data!;
    final content = body['content'];
    final children = body['children'];

    return LibraryEntry(
      toolId: body['toolId'] as String,
      label: body['label'] as String,
      kind: (body['kind'] as String?) ?? 'worksheet',
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
}

final libraryApiProvider = Provider<LibraryApi>((ref) {
  return LibraryApi(ref.watch(dioClientProvider));
});

final libraryCardsProvider = FutureProvider<List<LibraryCard>>((ref) {
  return ref.watch(libraryApiProvider).cards();
});
