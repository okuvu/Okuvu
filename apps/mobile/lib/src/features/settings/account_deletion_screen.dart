import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../../core/providers.dart';

const _ctaTextStyle = TextStyle(
  fontSize: 16,
  fontWeight: FontWeight.w600,
  letterSpacing: 0.01,
  height: 20 / 16,
);

enum _DeletionStep {
  warning,
  confirm,
  sessionError,
  processing,
  success,
}

class AccountDeletionScreen extends ConsumerStatefulWidget {
  const AccountDeletionScreen({super.key});

  @override
  ConsumerState<AccountDeletionScreen> createState() =>
      _AccountDeletionScreenState();
}

class _AccountDeletionScreenState extends ConsumerState<AccountDeletionScreen> {
  _DeletionStep _currentStep = _DeletionStep.warning;
  bool _isSubmitting = false;
  String _errorMessage = '';

  Future<void> _submit() async {
    setState(() {
      _currentStep = _DeletionStep.processing;
      _errorMessage = '';
    });

    try {
      await ref.read(dioClientProvider).post(
        '/account/delete',
        data: {'confirm': true},
      );

      if (mounted) setState(() => _currentStep = _DeletionStep.success);
    } on DioException catch (e) {
      if (kDebugMode) debugPrint('Account deletion failed: $e');

      if (e.response?.statusCode == 409) {
        final code = e.response?.data?['error']?['code'];
        if (code == 'ACTIVE_SESSION') {
          if (mounted) {
            setState(() => _currentStep = _DeletionStep.sessionError);
          }
          return;
        } else if (code == 'ALREADY_DELETED') {
          await ref.read(authServiceProvider).signOut();
          if (mounted) context.go('/splash');
          return;
        }
      }

      if (mounted) {
        setState(() {
          _isSubmitting = false;
          _currentStep = _DeletionStep.confirm;
          _errorMessage = 'Something went wrong. Please try again.';
        });
      }
    }
  }

  void _goToStep(_DeletionStep step) {
    setState(() {
      _errorMessage = '';
      _currentStep = step;
    });
  }

  void _cancel() {
    setState(() {
      _errorMessage = '';
      _currentStep = _DeletionStep.warning;
    });
    context.go('/settings');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isWarning = _currentStep == _DeletionStep.warning;

    String appBarTitle;
    switch (_currentStep) {
      case _DeletionStep.warning:
        appBarTitle = 'Evia';
      case _DeletionStep.confirm:
        appBarTitle = 'Confirm deletion';
      case _DeletionStep.sessionError:
        appBarTitle = 'Active session';
      case _DeletionStep.processing:
        appBarTitle = 'Deleting account';
      case _DeletionStep.success:
        appBarTitle = 'Account deleted';
    }

    final bool showBackButton;
    switch (_currentStep) {
      case _DeletionStep.warning:
      case _DeletionStep.sessionError:
        showBackButton = true;
      case _DeletionStep.confirm:
      case _DeletionStep.processing:
      case _DeletionStep.success:
        showBackButton = false;
    }

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) {
          if (isWarning || _currentStep == _DeletionStep.sessionError) {
            context.go('/settings');
          } else {
            _goToStep(_DeletionStep.warning);
          }
        }
      },
      child: Scaffold(
        appBar: AppBar(
          leading: showBackButton
              ? IconButton(
                  icon: const Icon(Icons.arrow_back),
                  onPressed: () {
                    if (_currentStep == _DeletionStep.sessionError) {
                      context.go('/settings');
                    } else {
                      context.go('/settings');
                    }
                  },
                )
              : null,
          title: Text(
            appBarTitle,
            style: theme.textTheme.titleMedium?.copyWith(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: isWarning
                  ? theme.colorScheme.primary
                  : theme.colorScheme.onSurface,
            ),
          ),
          centerTitle: true,
          bottom: isWarning
              ? PreferredSize(
                  preferredSize: const Size.fromHeight(1),
                  child: Container(
                    color: theme.colorScheme.outlineVariant,
                    height: 1,
                  ),
                )
              : null,
        ),
        body: SafeArea(
          child: _PageEntryAnimation(
            key: const ValueKey('entry'),
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 400),
              switchInCurve: Curves.easeOut,
              switchOutCurve: Curves.easeIn,
              transitionBuilder: (child, animation) {
                return FadeTransition(
                  opacity: animation,
                  child: SlideTransition(
                    position: Tween<Offset>(
                      begin: const Offset(0, 0.04),
                      end: Offset.zero,
                    ).animate(animation),
                    child: child,
                  ),
                );
              },
              child: KeyedSubtree(
                key: ValueKey(_currentStep),
                child: _buildStep(theme),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildStep(ThemeData theme) {
    switch (_currentStep) {
      case _DeletionStep.warning:
        return _WarningStep(
          theme: theme,
          onContinue: () => _goToStep(_DeletionStep.confirm),
          onCancel: _cancel,
        );
      case _DeletionStep.confirm:
        return _ConfirmStep(
          theme: theme,
          isSubmitting: _isSubmitting,
          errorMessage: _errorMessage,
          onSubmit: _submit,
          onChangedMind: () => _goToStep(_DeletionStep.warning),
        );
      case _DeletionStep.sessionError:
        return _SessionErrorStep(
          theme: theme,
          onClose: () => context.go('/chat'),
          onCancel: _cancel,
        );
      case _DeletionStep.processing:
        return const _ProcessingStep();
      case _DeletionStep.success:
        return _SuccessStep(
          theme: theme,
          onComplete: () {
            ref.read(authServiceProvider).signOut();
            if (mounted) context.go('/splash');
          },
        );
    }
  }
}

class _PageEntryAnimation extends StatefulWidget {
  final Widget child;

  const _PageEntryAnimation({super.key, required this.child});

  @override
  State<_PageEntryAnimation> createState() => _PageEntryAnimationState();
}

class _PageEntryAnimationState extends State<_PageEntryAnimation>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _opacity;
  late Animation<Offset> _slide;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 400),
    )..forward();
    _opacity = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOut),
    );
    _slide = Tween<Offset>(
      begin: const Offset(0, 0.03),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeOut));
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SlideTransition(
      position: _slide,
      child: FadeTransition(
        opacity: _opacity,
        child: widget.child,
      ),
    );
  }
}

