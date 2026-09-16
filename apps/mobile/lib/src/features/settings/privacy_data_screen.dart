import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'consent_provider.dart';
import 'emergency_contact_notifier.dart';
import '../home/providers/today_card_provider.dart';
import '../../widgets/okuvu_app_bar_title.dart';
import '../../theme/app_colors.dart';

/// Decisions doc round, 15 Sep 2026 §8 — "What your therapist can see."
class PrivacyDataScreen extends ConsumerWidget {
  const PrivacyDataScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final consentState = ref.watch(consentProvider);
    final emergencyContact = ref.watch(emergencyContactProvider);

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
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    child: Text(
                      'What your therapist can see',
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const _ChatAccessSwitch(),
                  _MoodProgressRow(
                    shared: consentState.moodInference,
                    theme: theme,
                  ),
                  const _StaticChipRow(
                    icon: LucideIcons.lock,
                    title: 'Journal',
                    chipLabel: 'Private (never shared)',
                  ),
                  _EmergencyContactRow(
                    hasContact: emergencyContact.hasContact,
                    name: emergencyContact.name,
                    theme: theme,
                  ),
                  const _StaticChipRow(
                    icon: LucideIcons.shield,
                    title: 'Safety monitoring',
                    chipLabel: 'Always on',
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
                    title: 'Your data',
                    subtitle: 'Export or delete',
                    onTap: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Data export is coming soon.'),
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
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                    child: Text(
                      "Change any of this whenever you want. Every time your therapist looks, it's logged — nothing is silent.",
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                      textAlign: TextAlign.center,
                    ),
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
      subtitle: 'See the themes from what you discuss.',
      value: access.granted,
      onChanged: _isUpdating ? null : respond,
      theme: theme,
    );
  }
}

/// Decisions doc round, 15 Sep 2026 §8 — one chip covering both
/// mood_inference and assessment consent, with a just-in-time prompt
/// gating the first "Sure".
class _MoodProgressRow extends ConsumerWidget {
  final bool shared;
  final ThemeData theme;

  const _MoodProgressRow({required this.shared, required this.theme});

  Future<void> _confirmShare(BuildContext context, WidgetRef ref) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        content: const Text(
          'Keep your mood check-ins so you can see patterns? Your therapist sees the trend only if you share mood & progress.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Not now'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Sure'),
          ),
        ],
      ),
    );
    if (result == true) {
      await ref.read(consentProvider.notifier).setMoodAndProgressShared(true);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
              child: Icon(LucideIcons.barChart2, color: theme.colorScheme.onPrimaryContainer),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                'Mood & progress',
                style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
              ),
            ),
            GestureDetector(
              onTap: shared
                  ? () => ref.read(consentProvider.notifier).setMoodAndProgressShared(false)
                  : () => _confirmShare(context, ref),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: shared ? AppColors.sageTint : AppColors.lavenderTint,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  shared ? 'Shared' : 'Ask me first',
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: shared ? AppColors.sageDeep : AppColors.royalPurple,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmergencyContactRow extends ConsumerWidget {
  final bool hasContact;
  final String? name;
  final ThemeData theme;

  const _EmergencyContactRow({
    required this.hasContact,
    required this.name,
    required this.theme,
  });

  Future<void> _confirmAdd(BuildContext context) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        content: const Text(
          "Add a contact we can reach if you're ever in danger? They're only ever contacted in an emergency.",
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Not now'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Add'),
          ),
        ],
      ),
    );
    if (result == true && context.mounted) {
      context.go('/settings/emergency');
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => hasContact
            ? context.go('/settings/emergency')
            : _confirmAdd(context),
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
                child: Icon(LucideIcons.phone, color: theme.colorScheme.onPrimaryContainer),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Emergency contact',
                  style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
                ),
              ),
              Text(
                hasContact ? (name ?? 'Added') : 'Not set',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(width: 4),
              const Icon(LucideIcons.chevronRight, size: 18),
            ],
          ),
        ),
      ),
    );
  }
}

/// A non-interactive row for states that never toggle from Settings itself
/// (Journal is never shared; Safety monitoring is always on).
class _StaticChipRow extends StatelessWidget {
  final IconData icon;
  final String title;
  final String chipLabel;

  const _StaticChipRow({
    required this.icon,
    required this.title,
    required this.chipLabel,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
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
              child: Text(
                title,
                style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.lavenderTint,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                chipLabel,
                style: theme.textTheme.labelMedium?.copyWith(
                  color: AppColors.royalPurple,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ConsentSwitch extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final bool value;
  final ValueChanged<bool>? onChanged;
  final ThemeData theme;

  const _ConsentSwitch({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.value,
    this.onChanged,
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
                  Text(
                    title,
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
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
  final String? subtitle;
  final Color? titleColor;
  final Color? iconColor;
  final VoidCallback onTap;
  final ThemeData theme;

  const _DataRow({
    required this.icon,
    required this.title,
    this.subtitle,
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
      subtitle: subtitle != null ? Text(subtitle!) : null,
      trailing: const Icon(LucideIcons.chevronRight),
      onTap: onTap,
    );
  }
}
