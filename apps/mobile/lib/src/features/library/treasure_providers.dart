import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

/// The Treasure Box: the client's own place for things worth keeping.
///
/// One model for one note, whatever it came from. `sourceLabel` and
/// `shareLabel` are resolved by the api — the app never composes a provenance
/// or consent label of its own, so a new source cannot appear on screen as raw
/// enum text.
class TreasureNote {
  const TreasureNote({
    required this.id,
    required this.title,
    required this.body,
    required this.source,
    required this.sourceLabel,
    required this.collectionId,
    required this.tags,
    required this.pinned,
    required this.shared,
    required this.createdAt,
  });

  final String id;
  final String? title;
  final String body;
  final String source;
  final String sourceLabel;
  final String? collectionId;
  final List<String> tags;
  final bool pinned;
  final bool shared;
  final DateTime createdAt;

  factory TreasureNote.fromJson(Map<String, dynamic> json) {
    final rawTags = json['tags'];
    return TreasureNote(
      id: json['id'] as String,
      title: json['title'] as String?,
      body: json['body'] as String? ?? '',
      source: json['source'] as String? ?? 'self',
      sourceLabel: json['sourceLabel'] as String? ?? 'Me',
      collectionId: json['collection_id'] as String?,
      tags: rawTags is List ? rawTags.whereType<String>().toList() : const [],
      pinned: json['pinned'] as bool? ?? false,
      shared: json['shared_with_therapist'] as bool? ?? false,
      createdAt:
          DateTime.tryParse(json['created_at'] as String? ?? '') ?? DateTime.now(),
    );
  }
}

class TreasureCollection {
  const TreasureCollection({
    required this.id,
    required this.name,
    required this.systemKey,
    required this.count,
  });

  final String id;
  final String name;
  final String? systemKey;
  final int count;

  factory TreasureCollection.fromJson(Map<String, dynamic> json) {
    return TreasureCollection(
      id: json['id'] as String,
      name: json['name'] as String? ?? 'Collection',
      systemKey: json['system_key'] as String?,
      count: json['count'] as int? ?? 0,
    );
  }
}

/// What the box currently shows. Filters are sent to the api rather than
/// applied here, so "search" means the same thing on every screen size and the
/// app never holds a second, divergent copy of the rules.
class TreasureQuery {
  const TreasureQuery({this.q, this.tag, this.collectionId, this.pinnedOnly = false});

  final String? q;
  final String? tag;
  final String? collectionId;
  final bool pinnedOnly;

  bool get isFiltered =>
      (q?.isNotEmpty ?? false) || tag != null || collectionId != null || pinnedOnly;

  Map<String, dynamic> get params => {
        if (q != null && q!.isNotEmpty) 'q': q,
        if (tag != null) 'tag': tag,
        if (collectionId != null) 'collectionId': collectionId,
        if (pinnedOnly) 'pinned': '1',
      };

  @override
  bool operator ==(Object other) =>
      other is TreasureQuery &&
      other.q == q &&
      other.tag == tag &&
      other.collectionId == collectionId &&
      other.pinnedOnly == pinnedOnly;

  @override
  int get hashCode => Object.hash(q, tag, collectionId, pinnedOnly);
}

class TreasureResponse {
  const TreasureResponse({
    required this.collections,
    required this.tags,
    required this.notes,
  });

  final List<TreasureCollection> collections;
  final List<String> tags;
  final List<TreasureNote> notes;

  static const empty = TreasureResponse(collections: [], tags: [], notes: []);

  factory TreasureResponse.fromJson(Map<String, dynamic> data) {
    final rawCollections = data['collections'];
    final rawTags = data['tags'];
    final rawNotes = data['notes'];
    return TreasureResponse(
      collections: rawCollections is List
          ? rawCollections
              .whereType<Map<String, dynamic>>()
              .map(TreasureCollection.fromJson)
              .toList()
          : const [],
      tags: rawTags is List ? rawTags.whereType<String>().toList() : const [],
      notes: rawNotes is List
          ? rawNotes.whereType<Map<String, dynamic>>().map(TreasureNote.fromJson).toList()
          : const [],
    );
  }
}

final treasureProvider =
    FutureProvider.autoDispose.family<TreasureResponse, TreasureQuery>((ref, query) async {
  final dio = ref.read(dioClientProvider);
  final response = await dio.get<Map<String, dynamic>>(
    '/treasure',
    queryParameters: query.params.isEmpty ? null : query.params,
  );
  return TreasureResponse.fromJson(response.data ?? const <String, dynamic>{});
});

/// What one save came back with.
///
/// `showHelp` is the crisis card, raised after the note is saved; `helpOffer`
/// is the gentle "help is here" when the check could not run. Both are the
/// same two outcomes chat produces, because it is the same check.
class TreasureSaveOutcome {
  const TreasureSaveOutcome({
    required this.ok,
    this.showHelp = false,
    this.helpOffer = false,
    this.id,
  });

