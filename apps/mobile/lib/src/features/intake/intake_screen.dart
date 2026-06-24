import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class IntakeScreen extends StatelessWidget {
  const IntakeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Intake')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.assignment, size: 64, color: Theme.of(context).colorScheme.primary),
            const SizedBox(height: 24),
            Text('Intake Screen', style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 8),
            const Text('Let\'s get to know you better'),
            const SizedBox(height: 32),
            FilledButton(
              onPressed: () => context.go('/home'),
              child: const Text('Complete & Go Home'),
            ),
          ],
        ),
      ),
    );
  }
}
