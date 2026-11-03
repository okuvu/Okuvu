import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/providers.dart';
import 'past_session.dart';

/// The user's past conversations, newest first.
///
/// `autoDispose` because the list is only read while the Past conversations
/// screen is open — leaving it should not keep a copy of every transcript
/// summary in memory.
final sessionHistoryProvider =
    FutureProvider.autoDispose<List<PastSession>>((ref) async {
  final dio = ref.read(dioClientProvider);
  final response = await dio.get('/sessions');

  final sessions = (response.data['sessions'] as List? ?? const [])
      .map((s) => PastSession.fromJson(s as Map<String, dynamic>))
      .toList();

  return sessions;
});

/// One conversation, read back in full. Keyed by session id.
final sessionTranscriptProvider = FutureProvider.autoDispose
    .family<SessionTranscript, String>((ref, sessionId) async {
  final dio = ref.read(dioClientProvider);
  final response = await dio.get('/sessions/$sessionId');

  return SessionTranscript.fromJson(response.data as Map<String, dynamic>);
});
