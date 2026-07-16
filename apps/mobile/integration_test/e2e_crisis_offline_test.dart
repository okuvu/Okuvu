import 'package:patrol/patrol.dart';

const _testPhone = String.fromEnvironment('E2E_TEST_PHONE', defaultValue: '9999999999');
const _testOtp = String.fromEnvironment('E2E_TEST_OTP', defaultValue: '123456');

void main() {
  patrolTest(
    'Crisis screen renders all content in actual airplane mode',
    config: const PatrolConfig(),
    ($) async {
      // Ensure we always restore airplane mode, even on test failure
      addTearDown(() async {
        await $.native.disableAirplaneMode();
      });

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

      // Handle post-login routing: if consent screen appears, complete minimal onboarding
      if ($('Before we begin').visible) {
        await $.tester.drag(find.byType(ListView), const Offset(0, -600));
        await $.pumpAndSettle();
        await $('Save and continue').tap();
        await $.pumpAndSettle();

        await $(ValueKey('intake_input')).enterText('Test response');
        await $(ValueKey('intake_send')).tap();
        await $.pumpAndSettle();

        await $(ValueKey('care_plan_0')).tap();
        await Future.delayed(const Duration(seconds: 3));
        await $.pumpAndSettle();
      }

      // Wait for home screen
      if (!$('How are you feeling today?').visible) {
        await $('How are you feeling today?').waitUntilVisible();
      }
      await $.pumpAndSettle();

      // --- Open crisis overlay ---
      await $('Crisis Support').tap();
      await $.pumpAndSettle();

      // Verify crisis content loaded
      await $('You\'re not alone.').waitUntilVisible();
      expect($('9152987821').visible, isTrue);
      expect($('18602662345').visible, isTrue);
      expect($('08046110007').visible, isTrue);
      expect($('04424640050').visible, isTrue);
      expect($('112').visible, isTrue);

      // --- Enable actual airplane mode via ADB ---
      await $.native.enableAirplaneMode();
      await $.pumpAndSettle();

      // Assert all crisis content is still visible without network
      expect($('9152987821').visible, isTrue);
      expect($('18602662345').visible, isTrue);
      expect($('08046110007').visible, isTrue);
      expect($('04424640050').visible, isTrue);
      expect($('112').visible, isTrue);
      expect($('You\'re not alone.').visible, isTrue);
      expect($('Here are some people you can call right now.').visible, isTrue);

      // addTearDown restores airplane mode on pass or fail
    },
  );
}