class _WarningStep extends StatelessWidget {
  final ThemeData theme;
  final VoidCallback onContinue;
  final VoidCallback onCancel;

  const _WarningStep({
    required this.theme,
    required this.onContinue,
    required this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 0),
            child: Column(
              children: [
                const SizedBox(height: 20),
                Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    color: theme.colorScheme.errorContainer
                        .withValues(alpha: 0.3),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    Icons.delete,
                    size: 40,
                    color: theme.colorScheme.error,
                  ),
                ),
                const SizedBox(height: 24),
                Text(
                  'Before you go',
                  style: theme.textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 24),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.surfaceContainerLowest,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: theme.colorScheme.outlineVariant
                          .withValues(alpha: 0.3),
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.08),
                        blurRadius: 8,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'The following will be permanently deleted:',
                        style: theme.textTheme.bodyLarge?.copyWith(
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(height: 8),
                      _DeletionRow(
                        theme: theme,
                        text: 'Your account and login information',
                      ),
                      const SizedBox(height: 12),
                      _DeletionRow(
                        theme: theme,
                        text: 'All session history with Evia',
                      ),
                      const SizedBox(height: 12),
                      _DeletionRow(
                        theme: theme,
                        text: 'Mood check-ins and progress data',
                      ),
                      const SizedBox(height: 12),
                      _DeletionRow(
                        theme: theme,
                        text: 'Saved emergency contacts',
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Text(
                    'Once deleted, this cannot be undone. You can always come back and create a new account in the future.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontSize: 13,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),
                const SizedBox(height: 40),
              ],
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
          child: Column(
            children: [
              SizedBox(
                width: double.infinity,
                height: 52,
                child: FilledButton(
                  onPressed: onContinue,
                  style: FilledButton.styleFrom(
                    backgroundColor: theme.colorScheme.error,
                    foregroundColor: theme.colorScheme.onError,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    elevation: 1,
                    shadowColor: Colors.black.withValues(alpha: 0.1),
                  ),
                  child: const Text(
                    'Continue to delete',
                    style: _ctaTextStyle,
                  ),
                ),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                height: 52,
                child: TextButton(
                  onPressed: onCancel,
                  style: TextButton.styleFrom(
                    foregroundColor: theme.colorScheme.primary,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: Text(
                    'Cancel',
                    style: _ctaTextStyle.copyWith(
                      color: theme.colorScheme.primary,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _DeletionRow extends StatelessWidget {
  final ThemeData theme;
  final String text;

  const _DeletionRow({
    required this.theme,
    required this.text,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 2),
          child: Icon(
            Icons.close,
            size: 20,
            color: theme.colorScheme.error,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            text,
            style: theme.textTheme.bodySmall?.copyWith(
              fontSize: 13,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ),
      ],
    );
  }
}

class _ConfirmStep extends StatelessWidget {
  final ThemeData theme;
  final bool isSubmitting;
  final String errorMessage;
  final VoidCallback onSubmit;
  final VoidCallback onChangedMind;

  const _ConfirmStep({
    required this.theme,
    required this.isSubmitting,
    required this.errorMessage,
    required this.onSubmit,
    required this.onChangedMind,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const SizedBox(height: 40),
                  SizedBox(
                    width: 80,
                    height: 80,
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        _PingRipple(
                          color: theme.colorScheme.error.withValues(alpha: 0.1),
                        ),
                        Container(
                          width: 80,
                          height: 80,
                          decoration: BoxDecoration(
                            color: theme.colorScheme.errorContainer,
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            Icons.warning,
                            size: 40,
                            color: theme.colorScheme.error,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: Text(
                      'Tap the button below to permanently delete your account.',
                      style: theme.textTheme.bodyLarge?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        if (errorMessage.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: theme.colorScheme.errorContainer,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                errorMessage,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onErrorContainer,
                ),
              ),
            ),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
          child: Column(
            children: [
              SizedBox(
                width: double.infinity,
                height: 52,
                child: FilledButton(
                  onPressed: isSubmitting ? null : onSubmit,
                  style: FilledButton.styleFrom(
                    backgroundColor: theme.colorScheme.error,
                    foregroundColor: theme.colorScheme.onError,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    elevation: 2,
                    shadowColor: const Color(0x33BA1A1A),
                  ),
                  child: isSubmitting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : Text(
                          'Delete my account permanently',
                          style: _ctaTextStyle.copyWith(
                            color: theme.colorScheme.onError,
                          ),
                        ),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                height: 52,
                child: TextButton(
                  onPressed: isSubmitting ? null : onChangedMind,
                  style: TextButton.styleFrom(
                    foregroundColor: theme.colorScheme.primary,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: Text(
                    "I've changed my mind",
                    style: _ctaTextStyle.copyWith(
                      color: theme.colorScheme.primary,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _SessionErrorStep extends StatelessWidget {
  final ThemeData theme;
  final VoidCallback onClose;
  final VoidCallback onCancel;

  const _SessionErrorStep({
    required this.theme,
    required this.onClose,
    required this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 80,
                    height: 80,
                    decoration: BoxDecoration(
                      color: theme.colorScheme.tertiaryContainer
                          .withValues(alpha: 0.3),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      Icons.access_time,
                      size: 40,
                      color: theme.colorScheme.tertiary,
                    ),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    'Active session',
                    style: theme.textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 12),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: Text(
                      'You have an active session. Please end your current chat session before deleting your account.',
                      style: theme.textTheme.bodyLarge?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
          child: Column(
            children: [
              SizedBox(
                width: double.infinity,
                height: 52,
                child: FilledButton(
                  onPressed: onClose,
                  style: FilledButton.styleFrom(
                    backgroundColor: theme.colorScheme.primary,
                    foregroundColor: theme.colorScheme.onPrimary,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    elevation: 1,
                  ),
                  child: const Text(
                    'End session and continue',
                    style: _ctaTextStyle,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                height: 52,
                child: TextButton(
                  onPressed: onCancel,
                  style: TextButton.styleFrom(
                    foregroundColor: theme.colorScheme.primary,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: Text(
                    'Cancel',
                    style: _ctaTextStyle.copyWith(
                      color: theme.colorScheme.primary,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ProcessingStep extends StatelessWidget {
  const _ProcessingStep();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 32,
            height: 32,
            child: CircularProgressIndicator(
              strokeWidth: 3,
              color: theme.colorScheme.primary,
            ),
          ),
          const SizedBox(height: 24),
          Text(
            'Deleting your account\u2026',
            style: theme.textTheme.bodyLarge?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

class _SuccessStep extends StatefulWidget {
  final ThemeData theme;
  final VoidCallback onComplete;

  const _SuccessStep({
    required this.theme,
    required this.onComplete,
  });

  @override
  State<_SuccessStep> createState() => _SuccessStepState();
}

class _SuccessStepState extends State<_SuccessStep> {
  @override
  void initState() {
    super.initState();
    Future.delayed(const Duration(seconds: 3), () {
      if (mounted) widget.onComplete();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Evia',
              style: widget.theme.textTheme.titleLarge?.copyWith(
                fontSize: 22,
                fontWeight: FontWeight.w600,
                color: widget.theme.colorScheme.onSurface.withValues(alpha: 0.4),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Your account has been deleted.',
              style: widget.theme.textTheme.titleLarge?.copyWith(
                fontSize: 22,
                fontWeight: FontWeight.w600,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            Text(
              "We've removed your data. Take care of yourself.",
              style: widget.theme.textTheme.bodyLarge?.copyWith(
                fontSize: 16,
                color: widget.theme.colorScheme.onSurface.withValues(alpha: 0.6),
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _PingRipple extends StatefulWidget {
  final Color color;

  const _PingRipple({required this.color});

  @override
  State<_PingRipple> createState() => _PingRippleState();
}

class _PingRippleState extends State<_PingRipple>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scale;
  late Animation<double> _opacity;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    )..repeat();
    _scale = Tween<double>(begin: 1.0, end: 2.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.0, 0.75, curve: Curves.easeOut),
      ),
    );
    _opacity = Tween<double>(begin: 0.5, end: 0.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.0, 0.75, curve: Curves.easeOut),
      ),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Transform.scale(
          scale: _scale.value,
          child: Opacity(
            opacity: _opacity.value,
            child: child,
          ),
        );
      },
      child: Container(
        width: 80,
        height: 80,
        decoration: BoxDecoration(
          color: widget.color,
          shape: BoxShape.circle,
        ),
      ),
    );
  }
}
