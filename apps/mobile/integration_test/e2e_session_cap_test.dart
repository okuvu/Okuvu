import 'package:patrol/patrol.dart';

const _testPhone = String.fromEnvironment('E2E_TEST_PHONE', defaultValue: '9999999999');
const _testOtp = String.fromEnvironment('E2E_TEST_OTP', defaultValue: '123456');

void main() {
  patrolTest(
    'Session closes after 10-turn cap with UI feedback',
    config: PatrolConfig(
      testTimeout: Timeout(Duration(minutes: 10)),
    ),
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

      // --- Navigate to chat ---
      // Test user has pre-assigned care plan → cold start shows "Your space is ready."
      if ($('Your space is ready.').visible) {
        await $('Let\'s begin').tap();
        await $.pumpAndSettle();
      } else {
        // At home → tap Chat in bottom nav
        await $('How are you feeling today?').waitUntilVisible();
        await $.pumpAndSettle();
        await $('Chat').tap();
        await $.pumpAndSettle();
      }

      // --- Chat session ---
      await $('How are you feeling today?').waitUntilVisible();
      await $.pumpAndSettle();

      for (int turn = 1; turn <= 10; turn++) {
        await $(ValueKey('chat_input'))
            .enterText('This is turn number $turn of my session.');
        await $(ValueKey('chat_send')).tap();
        await $.pumpAndSettle();

        // Wait for agent response — turn counter updates via WebSocket
        await $('$turn of 10').waitUntilVisible(
          message: 'Expected turn counter "$turn of 10" after turn $turn',
        );
        await $.pumpAndSettle();
      }

      // --- Verify session closure ---
      await $('Session complete for today.').waitUntilVisible();
      await $.pumpAndSettle();
      await $(ValueKey('back_to_home')).waitUntilVisible();
      await $.pumpAndSettle();

      // --- SRS feedback modal ---
      await $(ValueKey('back_to_home')).tap();
      await $.pumpAndSettle();

      await $('Session Feedback').waitUntilVisible();
      await $.pumpAndSettle();

      // Select "Okay" (option 3) then Submit
      await $('Okay').tap();
      await $.pumpAndSettle();
      await $('Submit').tap();
      await $.pumpAndSettle();

      // Should navigate to /home
      await $('How are you feeling today?').waitUntilVisible();
    },
  );
}
