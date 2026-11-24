import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/providers.dart';
import '../../theme/app_colors.dart';
import 'library_api.dart';
import '../sharing/sharing.dart';
import '../my_space/my_space_providers.dart';
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

    void retry() => ref.invalidate(libraryEntryProvider(key));

    // The order of these checks is the fix for "it spins and spins".
    //
    // The api answers a demanding worksheet with 403 DEMANDING_GATE in about
    // ten milliseconds — the refusal is a sentence for the client, not a
    // failure. But a provider that throws is a *retried* provider in Riverpod
    // 3 (ten attempts, 200 ms doubling, capped at 6.4 s), and a provider that
    // is between retries still reports `isLoading`. Reading `isLoading` first
    // therefore painted a spinner over the refusal for the better part of a
    // minute, and the client's very reasonable report was "it is loading and
    // loading". An error wins over a loading state here.
    if (entryAsync.hasError) {
      final error = entryAsync.error;
      final refusal =
          error is DioException ? LibraryApi.refusalFrom(error) : null;
      return _RefusalScreen(
        code: refusal?.code,
        message: refusal?.message ?? '',
        onRetry: retry,
      );
    }

    if (!entryAsync.hasValue) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    final result = entryAsync.requireValue;
    if (result is LibraryEntryRefused) {
      return _RefusalScreen(
        code: result.code,
        message: result.message,
        onRetry: retry,
      );
    }

    final entry = (result as LibraryEntryReady).entry;
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
        personalNote: entry.personalNote,
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

          // "Keep it privately / Delete it": the worksheet body declares which
          // answer means discard (closing.discardWhen), so no screen hard-codes a
          // field id. Deleting uses the same endpoint as the client's own Past me,
          // and only the content-free safety flag stays behind.
          final discard = content.closing?.discardWhen;
          final discardAnswer = discard == null ? null : answers[discard.field];
          final discardIt =
              discard != null && discardAnswer is String && discard.values.contains(discardAnswer);
          var discardFailed = false;
          if (discardIt && responseId != null) {
            final deleted = await ref.read(myDataProvider.notifier).deleteItem(
                  kind: 'worksheet_response',
                  id: responseId!,
                );
            if (deleted) {
              responseId = null;
            } else {
              discardFailed = true;
            }
          }

          // Saved. Only now is the local draft safe to drop.
          await WorksheetDraftStore().clear(uid, entry.toolId);

          if (!context.mounted) return;
          if (discardFailed) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text(
                  "Couldn't delete that just now. You can delete it from Past me.",
                ),
              ),
            );
          }
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
          } else if (entry.accessMode == 'assigned' && responseId != null && !discardIt) {
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
        onSaveToTreasureBox: () async {
          final kept = await ref.read(libraryApiProvider).saveToTreasureBox(
                title: entry.label,
                body: worksheetAsNoteText(content, savedAnswers),
                sourceRef: responseId,
              );
          if (kept.showHelp) {
            ref.read(crisisOverlayProvider.notifier).show();
          }
          return kept.ok;
        },
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
  }
}

/// The api's refusal, rendered.
///
/// DEMANDING_GATE shows the approved message and the grounding offer, with the
/// worksheet body never fetched. Anything else (a hidden safety plan, an unknown
/// id, a network failure) reads as "not ready to open yet" — a client only
/// reaches one of those through a stale link, or through the network.
///
/// One widget for both entry paths on purpose: a refusal the api answered and a
/// refusal that arrived as a thrown DioException must look identical on screen,
/// or the same refusal says two different things depending on how it arrived.
class _RefusalScreen extends StatelessWidget {
  const _RefusalScreen({
    required this.code,
    required this.message,
    required this.onRetry,
  });

  /// The api's error code, when it gave one. Null for a failure.
  final String? code;

  /// The api's own sentence, when it gave one.
  final String message;

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    if (code == 'DEMANDING_GATE') {
      final text = message.isNotEmpty
          ? message
          : 'It sounds like a lot is going on right now. This one works best when '
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
                  text,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      color: AppColors.charcoalInk, height: 1.6),
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
    FutureProvider.family<LibraryEntryResult, String>((ref, key) {
  final parts = key.split('|');
  final toolId = parts.first;
  final feelingNow =
      parts.length > 1 && parts[1].isNotEmpty ? int.tryParse(parts[1]) : null;
  return ref.watch(libraryApiProvider).entry(toolId, feelingNow: feelingNow);
});
