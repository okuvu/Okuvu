import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'welcome_provider.dart';

/// S3-stop — age in whole years on [now], given a date of birth. A
/// top-level function (rather than private to the widget state) so it's
/// directly unit-testable without driving the native date picker.
int ageOn(DateTime dob, DateTime now) {
  var age = now.year - dob.year;
  if (now.month < dob.month || (now.month == dob.month && now.day < dob.day)) {
    age--;
  }
  return age;
}

/// Therapist-portal wireframes C-04/C-06 — shown once, right after OTP
/// verification, only for a client who redeemed a wizard invite code.
/// Not part of the normal self-serve signup flow.
class WelcomeScreen extends ConsumerStatefulWidget {
  const WelcomeScreen({super.key});

  @override
  ConsumerState<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends ConsumerState<WelcomeScreen> {
  final _abbreviationController = TextEditingController();
  bool _prefilled = false;
  bool _isSaving = false;
  DateTime? _dateOfBirth;
  String? _dobError;

  @override
  void dispose() {
    _abbreviationController.dispose();
    super.dispose();
  }

  Future<void> _pickDateOfBirth() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime(now.year - 18, now.month, now.day),
      firstDate: DateTime(now.year - 100),
      lastDate: now,
    );
    if (picked != null) {
      setState(() {
        _dateOfBirth = picked;
        _dobError = null;
      });
    }
  }

  // S3-stop — a client-side age gate. The wireframe treats under-18 as a
  // hard stop, not something to ask consent/questions about first.
  Future<void> _continue() async {
    final dob = _dateOfBirth;
    if (dob == null) {
      setState(() => _dobError = 'Enter your date of birth to continue');
      return;
    }
    if (ageOn(dob, DateTime.now()) < 18) {
      context.go('/onboarding/age-blocked');
      return;
    }

    setState(() => _isSaving = true);
    final text = _abbreviationController.text.trim();
    if (text.isNotEmpty) {
      await ref.read(welcomeAbbreviationProvider.notifier).save(text);
    }
    if (!mounted) return;
    context.go('/onboarding/consent');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final infoAsync = ref.watch(welcomeInfoProvider);

    infoAsync.whenData((info) {
      if (!_prefilled && info.displayAbbreviation != null) {
        _abbreviationController.text = info.displayAbbreviation!;
        _prefilled = true;
      }
    });

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: infoAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (_, __) => Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text("Couldn't load your welcome message.", style: theme.textTheme.bodyMedium),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: () => context.go('/onboarding/consent'),
                    child: const Text('Continue'),
                  ),
                ],
              ),
            ),
            data: (info) => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 24),
                Text("You're not alone.", style: theme.textTheme.headlineMedium),
                const SizedBox(height: 16),
                if (info.welcomeNote != null && info.welcomeNote!.isNotEmpty) ...[
                  Text(
                    info.welcomeNote!,
                    style: theme.textTheme.bodyLarge?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 24),
                ],
                Text(
                  'What should we call you?',
                  style: theme.textTheme.titleMedium,
                ),
                const SizedBox(height: 4),
                Text(
                  'You can change this any time in Settings.',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  key: const ValueKey('welcome_abbreviation_input'),
                  controller: _abbreviationController,
                  decoration: const InputDecoration(
                    hintText: 'e.g. S.',
                  ),
                  enabled: !_isSaving,
                ),
                const SizedBox(height: 20),
                Text('Date of birth', style: theme.textTheme.titleMedium),
                const SizedBox(height: 4),
                Text(
                  'We use this once, to confirm you meet our age requirement.',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 12),
                InkWell(
                  key: const ValueKey('welcome_dob_field'),
                  onTap: _isSaving ? null : _pickDateOfBirth,
                  child: InputDecorator(
                    decoration: InputDecoration(
                      hintText: 'Select a date',
                      errorText: _dobError,
                      suffixIcon: const Icon(LucideIcons.calendar),
                    ),
                    child: Text(
                      _dateOfBirth == null
                          ? ''
                          : '${_dateOfBirth!.day.toString().padLeft(2, '0')}/'
                              '${_dateOfBirth!.month.toString().padLeft(2, '0')}/'
                              '${_dateOfBirth!.year}',
                    ),
                  ),
                ),
                const Spacer(),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: FilledButton(
                    onPressed: _isSaving ? null : _continue,
                    child: _isSaving
                        ? const SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : const Text('Continue'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
