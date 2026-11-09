import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/providers.dart';
import '../../theme/app_colors.dart';
import 'library_api.dart';
import 'worksheet_runner_screen.dart';
import 'worksheet_spec.dart';

/// Loads one worksheet and runs it.
///
/// The body is validated twice on purpose: the api validates before it sends,
/// and `parseWorksheetContent` validates again on arrival. A body that fails
/// here is shown as "not ready yet" rather than half-drawn, because a client
/// halfway through a worksheet whose branch points nowhere would lose what they
/// wrote.
class WorksheetScreen extends ConsumerWidget {
  const WorksheetScreen({super.key, required this.toolId});

  final String toolId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entryAsync = ref.watch(libraryEntryProvider(toolId));
    final uid = ref.watch(authStateProvider).value?.uid ?? 'anonymous';

    return entryAsync.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (error, stack) => Scaffold(
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
                FilledButton(
                  onPressed: () => ref.invalidate(libraryEntryProvider(toolId)),
                  child: const Text('Try again'),
                ),
              ],
            ),
          ),
        ),
      ),
      data: (entry) {
        try {
          final content = parseWorksheetContent(entry.content);
          return WorksheetRunnerScreen(
            toolId: entry.toolId,
            userId: uid,
            content: content,
            onFinished: (_) => context.go('/library'),
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

final libraryEntryProvider =
    FutureProvider.family<LibraryEntry, String>((ref, toolId) {
  return ref.watch(libraryApiProvider).entry(toolId);
});
