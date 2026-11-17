import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:go_router/go_router.dart';
import '../../widgets/okuvu_app_bar_title.dart';
import '../../core/app_update/version_policy.dart';

class AboutScreen extends ConsumerWidget {
  const AboutScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final versionLabel = ref.watch(appBuildInfoProvider).asData?.value.label ??
        'Version unavailable';

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
          title: const OkuvuAppBarTitle('About'),
        ),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const FlutterLogo(size: 80),
              const SizedBox(height: 24),
              Text('OKUVU', style: theme.textTheme.headlineMedium),
              const Text('AI Mental Wellness Companion'),
              const SizedBox(height: 8),
              Text(versionLabel),
              const SizedBox(height: 24),
              SizedBox(
                width: 200,
                child: OutlinedButton.icon(
                  onPressed: () => context.go('/settings/privacy-policy'),
                  icon: const Icon(LucideIcons.shieldAlert, size: 18),
                  label: const Text('Privacy Policy'),
                ),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () => context.go('/settings'),
                child: const Text('Back to Settings'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
