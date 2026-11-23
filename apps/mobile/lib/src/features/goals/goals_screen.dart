import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../theme/app_colors.dart';
import '../../widgets/okuvu_app_bar_title.dart';
import 'goals_provider.dart';

/// Client-facing wording for the goals screen.
///
/// DRAFT — awaiting the clinical authority's approved wording. These are the
/// structural labels a goal list cannot run without (a title, a heading for the
/// goal in focus, a heading for the finished ones, one line saying what the
/// list is). The goal text itself is the therapist's own, written on the
/// portal's goals tab. Replacing any of this is this one class.
class GoalsCopy {
  static const title = 'Your goals';
  static const intro = 'These are the things you and your therapist are working on together.';
  static const focusLabel = 'Working on now';
  static const waitingLabel = 'Next';
  static const achievedLabel = 'Achieved';
  static const emptyTitle = 'No goals yet';
  static const emptyBody = 'When your therapist sets a goal, it will appear here.';
  static const loadError = "We couldn't load your goals.";
}

/// The client's goals, in the therapist's order: the one being worked on now
/// first, then the ones waiting their turn, then the ones already achieved.
///
/// Read-only by design. The clinical authority's rule (23 Nov 2026) is that the
/// therapist marks a goal achieved when the client gets there; the client's job
/// is to see them and know which one is current.
class GoalsScreen extends ConsumerWidget {
  const GoalsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final goalsAsync = ref.watch(goalsProvider);

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) context.go('/home');
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(LucideIcons.arrowLeft),
            onPressed: () => context.go('/home'),
          ),
          title: const OkuvuAppBarTitle(GoalsCopy.title),
        ),
        body: goalsAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, __) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(LucideIcons.cloudOff, size: 32),
                  const SizedBox(height: 12),
                  Text(
                    GoalsCopy.loadError,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: () => ref.invalidate(goalsProvider),
                    child: const Text('Try again'),
                  ),
                ],
              ),
            ),
          ),
          data: (data) {
            if (data.isEmpty) {
              return _EmptyGoals(theme: Theme.of(context));
            }

            final focus = data.focus;
            final waiting = data.waiting;
            final achieved = data.achieved;

            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
              children: [
                Text(
                  GoalsCopy.intro,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                ),
                const SizedBox(height: 16),
                if (focus != null) ...[
                  const _SectionLabel(GoalsCopy.focusLabel),
                  _GoalCard(goal: focus, highlighted: true),
                ],
                if (waiting.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  const _SectionLabel(GoalsCopy.waitingLabel),
                  for (final goal in waiting) _GoalCard(goal: goal),
                ],
                if (achieved.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  _SectionLabel(GoalsCopy.achievedLabel, count: achieved.length),
                  for (final goal in achieved) _GoalCard(goal: goal, achieved: true),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text, {this.count});

  final String text;
  final int? count;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 8),
      child: Text(
        count == null ? text : '$text ($count)',
        style: theme.textTheme.labelLarge?.copyWith(
          color: theme.colorScheme.onSurfaceVariant,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _GoalCard extends StatelessWidget {
  const _GoalCard({required this.goal, this.highlighted = false, this.achieved = false});

  final ClientGoal goal;
  final bool highlighted;
  final bool achieved;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      key: ValueKey('goal_${goal.id}'),
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: highlighted ? AppColors.lavenderWash : theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: highlighted ? AppColors.violet : AppColors.hairline),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Icon(
              achieved ? LucideIcons.check : LucideIcons.target,
              size: 16,
              color: achieved ? AppColors.sageDeep : AppColors.violet,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              goal.text,
              style: theme.textTheme.bodyMedium?.copyWith(
                // Achieved is a fact, not a failure: no strikethrough, no
                // faded-out text.
                fontWeight: highlighted ? FontWeight.w600 : FontWeight.w400,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyGoals extends StatelessWidget {
  const _EmptyGoals({required this.theme});

  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(LucideIcons.target, size: 32, color: theme.colorScheme.onSurfaceVariant),
            const SizedBox(height: 12),
            Text(GoalsCopy.emptyTitle, style: theme.textTheme.titleSmall),
            const SizedBox(height: 6),
            Text(
              GoalsCopy.emptyBody,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