  final bool ok;
  final bool showHelp;
  final bool helpOffer;
  final String? id;

  static const failed = TreasureSaveOutcome(ok: false);
}

/// Every write the box offers, in one notifier, so each one calls exactly one
/// api route and refreshes exactly the same list.
class TreasureActions extends Notifier<void> {
  @override
  void build() {}

  Future<TreasureSaveOutcome> create({
    String? title,
    required String body,
    List<String> tags = const [],
    String? collectionId,
    String source = 'self',
    String? sourceRef,
  }) async {
    final dio = ref.read(dioClientProvider);
    try {
      final response = await dio.post<Map<String, dynamic>>(
        '/treasure/notes',
        data: {
          if (title != null && title.trim().isNotEmpty) 'title': title.trim(),
          'body': body,
          if (tags.isNotEmpty) 'tags': tags,
          if (collectionId != null) 'collectionId': collectionId,
          'source': source,
          if (sourceRef != null) 'sourceRef': sourceRef,
        },
      );
      final data = response.data ?? const <String, dynamic>{};
      final safety = data['safety'];
      return TreasureSaveOutcome(
        ok: true,
        id: data['id'] as String?,
        showHelp: safety is Map && safety['showHelp'] == true,
        helpOffer: safety is Map && safety['helpOffer'] == true,
      );
    } on DioException {
      return TreasureSaveOutcome.failed;
    }
  }

  Future<TreasureSaveOutcome> update({
    required String id,
    String? title,
    String? body,
    List<String>? tags,
    String? collectionId,
    bool clearCollection = false,
    bool? pinned,
  }) async {
    final dio = ref.read(dioClientProvider);
    try {
      final response = await dio.patch<Map<String, dynamic>>(
        '/treasure/notes/$id',
        data: {
          if (title != null) 'title': title,
          if (body != null) 'body': body,
          if (tags != null) 'tags': tags,
          if (clearCollection) 'collectionId': null,
          if (!clearCollection && collectionId != null) 'collectionId': collectionId,
          if (pinned != null) 'pinned': pinned,
        },
      );
      final data = response.data ?? const <String, dynamic>{};
      final safety = data['safety'];
      return TreasureSaveOutcome(
        ok: true,
        showHelp: safety is Map && safety['showHelp'] == true,
        helpOffer: safety is Map && safety['helpOffer'] == true,
      );
    } on DioException {
      return TreasureSaveOutcome.failed;
    }
  }

  Future<bool> setPinned({required String id, required bool pinned}) async {
    final outcome = await update(id: id, pinned: pinned);
    return outcome.ok;
  }

  Future<bool> delete(String id) async {
    final dio = ref.read(dioClientProvider);
    try {
      await dio.delete<void>('/treasure/notes/$id');
      return true;
    } on DioException {
      return false;
    }
  }

  /// One pinned note at random. Null means there is nothing pinned yet.
  Future<TreasureNote?> pickOne() async {
    final dio = ref.read(dioClientProvider);
    try {
      final response = await dio.get<Map<String, dynamic>>('/treasure/pick');
      final raw = response.data?['note'];
      if (raw is! Map<String, dynamic>) return null;
      return TreasureNote.fromJson(raw);
    } on DioException {
      return null;
    }
  }

  Future<bool> createCollection(String name) async {
    final dio = ref.read(dioClientProvider);
    try {
      await dio.post<Map<String, dynamic>>('/treasure/collections', data: {'name': name});
      return true;
    } on DioException {
      return false;
    }
  }
}

final treasureActionsProvider = NotifierProvider<TreasureActions, void>(TreasureActions.new);

/// The small set of screens that save into the box from elsewhere: a journal
/// entry, one chat message, an exercise in the Library, a finished worksheet.
///
/// Each passes its own `source`, which is what the "Where it came from" line
/// reads back. The text is the client's own words wherever they exist; a
/// worksheet save passes the answers it kept.
class TreasureSaver {
  const TreasureSaver(this._ref);

  final Ref _ref;

  Future<TreasureSaveOutcome> saveFromJournal({
    required String entryId,
    required String body,
  }) {
    return _ref.read(treasureActionsProvider.notifier).create(
          body: body,
          source: 'journal',
          sourceRef: entryId,
        );
  }

  Future<TreasureSaveOutcome> saveFromChat({
    required String message,
    String? turnId,
  }) {
    return _ref.read(treasureActionsProvider.notifier).create(
          body: message,
          source: 'chat',
          sourceRef: turnId,
        );
  }

  Future<TreasureSaveOutcome> saveExercise({
    required String label,
    required String text,
    String? toolId,
  }) {
    return _ref.read(treasureActionsProvider.notifier).create(
          title: label,
          body: text,
          source: 'worksheet',
          sourceRef: toolId,
        );
  }
}

final treasureSaverProvider = Provider<TreasureSaver>(TreasureSaver.new);
