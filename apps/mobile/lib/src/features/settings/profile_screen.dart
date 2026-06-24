import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.person, size: 64, color: Theme.of(context).colorScheme.primary),
            const SizedBox(height: 24),
            Text('Profile Settings', style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 32),
            FilledButton(
              onPressed: () => context.go('/settings'),
              child: const Text('Back to Settings'),
            ),
          ],
        ),
      ),
    );
  }
}
