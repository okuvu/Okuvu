import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import '../../config/app_config.dart';
import '../../core/logger.dart';
import '../../core/providers.dart';
import 'consent_request.dart';
import '../../theme/app_colors.dart';

class ConsentScreen extends ConsumerStatefulWidget {
  const ConsentScreen({super.key});

  @override
  ConsumerState<ConsentScreen> createState() => _ConsentScreenState();
}

class _ConsentScreenState extends ConsumerState<ConsentScreen> {
  final bool _safetyMonitoring = true;
  bool _chatShare = false;
  bool _isSubmitting = false;
  String? _errorMessage;

  bool _isNetworkError(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionError:
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.sendTimeout:
        return true;
      default:
        return false;
    }
  }

  Future<void> _submit() async {
    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    final request = ConsentRequest(
      safetyMonitoring: _safetyMonitoring,
      moodInference: _chatShare,
    );

    try {
      await ref.read(dioClientProvider).post(
            '/users/me/consent',
            data: request.toJson(),
          );
      if (mounted) await _completeAndGoHome();
    } on DioException catch (e) {
      Logger.debug('[ConsentScreen] POST /users/me/consent failed: '
          'status=${e.response?.statusCode} body=${e.response?.data}');

      if (AppConfig.flavor == 'dev' && _isNetworkError(e)) {
        Logger.debug(
          '[ConsentScreen] Backend unavailable, proceeding with '
          'local-only consent (dev mode)',
        );
        if (mounted) await _completeAndGoHome();
        return;
      }

      if (mounted) {
        String message;
        if (e.response?.statusCode == 401) {
          message = 'Session expired. Please log in again.';
        } else if (e.response?.statusCode == 400) {
          message = (e.response?.data is Map)
              ? (e.response!.data['error']?['message'] as String? ??
                  'Something went wrong. Please try again.')
              : 'Something went wrong. Please try again.';
        } else {
          message = 'Something went wrong. Please try again.';
        }
        setState(() {
          _isSubmitting = false;
          _errorMessage = message;
        });
      }
    }
  }

  // The wireframe's onboarding is "4 taps, no questions" — the guided-chat
  // intake step no longer sits between consent and Home, so consent itself
  // is what marks onboarding complete now.
  Future<void> _completeAndGoHome() async {
    await ref.read(hasCompletedOnboardingProvider.notifier).complete();
    if (mounted) context.go('/home');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Column(
          children: [
            _TopBar(onBack: () => context.pop()),
            const _Header(),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: [
                  _ConsentCard(
                    icon: LucideIcons.shield,
                    title: 'Safety comes first',
                    description:
                        "We keep an eye out for signs you might need urgent help, and a crisis line is always one tap away. This one isn't optional — it's how OKUVU stays safe.",
                    value: _safetyMonitoring,
                    onChanged: null,
                    isRequired: true,
                    theme: theme,
                    colorScheme: colorScheme,
                  ),
                  const SizedBox(height: 12),
                  _ConsentCard(
                    icon: LucideIcons.messageCircle,
                    title: 'Can your therapist see summaries of your chats?',
                    description:
                        'Turn this on and your therapist can read short summaries — the themes, not your words. Off by default. Flip it whenever you want, and every time they look, it\'s logged.',
                    value: _chatShare,
                    onChanged: _isSubmitting
                        ? null
                        : (v) => setState(() => _chatShare = v!),
                    theme: theme,
                    colorScheme: colorScheme,
                  ),
                  const SizedBox(height: 16),
                ],
              ),
            ),
            if (_errorMessage != null)
              Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                child: Text(
                  _errorMessage!,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: colorScheme.error,
                  ),
                ),
              ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _isSubmitting ? null : _submit,
                  style: ButtonStyle(
                    backgroundColor: const WidgetStatePropertyAll(AppColors.violet),
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
                      : const Text('Start'),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                "That's it. Anything else, we'll ask only when it comes up.",
                style: theme.textTheme.bodySmall?.copyWith(
                  color: colorScheme.onSurfaceVariant,
                ),
                textAlign: TextAlign.center,
              ),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}

class _TopBar extends StatelessWidget {
  final VoidCallback onBack;

  const _TopBar({required this.onBack});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
      child: Row(
        children: [
          SizedBox(
            width: 48,
            child: IconButton(
              icon: const Icon(LucideIcons.arrowLeft),
              onPressed: onBack,
            ),
          ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Before we start',
            style: theme.textTheme.headlineMedium?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Two things. Ten seconds.',
            style: theme.textTheme.bodyLarge?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

class _ConsentCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String description;
  final bool value;
  final ValueChanged<bool?>? onChanged;
  final bool isRequired;
  final ThemeData theme;
  final ColorScheme colorScheme;

  const _ConsentCard({
    required this.icon,
    required this.title,
    required this.description,
    required this.value,
    required this.onChanged,
    this.isRequired = false,
    required this.theme,
    required this.colorScheme,
  });

  @override
  Widget build(BuildContext context) {
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
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    if (isRequired) ...[
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 1,
                        ),
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
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: colorScheme.onSurfaceVariant,
                  ),
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
