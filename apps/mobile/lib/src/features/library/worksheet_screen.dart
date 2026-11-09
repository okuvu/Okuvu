import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/providers.dart';
import '../../theme/app_colors.dart';
import 'library_api.dart';
import '../sharing/sharing.dart';
import 'worksheet_draft_store.dart';
import 'worksheet_runner_screen.dart';
import 'worksheet_spec.dart';

/// Loads one worksheet and runs it.
///
/// The body is validated twice on purpose: the api validates before it sends,
/// and `parseWorksheetContent` validates again on arrival. A body that fails
/// here is shown as "not ready yet" rather than half-drawn, because a client
/// halfway through a worksheet whose branch points nowhere would lose what they
/// wrote.
///
/// Two rules arrive here from the api and are rendered rather than second-
/// guessed:
///
///  * a demanding worksheet needs the gate answer (`feelingNow`) — the question
///    is asked on the Library card, and the api refuses an unanswered request;
///  * a refusal above the threshold comes back as DEMANDING_GATE with the
///    approved copy, and the client is offered grounding instead.
class WorksheetScreen extends ConsumerWidget {
  const WorksheetScreen({super.key, required this.toolId, this.feelingNow});

  final String toolId;

  /// The answer to "How strong is what you're feeling right now?", 0-10.
  final int? feelingNow;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final key = '$toolId|${feelingNow ?? ''}';
    final entryAsync = ref.watch(libraryEntryProvider(key));
    final uid = ref.watch(authStateProvider).value?.uid ?? 'anonymous';

    return entryAsync.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (error, stack) => _GateOrError(
        error: error,
        onRetry: () => ref.invalidate(libraryEntryProvider(key)),
      ),
      data: (entry) {
        try {
          final content = parseWorksheetContent(entry.content);
          // The saved response id, so "Save to my Treasure Box" can point at the
          // row it came from. Null until the answers are stored.
          String? responseId;
          Map<String, Object?> savedAnswers = const {};

          return WorksheetRunnerScreen(
            toolId: entry.toolId,
            userId: uid,
            content: content,
            feelingBefore: feelingNow,
            isAssigned: entry.accessMode == 'assigned',
            onFinished: (answers, outcome) async {
              final api = ref.read(libraryApiProvider);
              savedAnswers = Map<String, Object?>.from(answers);

              // The api runs the same safety check chat runs, before it stores
              // anything, and answers with whether the help card must be shown.
              final result = await api.submit(
                entry.toolId,
                answers: Map<String, Object?>.from(answers),
                feelingBefore: outcome.feelingBefore ?? feelingNow,
                feelingAfter: outcome.feelingAfter,
                barriers: outcome.barriers,
                helped: outcome.helped,
              );
              responseId = result.id.isEmpty ? null : result.id;

              // Saved. Only now is the local draft safe to drop.
              await WorksheetDraftStore().clear(uid, entry.toolId);

              if (!context.mounted) return;
              if (result.showHelp) {
                // Crisis: the answers are saved, and the card comes up at once.
                ref.read(crisisOverlayProvider.notifier).show();
              } else if (result.helpOffer) {
                // The check could not run. Moderate concern, never a crisis and
                // never silence: help is offered, and nobody is alerted until a
                // recheck finds risk.
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: const Text('Help is here if you need it.'),
                    duration: const Duration(seconds: 8),
                    action: SnackBarAction(
                      label: 'Get help',
                      onPressed: () =>
                          ref.read(crisisOverlayProvider.notifier).show(),
                    ),
                  ),
                );
              } else if (entry.accessMode == 'assigned' && responseId != null) {
                // Owner's rule: after an assigned worksheet, ask whether to
                // share it. Two equal buttons, neither chosen in advance, and
                // nothing happens unless the client taps one. Not asked after a
                // crisis or an unscreened save — help comes first.
                final share = await showDialog<bool>(
                  context: context,
                  barrierDismissible: false,
                  builder: (dialogContext) => AlertDialog(
                    title: const Text(worksheetSharePrompt),
                    actions: [
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              key: const Key('worksheet_share_keep_private'),
                              onPressed: () => Navigator.of(dialogContext).pop(false),
                              child: const Text('Keep private'),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: FilledButton(
                              key: const Key('worksheet_share_share'),
                              onPressed: () => Navigator.of(dialogContext).pop(true),
                              child: const Text('Share'),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                );
                if (share == true) {
                  final ok = await ref.read(sharingProvider.notifier).setShared(
                        kind: 'worksheet_response',
                        id: responseId!,
                        shared: true,
                      );
                  if (!ok && context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text("Couldn't share that. Please try again."),
                      ),
                    );
                  }
                }
              }
            },
            onSaveToTreasureBox: () => ref.read(libraryApiProvider).saveToTreasureBox(
                  title: entry.label,
                  body: worksheetAsNoteText(content, savedAnswers),
                  sourceRef: responseId,
                ),
          );
        } on WorksheetContentException catch (error) {
          return Scaffold(
            appBar: AppBar(
              leading: IconButton(
                icon: const Icon(LucideIcons.arrowLeft),
                onPressed: () => context.pop(),
              ),
              title: Text(entry.label),
            ),
            body: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  "This one isn't ready yet. Nothing you wrote has been lost "
                  'elsewhere in the app.\n\n${error.problems.take(3).join('\n')}',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppColors.charcoalInk, height: 1.5),
                ),
              ),
            ),
          );
        }
      },
    );
  }
}

