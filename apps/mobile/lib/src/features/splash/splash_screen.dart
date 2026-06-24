import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Evia')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const FlutterLogo(size: 80),
            const SizedBox(height: 24),
            Text('Splash Screen', style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 32),
            FilledButton(
              onPressed: () => context.go('/auth'),
              child: const Text('Get Started'),
            ),
          ],
        ),
      ),
    );
  }
}
