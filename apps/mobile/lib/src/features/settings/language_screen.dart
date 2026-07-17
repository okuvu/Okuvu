import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class LanguageScreen extends StatelessWidget {
  const LanguageScreen({super.key});

  static const _languages = [
    _Language('English', isActive: true),
    _Language('Hindi'),
    _Language('Tamil'),
    _Language('Telugu'),
    _Language('Bengali'),
    _Language('Marathi'),
  ];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) context.go('/settings');
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => context.go('/settings'),
          ),
          title: const Text('Language'),
        ),
        body: Column(
          children: [
            Expanded(
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(vertical: 8),
                itemCount: _languages.length,
                separatorBuilder: (_, __) => const Divider(height: 1, indent: 16, endIndent: 16),
                itemBuilder: (context, index) {
                  final lang = _languages[index];
                  return _LanguageTile(language: lang, theme: theme);
                },
              ),
            ),
            const Divider(height: 1),
            Opacity(
              opacity: 0.5,
              child: SwitchListTile(
                secondary: Icon(Icons.compare_arrows, color: theme.colorScheme.onSurfaceVariant),
                title: Text(
                  'Code-switch',
                  style: theme.textTheme.bodyLarge,
                ),
                subtitle: Text(
                  'Mix languages in conversation',
                  style: theme.textTheme.bodySmall,
                ),
                value: false,
                onChanged: null,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Language {
  final String name;
  final bool isActive;

  const _Language(this.name, {this.isActive = false});
}

class _LanguageTile extends StatelessWidget {
  final _Language language;
  final ThemeData theme;

  const _LanguageTile({required this.language, required this.theme});

  @override
  Widget build(BuildContext context) {
    final opacity = language.isActive ? 1.0 : 0.5;

    return Opacity(
      opacity: opacity,
      child: ListTile(
        leading: Icon(
          Icons.check_circle,
          color: language.isActive
              ? const Color(0xFF1A6B5A)
              : Colors.transparent,
        ),
        title: Text(
          language.name,
          style: theme.textTheme.bodyLarge,
        ),
        trailing: language.isActive
            ? null
            : Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 3,
                ),
                decoration: BoxDecoration(
                  color: theme.colorScheme.outlineVariant,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  'Coming Soon',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                    fontSize: 10,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
        enabled: language.isActive,
        onTap: language.isActive ? null : null,
      ),
    );
  }
}
