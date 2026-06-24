import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class AuthScreen extends StatelessWidget {
  const AuthScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Sign In')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const FlutterLogo(size: 80),
            const SizedBox(height: 24),
            Text('Auth Screen', style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 32),
            FilledButton(
              onPressed: () => context.go('/otp'),
              child: const Text('Continue with Phone'),
            ),
          ],
        ),
      ),
    );
  }
}
