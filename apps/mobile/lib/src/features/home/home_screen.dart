import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../config/app_config.dart';
import '../../core/providers.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: const Text('Evia')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('Environment: ${AppConfig.environment.label}'),
            Text('Base URL: ${AppConfig.apiBaseUrl}'),
            const SizedBox(height: 32),
            Text('Home Screen', style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 24),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              alignment: WrapAlignment.center,
              children: [
                FilledButton(
                  onPressed: () => context.go('/chat'),
                  child: const Text('Chat'),
                ),
                FilledButton(
                  onPressed: () => context.go('/progress'),
                  child: const Text('Progress'),
                ),
                FilledButton(
                  onPressed: () => context.go('/settings'),
                  child: const Text('Settings'),
                ),
                FilledButton(
                  onPressed: () => ref.read(crisisOverlayProvider.notifier).show(),
                  child: Text('Crisis Support',
                    style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
