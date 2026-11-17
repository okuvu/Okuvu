import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../config/app_config.dart';
import '../../core/auth_service.dart';
import '../../core/providers.dart';
import '../../theme/app_colors.dart';

/// Onboarding — the screen that creates the account.
///
/// Until this screen existed, a `User` row could only be created by the
/// therapist portal's Add-Client wizard, so anyone who installed the app
/// without being registered first hit a waitlist and could go no further. Now
/// they sign in with Google and land here: the two things that are theirs to
/// answer — am I an adult, and what may OKUVU do with my data — and one button
/// that creates the account.
///
/// The account it creates is unassigned: no therapist, no care plan. Everything
/// else in the app works, and the operator console lists them for assignment.
///
/// Nothing is created by signing in. `POST /auth/signup` is what creates the
/// row, and the API refuses it without the 18+ answer and the mandatory
/// safety-monitoring consent — so this screen cannot be skipped by a client that
/// chooses not to render it.
class SelfServeSignupScreen extends ConsumerStatefulWidget {
  const SelfServeSignupScreen({super.key, this.email});

  /// The address Google verified, shown so the person can see which account
  /// they are creating.
  final String? email;

  @override
  ConsumerState<SelfServeSignupScreen> createState() =>
      _SelfServeSignupScreenState();
}

class _SelfServeSignupScreenState extends ConsumerState<SelfServeSignupScreen> {
  /// null = not answered yet. The button stays disabled until this is set —
  /// the age answer is the one thing on this screen that decides whether an
  /// account exists, so it is never defaulted.
  bool? _isAdult;
  bool _shareSummaries = false;
  bool _isSubmitting = false;
  String? _error;

