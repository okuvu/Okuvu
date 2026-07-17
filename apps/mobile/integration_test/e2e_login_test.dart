import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patrol/patrol.dart';

const _testPhone = String.fromEnvironment('E2E_TEST_PHONE', defaultValue: '9999999999');
const _testOtp = String.fromEnvironment('E2E_TEST_OTP', defaultValue: '123456');

void main() {
  patrolTest(
    'OTP login — complete cold start to home screen',
    ($) async {
      await $.pumpAndSettle();

      // Splash screen → animated for 2.5s, then redirects to /auth
      await $('Sign In').waitUntilVisible();
      await $.pumpAndSettle();

      // --- Phone step ---
      await $(ValueKey('phone_input')).enterText(_testPhone);
      await $('Continue with Phone').tap();

      // --- OTP step ---
      await $('OTP Verification').waitUntilVisible();
      await $.pumpAndSettle();

      // Firebase test phone accepts the known code without real SMS
      final otpDigits = _testOtp.split('');
      for (int i = 0; i < otpDigits.length; i++) {
        await $(ValueKey('otp_$i')).enterText(otpDigits[i]);
      }

      // After OTP entry, auto-submit fires → Firebase sign-in → POST /auth/verify-otp
      await $.pumpAndSettle();
      await Future.delayed(const Duration(seconds: 3));
      await $.pumpAndSettle();

      // Assert we landed somewhere meaningful — consent, cold start, or home
      final landed = $('Before we begin').visible ||
          $('Your space is ready.').visible ||
          $('How are you feeling today?').visible;
      expect(landed, isTrue,
          reason: 'Expected to land on onboarding or home screen after login');
    },
  );
}
