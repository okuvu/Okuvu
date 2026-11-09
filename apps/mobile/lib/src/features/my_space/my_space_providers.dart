import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

/// "My toolkit" — the exercises the client marked as helping.
///
/// Not a completion count and not a streak: a list of things that worked
/// before, offered for the next hard day. The api groups by worksheet and
/// answers only with rows where `helped = true`.
class ToolkitItem {
  const ToolkitItem({
    required this.toolId,
    required this.label,
    required this.summary,
    required this.timesHelpful,
    required this.lastHelpedAt,
  });

  final String toolId;
  final String label;
  final String? summary;
  final int timesHelpful;
  final DateTime lastHelpedAt;

  factory ToolkitItem.fromJson(Map<String, dynamic> json) {
    return ToolkitItem(
      toolId: json['toolId'] as String,
      label: json['label'] as String? ?? 'An exercise',
      summary: json['summary'] as String?,
      timesHelpful: json['timesHelpful'] as int? ?? 1,
      lastHelpedAt: DateTime.tryParse(json['lastHelpedAt'] as String? ?? '') ?? DateTime.now(),
    );
  }
}

final toolkitProvider = FutureProvider.autoDispose<List<ToolkitItem>>((ref) async {
  final dio = ref.read(dioClientProvider);
  final response = await dio.get<Map<String, dynamic>>('/toolkit');
  final raw = response.data?['items'];
  if (raw is! List) return const [];
  return raw
      .whereType<Map<String, dynamic>>()
      .map(ToolkitItem.fromJson)
      .toList();
});

/// One row in "Past me": a journal entry or a worksheet answer, in the
/// client's own timeline.
class PastMeItem {
  const PastMeItem({
    required this.kind,
    required this.id,
    required this.at,
    required this.toolId,
    required this.toolLabel,
    required this.excerpt,
    required this.shared,
    required this.feelingBefore,
    required this.feelingAfter,
  });

  final String kind;
  final String id;
  final DateTime at;
  final String? toolId;
  final String? toolLabel;
  final String excerpt;
  final bool shared;
  final int? feelingBefore;
  final int? feelingAfter;

  bool get isJournal => kind == 'journal_entry';

  factory PastMeItem.fromJson(Map<String, dynamic> json) {
    return PastMeItem(
      kind: json['kind'] as String? ?? 'journal_entry',
      id: json['id'] as String,
      at: DateTime.tryParse(json['at'] as String? ?? '') ?? DateTime.now(),
      toolId: json['toolId'] as String?,
      toolLabel: json['toolLabel'] as String?,
      excerpt: json['excerpt'] as String? ?? '',
      shared: json['shared'] as bool? ?? false,
      feelingBefore: json['feelingBefore'] as int?,
      feelingAfter: json['feelingAfter'] as int?,
    );
  }
}

class PastMeFilter {
  const PastMeFilter({required this.toolId, required this.label, required this.count});

  final String? toolId;
  final String label;
  final int count;

  factory PastMeFilter.fromJson(Map<String, dynamic> json) {
    return PastMeFilter(
      toolId: json['toolId'] as String?,
      label: json['label'] as String? ?? 'Everything',
      count: json['count'] as int? ?? 0,
    );
  }
}

class PastMeResponse {
  const PastMeResponse({required this.items, required this.filters});

  final List<PastMeItem> items;
  final List<PastMeFilter> filters;
}

/// Keyed by the filter's tool id (null = everything, 'journal_entry' = journal
/// only), so switching a chip fetches that view rather than filtering locally —
/// the api decides what is in the timeline, including the excerpt length.
final pastMeProvider =
    FutureProvider.autoDispose.family<PastMeResponse, String?>((ref, toolId) async {
  final dio = ref.read(dioClientProvider);
  final response = await dio.get<Map<String, dynamic>>(
    '/past-me',
    queryParameters: toolId == null ? null : {'toolId': toolId},
  );
  final data = response.data ?? const <String, dynamic>{};
  final rawItems = data['items'];
  final rawFilters = data['filters'];
  return PastMeResponse(
    items: rawItems is List
        ? rawItems.whereType<Map<String, dynamic>>().map(PastMeItem.fromJson).toList()
        : const [],
    filters: rawFilters is List
        ? rawFilters.whereType<Map<String, dynamic>>().map(PastMeFilter.fromJson).toList()
        : const [],
  );
});

/// The client's own data: export and per-item delete.
///
/// Both are their own rows only. Export is a read of exactly what the api will
/// give back for `GET /me/export`; delete is the same statement the journal
/// screen's trash icon uses, which is why a deleted item leaves the portal too.
class MyDataNotifier extends Notifier<void> {
  @override
  void build() {}

  /// The readable copy: the api writes one plain-text document, in date order,
  /// with a heading per item. The JSON export stays available for a machine
  /// copy; this is the one a person opens on their phone.
  Future<String?> exportText() async {
    final dio = ref.read(dioClientProvider);
    try {
      final response = await dio.get<dynamic>(
        '/me/export/document',
        options: Options(responseType: ResponseType.plain),
      );
      final data = response.data;
      return data is String && data.trim().isNotEmpty ? data : null;
    } on DioException {
      return null;
    }
  }

  Future<bool> deleteItem({required String kind, required String id}) async {
    final dio = ref.read(dioClientProvider);
    try {
      await dio.delete<void>('/me/items/$kind/$id');
      return true;
    } on DioException {
      return false;
    }
  }
}

final myDataProvider = NotifierProvider<MyDataNotifier, void>(MyDataNotifier.new);