  Future<void> _submit() async {
    final isAdult = _isAdult;
    if (isAdult == null || _isSubmitting) return;

    setState(() {
      _isSubmitting = true;
      _error = null;
    });

    final auth = ref.read(authServiceProvider);

    if (!isAdult) {
      // Still told to the server, because an invited client's console row
      // reads "Couldn't activate: age" instead of "not signed in yet" — their
      // therapist needs to know. A failure here changes nothing the person
      // sees: the closing screen is the same either way.
      try {
        await auth.signUp(adult: false, shareSummaries: false);
      } catch (_) {
        // Expected: the API answers 403 UNDER_18 and creates nothing.
      }
      await auth.signOut();
      if (!mounted) return;
      setState(() => _isSubmitting = false);
      context.go('/onboarding/age-blocked');
      return;
    }

    try {
      await auth.signUp(adult: true, shareSummaries: _shareSummaries);
      await ref.read(hasCompletedOnboardingProvider.notifier).complete();
      if (!mounted) return;
      setState(() => _isSubmitting = false);
      context.go('/home');
    } on AuthException catch (e) {
      if (!mounted) return;
      if (e.code == 'UNDER_18') {
        await auth.signOut();
        if (!mounted) return;
        setState(() => _isSubmitting = false);
        context.go('/onboarding/age-blocked');
        return;
      }
      if (e.code == 'NoIdToken') {
        // The Google token from sign-in is gone (the app was restarted while
        // this screen was open). Signing in again is the only path back.
        await auth.signOut();
        if (!mounted) return;
        setState(() => _isSubmitting = false);
        context.go('/auth');
        return;
      }
      setState(() {
        _isSubmitting = false;
        _error = e.message;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isSubmitting = false;
        _error = AppConfig.flavor == 'dev'
            ? 'Unexpected: ${e.runtimeType}: $e'
            : 'Something went wrong. Please try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final canSubmit = _isAdult != null && !_isSubmitting;
    final isAdult = _isAdult ?? true;

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                children: [
                  Text(
                    'Before we start',
                    style: theme.textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: AppColors.charcoalInk,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Two things. Ten seconds.',
                    style: theme.textTheme.bodyLarge?.copyWith(
                      color: AppColors.inkSoft,
                    ),
                  ),
                  if (widget.email != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      'Creating your account for ${widget.email}',
                      key: const ValueKey('signup_email'),
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.inkSoft,
                      ),
                    ),
                  ],
                  const SizedBox(height: 20),

                  // 1. The age gate. Not a checkbox buried in a list: the answer
                  // decides whether this screen creates anything at all.
                  Container(
                    decoration: BoxDecoration(
                      color: AppColors.lavenderTint,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Icon(LucideIcons.shield,
                                color: AppColors.royalPurple, size: 20),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                'OKUVU is for adults aged 18 and over.',
                                style: theme.textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.charcoalInk,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        _AgeChoice(
                          key: const ValueKey('age_adult_option'),
                          label: 'I am 18 or over',
                          selected: _isAdult == true,
                          onTap: _isSubmitting
                              ? null
                              : () => setState(() => _isAdult = true),
                        ),
                        const SizedBox(height: 8),
                        _AgeChoice(
                          key: const ValueKey('age_minor_option'),
                          label: 'I am under 18',
                          selected: _isAdult == false,
                          onTap: _isSubmitting
                              ? null
                              : () => setState(() => _isAdult = false),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),

                  // 2. Consent. Written once here and enforced server-side: the
                  // safety card cannot be turned off, and the summary sharing
                  // card is off unless the client turns it on.
                  const _ConsentCard(
                    icon: LucideIcons.lifeBuoy,
                    title: 'Safety comes first',
                    description:
                        "We keep an eye out for signs you might need urgent help, and a crisis line is always one tap away. This one isn't optional — it's how OKUVU stays safe.",
                    value: true,
                    onChanged: null,
                    isRequired: true,
                  ),
                  const SizedBox(height: 12),
                  _ConsentCard(
                    icon: LucideIcons.messageCircle,
                    title: 'Can your therapist see summaries of your chats?',
                    description:
                        "Turn this on and your therapist can read short summaries — the themes, not your words. Off by default. Flip it whenever you want, and every time they look, it's logged.",
                    value: _shareSummaries,
                    onChanged: _isSubmitting
                        ? null
                        : (v) => setState(() => _shareSummaries = v!),
                    isRequired: false,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    "By creating an account you agree to OKUVU's Terms of Use and Privacy Policy.",
                    key: const ValueKey('signup_terms_notice'),
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: AppColors.inkSoft,
                    ),
                  ),
                ],
              ),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                child: Text(
                  _error!,
                  key: const ValueKey('signup_error'),
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.error,
                  ),
                ),
              ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton(
                  key: const ValueKey('create_account_button'),
                  onPressed: canSubmit ? _submit : null,
                  style: ButtonStyle(
                    backgroundColor:
                        const WidgetStatePropertyAll(AppColors.violet),
                    foregroundColor: const WidgetStatePropertyAll(Colors.white),
                    shape: WidgetStatePropertyAll(
                      RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    padding: const WidgetStatePropertyAll(
                      EdgeInsets.symmetric(vertical: 14),
                    ),
                  ),
                  child: _isSubmitting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : Text(isAdult ? 'Create my account' : 'Continue'),
                ),
              ),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}

class _AgeChoice extends StatelessWidget {
  const _AgeChoice({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        decoration: BoxDecoration(
          color: selected ? Colors.white : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: selected ? AppColors.royalPurple : AppColors.hairline,
            width: selected ? 2 : 1,
          ),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        child: Row(
          children: [
            Icon(
              selected
                  ? Icons.radio_button_checked
                  : Icons.radio_button_unchecked,
              size: 20,
              color: selected ? AppColors.royalPurple : AppColors.inkSoft,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                label,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                  color: AppColors.charcoalInk,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ConsentCard extends StatelessWidget {
  const _ConsentCard({
    required this.icon,
    required this.title,
    required this.description,
    required this.value,
    required this.onChanged,
    required this.isRequired,
  });

  final IconData icon;
  final String title;
  final String description;
  final bool value;
  final ValueChanged<bool?>? onChanged;
  final bool isRequired;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Container(
      decoration: BoxDecoration(
        color: colorScheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: colorScheme.outlineVariant),
      ),
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: colorScheme.primaryContainer,
            child: Icon(icon, color: colorScheme.onPrimaryContainer),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        title,
                        style: theme.textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.w600),
                      ),
                    ),
                    if (isRequired) ...[
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 1),
                        decoration: BoxDecoration(
                          color: colorScheme.primaryContainer,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          'Always on',
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: colorScheme.onPrimaryContainer,
                            fontSize: 10,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  description,
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: colorScheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Checkbox(value: value, onChanged: onChanged),
        ],
      ),
    );
  }
}
