import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patrol/patrol.dart';

const _testPhone = String.fromEnvironment('E2E_TEST_PHONE', defaultValue: '9999999999');
const _testOtp = String.fromEnvironment('E2E_TEST_OTP', defaultValue: '123456');

void main() {
  patrolTest(
    'Full onboarding — intake questionnaire to home screen',
    ($) async {
      await $.pumpAndSettle();

      // --- Login ---
      await $('Sign In').waitUntilVisible();
      await $.pumpAndSettle();
      await $(ValueKey('phone_input')).enterText(_testPhone);
      await $('Continue with Phone').tap();

      await $('OTP Verification').waitUntilVisible();
      await $.pumpAndSettle();
      final otpDigits = _testOtp.split('');
      for (int i = 0; i < otpDigits.length; i++) {
        await $(ValueKey('otp_$i')).enterText(otpDigits[i]);
      }
      await $.pumpAndSettle();
      await Future.delayed(const Duration(seconds: 3));
      await $.pumpAndSettle();

      // --- Cold start → no care plan → redirects to consent ---
      await $('Before we begin').waitUntilVisible();
      await $.pumpAndSettle();

      // Scroll to bottom of consent — this enables the "Save and continue" button
      await $.tester.drag(find.byType(ListView), const Offset(0, -600));
      await $.pumpAndSettle();

      // Toggle Emergency Contact checkbox ON (the last one, defaults to off)
      await $(find.byType(Checkbox)).last.tap();
      await $.pumpAndSettle();

      await $('Save and continue').tap();
      await $.pumpAndSettle();

      // --- Intake step 1: free-text response ---
      await $("What's been weighing on your mind lately?").waitUntilVisible();
      await $.pumpAndSettle();

      await $(ValueKey('intake_input')).enterText('I have been feeling anxious about work lately.');
      await $(ValueKey('intake_send')).tap();
      await $.pumpAndSettle();

      // --- Intake step 2: choose care plan ---
      await $('Anxiety support').waitUntilVisible();
      await $.pumpAndSettle();

      await $(ValueKey('care_plan_0')).tap();
      await $.pumpAndSettle();

      // Step 3 shows confirmation, then 1s timer → completes → navigates to /home
      await Future.delayed(const Duration(seconds: 3));
      await $.pumpAndSettle();

      // --- Assert home screen ---
      await $('How are you feeling today?').waitUntilVisible();
    },
  );
}
