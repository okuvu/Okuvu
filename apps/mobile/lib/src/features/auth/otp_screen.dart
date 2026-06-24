import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class OtpScreen extends StatelessWidget {
  const OtpScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Verify OTP')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.smartphone, size: 64, color: Theme.of(context).colorScheme.primary),
            const SizedBox(height: 24),
            Text('OTP Verification', style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 8),
            const Text('Enter the code sent to your phone'),
            const SizedBox(height: 32),
            FilledButton(
              onPressed: () => context.go('/consent'),
              child: const Text('Verify & Continue'),
            ),
          ],
        ),
      ),
    );
  }
}
