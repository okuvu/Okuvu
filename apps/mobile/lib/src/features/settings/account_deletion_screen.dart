import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../../core/providers.dart';

class AccountDeletionScreen extends ConsumerStatefulWidget {
  const AccountDeletionScreen({super.key});

  @override
  ConsumerState<AccountDeletionScreen> createState() => _AccountDeletionScreenState();
}

class _AccountDeletionScreenState extends ConsumerState<AccountDeletionScreen> {
  bool _isInfoStep = true;
  bool _isSubmitting = false;
  String _errorMessage = '';
  final _confirmController = TextEditingController();
  bool _confirmValid = false;

  @override
  void initState() {
    super.initState();
    _confirmController.addListener(_onConfirmChanged);
  }

  @override
  void dispose() {
    _confirmController.removeListener(_onConfirmChanged);
    _confirmController.dispose();
    super.dispose();
  }

  void _onConfirmChanged() {
    setState(() {
      _confirmValid = _confirmController.text.trim() == 'DELETE';
    });
  }

  Future<void> _submit() async {
    setState(() {
      _isSubmitting = true;
      _errorMessage = '';
    });

    try {
      await ref.read(dioClientProvider).post(
        '/account/delete',
        data: {'confirm': true},
      );

      await ref.read(authServiceProvider).signOut();

      if (mounted) context.go('/splash');
    } on DioException catch (e) {
      if (kDebugMode) debugPrint('Account deletion failed: $e');

      String message = 'Something went wrong. Please try again.';

      if (e.response?.statusCode == 409) {
        final code = e.response?.data?['error']?['code'];
        if (code == 'ACTIVE_SESSION') {
          message = 'You have an active chat session. Please close it before deleting your account.';
        } else if (code == 'ALREADY_DELETED') {
          message = 'This account has already been deleted.';
          await ref.read(authServiceProvider).signOut();
          if (mounted) context.go('/splash');
          return;
        }
      }

      if (mounted) {
        setState(() {
          _isSubmitting = false;
          _errorMessage = message;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Delete Account')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: _isInfoStep
              ? _buildInfoStep(theme)
              : _buildConfirmStep(theme),
        ),
      ),
    );
  }

  Widget _buildInfoStep(ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          Icons.warning_amber_rounded,
          size: 64,
          color: theme.colorScheme.error,
        ),
        const SizedBox(height: 24),
        Text(
          'Are you sure?',
          style: theme.textTheme.headlineMedium,
        ),
        const SizedBox(height: 16),
        Text(
          'Deleting your account is permanent and cannot be undone. '
          'The following data will be removed:',
          style: theme.textTheme.bodyLarge,
        ),
        const SizedBox(height: 16),
        _bulletPoint(theme, 'Your personal information'),
        _bulletPoint(theme, 'Emergency contact details'),
        _bulletPoint(theme, 'Session history and chat logs'),
        _bulletPoint(theme, 'Care plan and progress data'),
        const SizedBox(height: 12),
        Text(
          'Therapist notes about your sessions will be retained '
          'in de-identified form for clinical records.',
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 24),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: () => setState(() => _isInfoStep = false),
            child: const Text('Continue'),
          ),
        ),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton(
            onPressed: () => context.go('/settings'),
            child: const Text('Cancel'),
          ),
        ),
      ],
    );
  }

  Widget _bulletPoint(ThemeData theme, String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('  •  '),
          Expanded(child: Text(text, style: theme.textTheme.bodyMedium)),
        ],
      ),
    );
  }

  Widget _buildConfirmStep(ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          Icons.delete_forever,
          size: 64,
          color: theme.colorScheme.error,
        ),
        const SizedBox(height: 24),
        Text(
          'Final Confirmation',
          style: theme.textTheme.headlineMedium,
        ),
        const SizedBox(height: 16),
        Text(
          'Type DELETE below and tap the button to permanently delete your account.',
          style: theme.textTheme.bodyLarge,
        ),
        const SizedBox(height: 24),
        TextField(
          controller: _confirmController,
          decoration: InputDecoration(
            labelText: 'Type DELETE to confirm',
            border: const OutlineInputBorder(),
            filled: true,
            fillColor: theme.colorScheme.errorContainer.withValues(alpha: 0.1),
            errorText: _confirmValid ? null : 'Type DELETE exactly',
          ),
          style: TextStyle(
            color: theme.colorScheme.error,
            fontWeight: FontWeight.bold,
          ),
          enabled: !_isSubmitting,
        ),
        if (_errorMessage.isNotEmpty) ...[
          const SizedBox(height: 16),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: theme.colorScheme.errorContainer,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              _errorMessage,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onErrorContainer,
              ),
            ),
          ),
        ],
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: (!_confirmValid || _isSubmitting) ? null : _submit,
            style: FilledButton.styleFrom(
              backgroundColor: theme.colorScheme.error,
              foregroundColor: theme.colorScheme.onError,
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
                : const Text('Delete My Account'),
          ),
        ),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton(
            onPressed: _isSubmitting
                ? null
                : () {
                    _errorMessage = '';
                    setState(() => _isInfoStep = true);
                  },
            child: const Text('Go Back'),
          ),
        ),
      ],
    );
  }
}
