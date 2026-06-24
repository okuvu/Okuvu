import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class ProgressScreen extends StatelessWidget {
  const ProgressScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Progress')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.trending_up, size: 64, color: Theme.of(context).colorScheme.primary),
            const SizedBox(height: 24),
            Text('Progress Screen', style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 8),
            const Text('Your wellness journey tracked here'),
            const SizedBox(height: 32),
            FilledButton(
              onPressed: () => context.go('/home'),
              child: const Text('Back to Home'),
            ),
          ],
        ),
      ),
    );
  }
}
