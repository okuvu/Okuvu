import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';

import '../../core/providers.dart';
import '../../theme/app_colors.dart';
import '../../widgets/okuvu_app_bar_title.dart';

/// S6 — reached when /auth/verify-otp returns NO_ACCOUNT: a verified phone
/// number with no matching OKUVU account or invite. Captures an email so
/// there's an actual list to follow up on, rather than a dead-end error.
class WaitlistScreen extends ConsumerStatefulWidget {
  final String? phoneNumber;

  const WaitlistScreen({this.phoneNumber, super.key});

  @override
  ConsumerState<WaitlistScreen> createState() => _WaitlistScreenState();
}

class _WaitlistScreenState extends ConsumerState<WaitlistScreen> {
  final _emailController = TextEditingController();
  bool _isSubmitting = false;
  bool _submitted = false;
  String? _errorMessage;

  static final _emailRe = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = _emailController.text.trim();
    if (!_emailRe.hasMatch(email)) {
      setState(() => _errorMessage = 'Enter a valid email address');
      return;
    }

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    try {
      await ref.read(dioClientProvider).post('/waitlist', data: {
        'email': email,
        if (widget.phoneNumber != null) 'phone_number': widget.phoneNumber,
      });
      if (mounted) setState(() => _submitted = true);
    } on DioException {
      if (mounted) {
        setState(() {
          _isSubmitting = false;
          _errorMessage = 'Something went wrong. Please try again.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const OkuvuAppBarTitle('Join the waitlist'),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: _submitted ? _buildConfirmation(theme) : _buildForm(theme),
        ),
      ),
    );
  }

  Widget _buildForm(ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Icon(LucideIcons.messageCircle, size: 56, color: AppColors.royalPurple),
        const SizedBox(height: 20),
        Text(
          "We don't have an account for that number yet",
          style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 8),
        Text(
          "OKUVU works with your therapist's invite. Leave your email and we'll let you know when one's ready — or ask your therapist for an invite code.",
          style: theme.textTheme.bodyMedium?.copyWith(color: AppColors.inkSoft),
        ),
        const SizedBox(height: 24),
        TextField(
          key: const ValueKey('waitlist_email_input'),
          controller: _emailController,
          keyboardType: TextInputType.emailAddress,
          enabled: !_isSubmitting,
          decoration: InputDecoration(
            labelText: 'Email',
            hintText: 'you@example.com',
            errorText: _errorMessage,
          ),
        ),
        const SizedBox(height: 20),
        SizedBox(
          width: double.infinity,
          height: 48,
          child: FilledButton(
            onPressed: _isSubmitting ? null : _submit,
            child: _isSubmitting
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Text('Join the waitlist'),
          ),
        ),
      ],
    );
  }

  Widget _buildConfirmation(ThemeData theme) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Icon(LucideIcons.checkCircle2, size: 56, color: AppColors.sageDeep),
        const SizedBox(height: 20),
        Text(
          "You're on the list",
          style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 8),
        Text(
          "We'll email you as soon as an account is ready.",
          textAlign: TextAlign.center,
          style: theme.textTheme.bodyMedium?.copyWith(color: AppColors.inkSoft),
        ),
      ],
    );
  }
}
