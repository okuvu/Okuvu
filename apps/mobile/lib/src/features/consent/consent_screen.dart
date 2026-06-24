import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class ConsentScreen extends StatelessWidget {
  const ConsentScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Consent')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.description, size: 64, color: Theme.of(context).colorScheme.primary),
            const SizedBox(height: 24),
            Text('Consent Screen', style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 8),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 32),
              child: Text('Review and accept the terms to continue'),
            ),
            const SizedBox(height: 32),
            FilledButton(
              onPressed: () => context.go('/intake'),
              child: const Text('Accept & Continue'),
            ),
          ],
        ),
      ),
    );
  }
}
