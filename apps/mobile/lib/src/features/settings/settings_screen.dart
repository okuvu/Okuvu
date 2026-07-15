import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/providers.dart';

const _kIconColor = Color(0xFF6B6B6B);
const _kLabelColor = Color(0xFF1A1A1A);

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final voiceSettings = ref.watch(voiceSettingsStateProvider);
    final voiceNotifier = ref.read(voiceSettingsProvider.notifier);

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) context.go('/home');
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => context.go('/home'),
          ),
          title: const Text('Settings'),
        ),
        body: Column(
          children: [
            Expanded(
              child: ListView(
                children: [
                  _SettingsTile(
                    icon: Icons.psychology,
                    title: 'My Focus Area',
                    onTap: () => context.go('/settings/focus'),
                  ),
                  _SettingsTile(
                    icon: Icons.contact_emergency,
                    title: 'Emergency Contact',
                    onTap: () => context.go('/settings/emergency'),
                  ),
                  _SettingsTile(
                    icon: Icons.lock,
                    title: 'Privacy & Data',
                    onTap: () => context.go('/settings/privacy'),
                  ),
                  _SettingsTile(
                    icon: Icons.language,
                    title: 'Language',
                    onTap: () => context.go('/settings/language'),
                  ),
                  if (voiceSettings.isLoading)
                    const _SettingsTile(
                      icon: Icons.volume_up,
                      title: 'Voice',
                      showTrailing: false,
                    )
                  else
                    SwitchListTile(
                      secondary: const Icon(Icons.volume_up),
                      title: const Text('Voice'),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16),
                      value: voiceSettings.voiceEnabled,
                      onChanged: (v) => voiceNotifier.toggleVoice(v),
                      activeThumbColor: const Color(0xFF1A6B5A),
                      inactiveTrackColor: const Color(0xFFC4C0BC),
                    ),
                  const SizedBox(height: 8),
                  const Divider(height: 1),
                  _SettingsTile(
                    icon: Icons.delete_forever,
                    title: 'Delete Account',
                    iconColor: theme.colorScheme.error,
                    titleColor: theme.colorScheme.error,
                    trailingIcon: Icons.chevron_right,
                    trailingColor: theme.colorScheme.error,
                    onTap: () => context.go('/settings/delete-account'),
                  ),
                ],
              ),
            ),
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Text(
                  'Version 1.0.0',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
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

class _SettingsTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final Color? iconColor;
  final Color? titleColor;
  final IconData? trailingIcon;
  final Color? trailingColor;
  final bool showTrailing;
  final VoidCallback? onTap;

  const _SettingsTile({
    required this.icon,
    required this.title,
    this.iconColor,
    this.titleColor,
    this.trailingIcon = Icons.chevron_right,
    this.trailingColor,
    this.showTrailing = true,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 56,
      child: ListTile(
        leading: Icon(icon, color: iconColor ?? _kIconColor),
        title: Text(
          title,
          style: TextStyle(color: titleColor ?? _kLabelColor),
        ),
        trailing: showTrailing
            ? Icon(trailingIcon, color: trailingColor ?? _kIconColor)
            : null,
        onTap: onTap,
      ),
    );
  }
}
