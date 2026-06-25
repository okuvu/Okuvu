import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../core/providers.dart';

class OtpScreen extends ConsumerStatefulWidget {
  const OtpScreen({super.key});

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen> {
  final _otpController = TextEditingController();
  String? _verificationId;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _verificationId ??= GoRouterState.of(context).extra as String?;
  }

  @override
  void dispose() {
    _otpController.dispose();
    super.dispose();
  }

  Future<void> _verifyOtp() async {
    if (_verificationId == null) return;
    final otp = _otpController.text.trim();
    if (otp.length != 6) return;

    try {
      await ref.read(authServiceProvider).verifyOtp(
        verificationId: _verificationId!,
        smsCode: otp,
      );
      // Session state updates reactively via authStateProvider
      if (mounted) context.go('/consent');
    } on FirebaseAuthException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message ?? 'Verification failed')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Verify OTP')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.smartphone, size: 64, color: Theme.of(context).colorScheme.primary),
              const SizedBox(height: 24),
              Text('OTP Verification', style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 8),
              const Text('Enter the code sent to your phone'),
              const SizedBox(height: 24),
              TextField(
                controller: _otpController,
                decoration: const InputDecoration(
                  labelText: 'OTP Code',
                  hintText: '123456',
                  prefixIcon: Icon(Icons.lock),
                ),
                keyboardType: TextInputType.number,
                maxLength: 6,
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _verifyOtp,
                child: const Text('Verify & Continue'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
