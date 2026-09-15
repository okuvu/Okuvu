import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'consent_provider.dart';
import '../home/providers/today_card_provider.dart';
import '../../widgets/okuvu_app_bar_title.dart';
import '../../theme/app_colors.dart';

class PrivacyDataScreen extends ConsumerWidget {
  const PrivacyDataScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final consentState = ref.watch(consentProvider);
    final notifier = ref.read(consentProvider.notifier);

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) context.go('/settings');
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(LucideIcons.arrowLeft),
            onPressed: () => context.go('/settings'),
          ),
          title: const OkuvuAppBarTitle('Privacy & Data'),
        ),
        body: consentState.isLoading
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.symmetric(vertical: 8),
                children: [
                  _ConsentSwitch(
                    icon: LucideIcons.shield,
                    title: 'Safety monitoring',
                    subtitle:
                        'Required to ensure a safe space during sensitive conversations.',
                    value: consentState.safetyMonitoring,
                    enabled: false,
                    theme: theme,
                  ),
                  _ConsentSwitch(
                    icon: LucideIcons.heart,
                    title: 'Mood understanding',
                    subtitle:
                        'Allows OKUVU to adapt its tone based on your emotional state.',
                    value: consentState.moodInference,
                    onChanged: (v) => notifier.setMoodInference(v),
                    theme: theme,
                  ),
                  _ConsentSwitch(
                    icon: LucideIcons.barChart2,
                    title: 'Progress tracking',
                    subtitle:
                        'Collects insights to show your growth over time.',
                    value: consentState.assessment,
                    onChanged: (v) => notifier.setAssessment(v),
                    theme: theme,
                  ),
                  _ConsentSwitch(
                    icon: LucideIcons.phone,
                    title: 'Emergency contact',
                    subtitle:
                        'Provides a trusted contact option directly within the app.',
                    value: consentState.emergencyContact,
                    onChanged: (v) => notifier.setEmergencyContact(v),
                    theme: theme,
                  ),
                  const _ChatAccessSwitch(),
                  Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 12,
                    ),
                    child: SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed:
                            (notifier.hasChanges && !consentState.isSaving)
                                ? () => notifier.save()
                                : null,
                        child: consentState.isSaving
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Text('Save Preferences'),
                      ),
                    ),
                  ),
                  if (consentState.error != null)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Text(
                        consentState.error!,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.error,
                        ),
                      ),
                    ),
                  const Divider(height: 32),
                  _DataRow(
                    icon: LucideIcons.download,
                    title: 'Download my data',
                    onTap: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content:
                              Text('Data export is coming soon.'),
                        ),
                      );
                    },
                    theme: theme,
                  ),
                  _DataRow(
                    icon: LucideIcons.shieldAlert,
                    title: 'Privacy Policy',
                    onTap: () => context.go('/settings/privacy-policy'),
                    theme: theme,
                  ),
                  _DataRow(
                    icon: LucideIcons.trash2,
                    title: 'Delete my account',
                    titleColor: theme.colorScheme.error,
                    iconColor: theme.colorScheme.error,
                    onTap: () => context.go('/settings/delete-account'),
                    theme: theme,
                  ),
                ],
              ),
      ),
    );
  }
}

/// App wireframes T3 — "Shared with your therapist: Chat summaries." The
/// only client-side control for chat_access_granted that supports revoking,
/// not just granting (the Home banner, PendingChatAccessBanner, only ever
/// grants). Hidden entirely when the client has no assigned therapist.
class _ChatAccessSwitch extends ConsumerStatefulWidget {
  const _ChatAccessSwitch();

  @override
  ConsumerState<_ChatAccessSwitch> createState() => _ChatAccessSwitchState();
}

class _ChatAccessSwitchState extends ConsumerState<_ChatAccessSwitch> {
  bool _isUpdating = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final access = ref.watch(todayCardProvider).value?.therapistChatAccess;

    if (access == null) return const SizedBox.shrink();

    Future<void> respond(bool granted) async {
      setState(() => _isUpdating = true);
      final success = await ref
          .read(chatAccessRequestProvider.notifier)
          .respond(therapistId: access.therapistId, granted: granted);
      if (!mounted) return;
      setState(() => _isUpdating = false);
      if (!success && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Couldn't save that. Please try again.")),
        );
      }
    }

    return _ConsentSwitch(
      icon: LucideIcons.messagesSquare,
      title: 'Chat summaries',
      subtitle:
          '${access.therapistName ?? 'Your therapist'} can read summaries of your conversations with OKUVU. Off by default — change this anytime.',
      value: access.granted,
      onChanged: _isUpdating ? null : respond,
      theme: theme,
    );
  }
}

class _ConsentSwitch extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final bool value;
  final ValueChanged<bool>? onChanged;
  final bool enabled;
  final ThemeData theme;

  const _ConsentSwitch({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.value,
    this.onChanged,
    this.enabled = true,
    required this.theme,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Container(
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: theme.colorScheme.outlineVariant),
        ),
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            CircleAvatar(
              backgroundColor: theme.colorScheme.primaryContainer,
              child: Icon(icon, color: theme.colorScheme.onPrimaryContainer),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        title,
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (!enabled) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 1,
                          ),
                          decoration: BoxDecoration(
                            color: theme.colorScheme.primaryContainer,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            'Required',
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: theme.colorScheme.onPrimaryContainer,
                              fontSize: 10,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Switch(
              value: value,
              onChanged: onChanged,
              activeThumbColor: AppColors.violet,
            ),
          ],
        ),
      ),
    );
  }
}

class _DataRow extends StatelessWidget {
  final IconData icon;
  final String title;
  final Color? titleColor;
  final Color? iconColor;
  final VoidCallback onTap;
  final ThemeData theme;

  const _DataRow({
    required this.icon,
    required this.title,
    this.titleColor,
    this.iconColor,
    required this.onTap,
    required this.theme,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: iconColor ?? theme.colorScheme.onSurface),
      title: Text(
        title,
        style: TextStyle(color: titleColor),
      ),
      trailing: const Icon(LucideIcons.chevronRight),
      onTap: onTap,
    );
  }
}
