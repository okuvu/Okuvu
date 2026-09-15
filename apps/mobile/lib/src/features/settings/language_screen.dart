import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'language_notifier.dart';
import '../../widgets/okuvu_app_bar_title.dart';
import '../../theme/app_colors.dart';

class LanguageScreen extends ConsumerWidget {
  const LanguageScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final languageState = ref.watch(languageSettingsStateProvider);

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
          title: const OkuvuAppBarTitle('Language'),
        ),
        body: languageState.isLoading
            ? const Center(child: CircularProgressIndicator())
            : Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                    child: Text(
                      'How OKUVU talks with you',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                  _LanguageOptionTile(
                    title: 'English',
                    subtitle: 'OKUVU replies in English only.',
                    selected: languageState.languageMode == 'english',
                    theme: theme,
                    onTap: () => ref
                        .read(languageSettingsProvider.notifier)
                        .setLanguageMode('english'),
                  ),
                  const Divider(height: 1, indent: 16, endIndent: 16),
                  _LanguageOptionTile(
                    title: 'Mirror',
                    subtitle: 'OKUVU mixes English and Hindi the way you do.',
                    selected: languageState.languageMode == 'mirror',
                    theme: theme,
                    onTap: () => ref
                        .read(languageSettingsProvider.notifier)
                        .setLanguageMode('mirror'),
                  ),
                ],
              ),
      ),
    );
  }
}

class _LanguageOptionTile extends StatelessWidget {
  final String title;
  final String subtitle;
  final bool selected;
  final ThemeData theme;
  final VoidCallback onTap;

  const _LanguageOptionTile({
    required this.title,
    required this.subtitle,
    required this.selected,
    required this.theme,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(
        selected ? LucideIcons.checkCircle2 : LucideIcons.circle,
        color: selected
            ? AppColors.violet
            : theme.colorScheme.onSurfaceVariant,
      ),
      title: Text(title, style: theme.textTheme.bodyLarge),
      subtitle: Text(subtitle, style: theme.textTheme.bodySmall),
      onTap: onTap,
    );
  }
}
