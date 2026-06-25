import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../core/providers.dart';

class AuthScreen extends ConsumerStatefulWidget {
  const AuthScreen({super.key});

  @override
  ConsumerState<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends ConsumerState<AuthScreen> {
  final _phoneController = TextEditingController();

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  void _sendOtp() {
    final phone = _phoneController.text.trim();
    if (phone.isEmpty) return;

    ref.read(authServiceProvider).verifyPhone(
      phoneNumber: phone,
      onCodeSent: (verificationId) {
        if (mounted) context.go('/otp', extra: verificationId);
      },
      onError: (FirebaseAuthException e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(e.message ?? 'Verification failed')),
          );
        }
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Sign In')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const FlutterLogo(size: 80),
              const SizedBox(height: 24),
              Text('Sign In', style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 24),
              TextField(
                controller: _phoneController,
                decoration: const InputDecoration(
                  labelText: 'Phone Number',
                  hintText: '+1 555 555 5555',
                  prefixIcon: Icon(Icons.phone),
                ),
                keyboardType: TextInputType.phone,
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _sendOtp,
                child: const Text('Continue with Phone'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