/// The two refusals that are not errors.
///
/// DEMANDING_GATE shows the approved message and the grounding offer, with the
/// worksheet body never fetched. Anything else (a hidden safety plan, an unknown
/// id, a network failure) reads as "not ready to open yet" — a client only
/// reaches one of those through a stale link.
class _GateOrError extends StatelessWidget {
  const _GateOrError({required this.error, required this.onRetry});

  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final response = error is DioException ? (error as DioException).response : null;
    final data = response?.data;
    final errorBody = data is Map ? data['error'] : null;
    final code = errorBody is Map ? errorBody['code'] : null;

    if (code == 'DEMANDING_GATE') {
      final message = (errorBody is Map ? errorBody['message'] as String? : null) ??
          'It sounds like a lot is going on right now. This one works best when '
              'things feel a bit steadier. Want to try something calming first? '
              'You can come back to it anytime.';
      return Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(LucideIcons.arrowLeft),
            onPressed: () => context.pop(),
          ),
          title: const Text('Library'),
        ),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(LucideIcons.heartHandshake, size: 32),
                const SizedBox(height: 16),
                Text(
                  message,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppColors.charcoalInk, height: 1.6),
                ),
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: () => context.push('/library/grounding'),
                  child: const Text('Try grounding'),
                ),
                TextButton(
                  onPressed: () => context.pop(),
                  child: const Text('Maybe later'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft),
          onPressed: () => context.pop(),
        ),
        title: const Text('Library'),
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(LucideIcons.cloudOff, size: 32),
              const SizedBox(height: 12),
              const Text(
                "This one isn't ready to open yet. Try again in a moment.",
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              FilledButton(onPressed: onRetry, child: const Text('Try again')),
            ],
          ),
        ),
      ),
    );
  }
}

/// One worksheet body, keyed by tool id **and** the gate answer, so a second
/// attempt with a different answer fetches a fresh body rather than serving the
/// cached refusal.
final libraryEntryProvider =
    FutureProvider.family<LibraryEntry, String>((ref, key) {
  final parts = key.split('|');
  final toolId = parts.first;
  final feelingNow = parts.length > 1 && parts[1].isNotEmpty ? int.tryParse(parts[1]) : null;
  return ref.watch(libraryApiProvider).entry(toolId, feelingNow: feelingNow);
});
