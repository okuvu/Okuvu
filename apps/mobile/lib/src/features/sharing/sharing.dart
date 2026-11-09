import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/providers.dart';

/// One item, one share.
///
/// The owner's approved copy (Shared app copy, 9 Nov 2026):
///   label:            "Private" / "Shared with my therapist"
///   first share:      "Your therapist will be able to read this. You can stop
///                      sharing anytime."   buttons: Share / Cancel
///   after worksheet:  "Share this with your therapist?"  buttons: Share /
///                      Keep private, same size, neither chosen in advance.
///
/// The strings live here rather than in each screen because three screens show
/// them and a paraphrase in one of them is a different promise.

const String shareLabelPrivate = 'Private';
const String shareLabelShared = 'Shared with my therapist';
const String firstShareLine =
    'Your therapist will be able to read this. You can stop sharing anytime.';
const String worksheetSharePrompt = 'Share this with your therapist?';

String shareLabel(bool shared) => shared ? shareLabelShared : shareLabelPrivate;

/// The one preference that makes the confirmation a FIRST-time notice.
const String _seenKey = 'sharing_confirmation_seen';

class SharingNotifier extends Notifier<void> {
  @override
  void build() {}

  /// The notice is shown once per install. If the preference cannot be read we
  /// show it: an extra confirmation is a small cost, a missing one is not.
  Future<bool> shouldConfirmFirstShare() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return !(prefs.getBool(_seenKey) ?? false);
    } catch (_) {
      return true;
    }
  }

  Future<void> markFirstShareSeen() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_seenKey, true);
    } catch (_) {
      // The share itself must not depend on a local preference write.
    }
  }

  /// POST /sharing — the api is the only write path for either direction.
  Future<bool> setShared({
    required String kind,
    required String id,
    required bool shared,
  }) async {
    final dio = ref.read(dioClientProvider);
    try {
      await dio.post<Map<String, dynamic>>(
        '/sharing',
        data: {'kind': kind, 'id': id, 'shared': shared},
      );
      return true;
    } on DioException {
      return false;
    }
  }

  /// DELETE /me/items/:kind/:id — removes the row everywhere, because the
  /// portal reads that same row.
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

final sharingProvider = NotifierProvider<SharingNotifier, void>(SharingNotifier.new);

/// Shows the approved first-share notice. Returns true only on Share.
Future<bool> confirmFirstShare(BuildContext context) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: const Text('Share this'),
      content: const Text(firstShareLine),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(dialogContext).pop(false),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () => Navigator.of(dialogContext).pop(true),
          child: const Text('Share'),
        ),
      ],
    ),
  );
  return result ?? false;
}

/// The label chip on every entry and note. There are exactly two states, and
/// the app never invents a third ("pending", "seen", …).
class ShareLabel extends StatelessWidget {
  const ShareLabel({super.key, required this.shared});

  final bool shared;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      key: Key(shared ? 'share_label_shared' : 'share_label_private'),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: shared
            ? theme.colorScheme.primary.withValues(alpha: 0.10)
            : theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            shared ? Icons.people_outline : Icons.lock_outline,
            size: 12,
            color: shared
                ? theme.colorScheme.primary
                : theme.colorScheme.onSurfaceVariant,
          ),
          const SizedBox(width: 4),
          Text(
            shareLabel(shared),
            style: theme.textTheme.labelSmall?.copyWith(
              color: shared
                  ? theme.colorScheme.primary
                  : theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}
