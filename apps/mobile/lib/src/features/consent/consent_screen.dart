import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import '../../core/providers.dart';
import 'consent_request.dart';

class ConsentScreen extends ConsumerStatefulWidget {
  const ConsentScreen({super.key});

  @override
  ConsumerState<ConsentScreen> createState() => _ConsentScreenState();
}

class _ConsentScreenState extends ConsumerState<ConsentScreen> {
  static const double _scrollTolerance = 10.0;

  final bool _safetyMonitoring = true;
  bool _moodUnderstanding = true;
  bool _progressTracking = true;
  bool _emergencyContact = false;
  bool _isSubmitting = false;
  bool _hasScrolledToBottom = false;
  String? _errorMessage;
  late final ScrollController _scrollController;

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController();
    _scrollController.addListener(_onScroll);
    WidgetsBinding.instance.addPostFrameCallback((_) => _onScroll());
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    final maxScroll = _scrollController.position.maxScrollExtent;
    final currentScroll = _scrollController.position.pixels;
    final reached = currentScroll >= maxScroll - _scrollTolerance;
    if (reached != _hasScrolledToBottom) {
      setState(() => _hasScrolledToBottom = reached);
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    WidgetsBinding.instance.addPostFrameCallback((_) => _onScroll());
  }

  Future<void> _submit() async {
    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    final request = ConsentRequest(
      safetyMonitoring: _safetyMonitoring,
      moodInference: _moodUnderstanding,
      assessment: _progressTracking,
      emergencyContact: _emergencyContact,
    );

    try {
      await ref.read(dioClientProvider).post(
            '/users/me/consent',
            data: request.toJson(),
          );
      if (mounted) context.go('/intake');
    } on DioException catch (e) {
      debugPrint('[ConsentScreen] POST /users/me/consent failed: $e');
      if (mounted) {
        setState(() {
          _isSubmitting = false;
          _errorMessage = 'Something went wrong. Please try again.';
        });
      }
    } catch (e) {
      debugPrint('[ConsentScreen] Unexpected error: $e');
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
    final colorScheme = theme.colorScheme;

    const Color activeBg = Color(0xFF1A6B5A);
    const Color activeFg = Colors.white;
    const Color inactiveBg = Color(0xFFE8E4DF);
    const Color inactiveFg = Color(0xFFC4C0BC);

    final bool showActiveColors = _hasScrolledToBottom;
    final Color buttonBg = showActiveColors ? activeBg : inactiveBg;
    final Color buttonFg = showActiveColors ? activeFg : inactiveFg;

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Column(
          children: [
            _TopBar(onBack: context.canPop() ? () => context.pop() : null),
            const _Header(),
            Expanded(
              child: Stack(
                children: [
                  ListView(
                    controller: _scrollController,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    children: [
                      _ConsentCard(
                        icon: Icons.shield,
                        title: 'Safety monitoring',
                        description:
                            'Required to ensure a safe space during sensitive conversations.',
                        value: _safetyMonitoring,
                        onChanged: null,
                        isRequired: true,
                        theme: theme,
                        colorScheme: colorScheme,
                      ),
                      const SizedBox(height: 12),
                      _ConsentCard(
                        icon: Icons.favorite,
                        title: 'Mood understanding',
                        description:
                            'Allows Evia to adapt its tone based on your emotional state.',
                        value: _moodUnderstanding,
                        onChanged: _isSubmitting
                            ? null
                            : (v) => setState(() => _moodUnderstanding = v!),
                        theme: theme,
                        colorScheme: colorScheme,
                      ),
                      const SizedBox(height: 12),
                      _ConsentCard(
                        icon: Icons.bar_chart,
                        title: 'Progress tracking',
                        description:
                            'Collects insights to show your growth over time.',
                        value: _progressTracking,
                        onChanged: _isSubmitting
                            ? null
                            : (v) => setState(() => _progressTracking = v!),
                        theme: theme,
                        colorScheme: colorScheme,
                      ),
                      const SizedBox(height: 12),
                      _ConsentCard(
                        icon: Icons.phone,
                        title: 'Emergency contact',
                        description:
                            'Provides a trusted contact option directly within the app.',
                        value: _emergencyContact,
                        onChanged: _isSubmitting
                            ? null
                            : (v) => setState(() => _emergencyContact = v!),
                        theme: theme,
                        colorScheme: colorScheme,
                      ),
                      const SizedBox(height: 16),
                    ],
                  ),
                  if (!_hasScrolledToBottom)
                    Positioned(
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: 40,
                      child: IgnorePointer(
                        child: Container(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              colors: [
                                Colors.white.withValues(alpha: 0),
                                Colors.white,
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
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
                  onPressed:
                      showActiveColors && !_isSubmitting ? _submit : null,
                  style: ButtonStyle(
                    backgroundColor: WidgetStatePropertyAll(buttonBg),
                    foregroundColor: WidgetStatePropertyAll(buttonFg),
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
                      : const Text('Save and continue'),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                'You can change any of these in Settings > Privacy.',
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
  final VoidCallback? onBack;

  const _TopBar({this.onBack});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
      child: Row(
        children: [
          SizedBox(
            width: 48,
            child: onBack != null
                ? IconButton(
                    icon: const Icon(Icons.arrow_back),
                    onPressed: onBack,
                  )
                : null,
          ),
          Expanded(
            child: Center(
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                decoration: BoxDecoration(
                  color: theme.colorScheme.primary,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  'Step 1 of 8',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.onPrimary,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 48),
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
            'Before we begin',
            style: theme.textTheme.headlineMedium?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'A few things to know about how Evia works.',
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
                    Text(
                      title,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
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
                          'Required',
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
