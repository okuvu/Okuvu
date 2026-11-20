import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'session_sharing_provider.dart';
import '../../widgets/okuvu_app_bar_title.dart';
import '../../theme/app_colors.dart';

/// Per-session sharing — the layer under Privacy & Data's "Share session
/// summaries" switch.
///
/// The switch answers "may my therapist read summaries at all". This screen
/// answers "not that one". Deliberately shows dates and switches only: the
/// client already has the conversation, and the summary is the therapist's
/// reading of it, so there is no summary text to show here.
class SessionSharingScreen extends ConsumerWidget {
  const SessionSharingScreen({super.key});

  static const _months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  String _formatDate(DateTime dt) {
    final local = dt.toLocal();
    final hh = local.hour.toString().padLeft(2, '0');
    final mm = local.minute.toString().padLeft(2, '0');
    return '${local.day} ${_months[local.month - 1]} ${local.year}, $hh:$mm';
  }

  String _statusLabel(String status) {
    switch (status) {
      case 'COMPLETED':
        return 'Summary ready';
      case 'PENDING':
        return 'Summary being written';
      case 'FAILED':
        return 'Could not be written';
      case 'SKIPPED_TRIVIAL':
        return 'Too short to summarise';
      default:
        return 'Summary unavailable';
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final state = ref.watch(sessionSharingProvider);

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) context.go('/settings/privacy');
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(LucideIcons.arrowLeft),
            onPressed: () => context.go('/settings/privacy'),
          ),
          title: const OkuvuAppBarTitle('Session summaries'),
        ),
        body: state.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, __) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    "Couldn't load your sessions.",
                    style: theme.textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: () => ref.invalidate(sessionSharingProvider),
                    child: const Text('Try again'),
                  ),
                ],
              ),
            ),
          ),
          data: (data) {
            final name = data.therapistName;
            return RefreshIndicator(
              onRefresh: () async => ref.refresh(sessionSharingProvider.future),
              child: ListView(
                padding: const EdgeInsets.symmetric(vertical: 8),
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                    child: Text(
                      name == null
                          ? 'Choose which sessions can be shared. Nothing is shared '
                              'until a therapist is linked to your care.'
                          : 'Choose which sessions $name can read a summary of. '
                              'Turning one off keeps that session private, even while '
                              'summaries overall are shared.',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                  if (!data.relationshipOpen)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                      child: Container(
                        decoration: BoxDecoration(
                          color: AppColors.lavenderTint,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        padding: const EdgeInsets.all(12),
                        child: Text(
                          'Summaries are not being shared right now. Turn on '
                          '"Share session summaries" in Privacy & Data to choose '
                          'per session.',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: AppColors.royalPurple,
                          ),
                        ),
                      ),
                    ),
                  if (data.sessions.isEmpty)
                    Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        'No sessions yet. Once you have a session, it appears here '
                        'so you can decide about it.',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  for (final session in data.sessions)
                    _SessionRow(
                      label: _formatDate(session.startedAt),
                      status: _statusLabel(session.status),
                      shared: session.shared,
                      enabled: data.relationshipOpen,
                      onChanged: (value) async {
                        final ok = await ref
                            .read(sessionShareProvider.notifier)
                            .setShared(sessionId: session.sessionId, shared: value);
                        if (!ok && context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text("Couldn't save that. Please try again."),
                            ),
                          );
                        }
                      },
                      theme: theme,
                    ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class _SessionRow extends StatelessWidget {
  final String label;
  final String status;
  final bool shared;
  final bool enabled;
  final ValueChanged<bool> onChanged;
  final ThemeData theme;

  const _SessionRow({
    required this.label,
    required this.status,
    required this.shared,
    required this.enabled,
    required this.onChanged,
    required this.theme,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Container(
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: theme.colorScheme.outlineVariant),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    status,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
            Switch(
              value: shared,
              onChanged: enabled ? onChanged : null,
              activeThumbColor: AppColors.violet,
            ),
          ],
        ),
      ),
    );
  }
}
