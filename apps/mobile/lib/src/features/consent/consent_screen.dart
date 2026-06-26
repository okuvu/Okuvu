import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../../core/providers.dart';
import 'consent_request.dart';

class ConsentScreen extends ConsumerStatefulWidget {
  const ConsentScreen({super.key});

  @override
  ConsumerState<ConsentScreen> createState() => _ConsentScreenState();
}

class _ConsentScreenState extends ConsumerState<ConsentScreen> {
  final bool _safetyMonitoring = true;
  bool _moodInference = false;
  bool _assessment = false;
  bool _emergencyContact = false;
  bool _isSubmitting = false;
  String _errorMessage = '';

  Future<void> _submit() async {
    setState(() {
      _isSubmitting = true;
      _errorMessage = '';
    });

    final request = ConsentRequest(
      safetyMonitoring: _safetyMonitoring,
      moodInference: _moodInference,
      assessment: _assessment,
      emergencyContact: _emergencyContact,
    );

    try {
      await ref.read(dioClientProvider).post(
        '/users/me/consent',
        data: request.toJson(),
      );
      if (mounted) context.go('/intake');
    } on DioException catch (e) {
      if (kDebugMode) debugPrint('Consent submission failed: $e');
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
      appBar: AppBar(title: const Text('Consent')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Consent Screen', style: theme.textTheme.headlineMedium),
              const SizedBox(height: 8),
              const Text('Review and set your preferences below. Your choices can be updated later.'),
              const SizedBox(height: 24),
              CheckboxListTile(
                title: const Text('Safety monitoring'),
                subtitle: const Text('[Required]'),
                value: _safetyMonitoring,
                onChanged: null,
                controlAffinity: ListTileControlAffinity.trailing,
              ),
              CheckboxListTile(
                title: const Text('Mood inference'),
                subtitle: const Text('TODO: Replace with product copy'),
                value: _moodInference,
                onChanged: _isSubmitting
                    ? null
                    : (value) => setState(() => _moodInference = value!),
                controlAffinity: ListTileControlAffinity.trailing,
              ),
              CheckboxListTile(
                title: const Text('Assessment'),
                subtitle: const Text('TODO: Replace with product copy'),
                value: _assessment,
                onChanged: _isSubmitting
                    ? null
                    : (value) => setState(() => _assessment = value!),
                controlAffinity: ListTileControlAffinity.trailing,
              ),
              CheckboxListTile(
                title: const Text('Emergency contact'),
                subtitle: const Text('TODO: Replace with product copy'),
                value: _emergencyContact,
                onChanged: _isSubmitting
                    ? null
                    : (value) => setState(() => _emergencyContact = value!),
                controlAffinity: ListTileControlAffinity.trailing,
              ),
              if (_errorMessage.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text(
                  _errorMessage,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.error,
                  ),
                ),
              ],
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _isSubmitting ? null : _submit,
                  child: _isSubmitting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Text('Accept & Continue'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
