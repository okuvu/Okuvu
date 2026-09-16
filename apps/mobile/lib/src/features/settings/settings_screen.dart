import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../widgets/voice_toggle.dart';
import '../../widgets/quote_of_day_toggle.dart';
import '../../widgets/okuvu_app_bar_title.dart';
import '../../theme/app_colors.dart';

const _kIconColor = AppColors.inkSoft;
const _kLabelColor = AppColors.charcoalInk;

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

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
          title: const OkuvuAppBarTitle('Settings'),
        ),
        body: Column(
          children: [
            Expanded(
              child: ListView(
                children: [
                  _SettingsTile(
                    icon: LucideIcons.user,
                    title: 'Profile',
                    onTap: () => context.go('/settings/profile'),
                  ),
                  _SettingsTile(
                    icon: LucideIcons.bell,
                    title: 'Notifications',
                    onTap: () => context.go('/settings/notifications'),
                  ),
                  _SettingsTile(
                    icon: LucideIcons.brain,
                    title: 'My Focus Area',
                    onTap: () => context.go('/settings/focus'),
                  ),
                  _SettingsTile(
                    icon: LucideIcons.contact,
                    title: 'Emergency Contact',
                    onTap: () => context.go('/settings/emergency'),
                  ),
                  _SettingsTile(
                    icon: LucideIcons.lock,
                    title: 'Privacy & Data',
                    onTap: () => context.go('/settings/privacy'),
                  ),
                  _SettingsTile(
                    icon: LucideIcons.languages,
                    title: 'Language',
                    onTap: () => context.go('/settings/language'),
                  ),
                  _SettingsTile(
                    icon: LucideIcons.info,
                    title: 'About',
                    onTap: () => context.go('/settings/about'),
                  ),
                  const VoiceToggle(),
                  const QuoteOfDayToggle(),
                  const SizedBox(height: 8),
                  const Divider(height: 1),
                  _SettingsTile(
                    icon: LucideIcons.trash2,
                    title: 'Delete Account',
                    iconColor: theme.colorScheme.error,
                    titleColor: theme.colorScheme.error,
                    trailingIcon: LucideIcons.chevronRight,
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
  final VoidCallback? onTap;

  const _SettingsTile({
    required this.icon,
    required this.title,
    this.iconColor,
    this.titleColor,
    this.trailingIcon = LucideIcons.chevronRight,
    this.trailingColor,
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
        trailing: Icon(trailingIcon, color: trailingColor ?? _kIconColor),
        onTap: onTap,
      ),
    );
  }
}
