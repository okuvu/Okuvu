import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'journal_entry.dart';
import 'journal_provider.dart';

class JournalScreen extends ConsumerStatefulWidget {
  const JournalScreen({super.key});

  @override
  ConsumerState<JournalScreen> createState() => _JournalScreenState();
}

class _JournalScreenState extends ConsumerState<JournalScreen> {
  final _textController = TextEditingController();
  bool _privacyNoticeDismissed = false;
  final _textFocusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    _loadPrivacyNotice();
  }

  @override
  void dispose() {
    _textController.dispose();
    _textFocusNode.dispose();
    super.dispose();
  }

  Future<void> _loadPrivacyNotice() async {
    final prefs = await SharedPreferences.getInstance();
    final dismissed = prefs.getBool('journal_privacy_notice_dismissed') ?? false;
    if (mounted) {
      setState(() {
        _privacyNoticeDismissed = dismissed;
      });
    }
  }

  Future<void> _dismissPrivacyNotice() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('journal_privacy_notice_dismissed', true);
    if (mounted) {
      setState(() {
        _privacyNoticeDismissed = true;
      });
    }
  }

  String _formatDate() {
    final now = DateTime.now();
    const weekdays = [
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday',
      'Saturday', 'Sunday',
    ];
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    int hour = now.hour;
    final minute = now.minute.toString().padLeft(2, '0');
    final period = hour >= 12 ? 'PM' : 'AM';
    hour = hour == 0 ? 12 : (hour > 12 ? hour - 12 : hour);
    return '${weekdays[now.weekday - 1]}, ${now.day} ${months[now.month - 1]} · $hour:$minute $period';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final formState = ref.watch(journalEntryFormProvider);

    ref.listen<JournalEntryFormState>(journalEntryFormProvider, (prev, next) {
      if (next.saved && !(prev?.saved ?? false)) {
        ref.invalidate(journalListProvider);
        context.go('/home');
      }
    });

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) context.go('/home');
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => context.go('/home'),
          ),
          title: const Text('Journal'),
        ),
        body: GestureDetector(
          onTap: () => _textFocusNode.unfocus(),
          child: ListView(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            children: [
              if (!_privacyNoticeDismissed) ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.lock_outline, size: 16),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          "Your journal is private. OKUVU doesn't read it and your therapist can't see it.",
                          style: theme.textTheme.bodySmall,
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close, size: 16),
                        onPressed: _dismissPrivacyNotice,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
              ],
              Text(
                _formatDate(),
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 20),
              Text(
                'How are you feeling?',
                style: theme.textTheme.titleMedium,
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: journalEmotions.map((emotion) {
                  final isSelected = formState.emotion == emotion;
                  final bgColor = emotionColors[emotion] ?? const Color(0xFFF4F6F8);

                  return GestureDetector(
                    onTap: () => ref
                        .read(journalEntryFormProvider.notifier)
                        .setEmotion(emotion),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 8,
                      ),
                      decoration: BoxDecoration(
                        color: isSelected
                            ? bgColor
                            : bgColor.withAlpha(128),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: isSelected
                              ? theme.colorScheme.outline
                              : theme.colorScheme.outline.withAlpha(64),
                        ),
                      ),
                      child: Text(
                        journalEmotionLabels[emotion] ?? emotion,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontWeight:
                              isSelected ? FontWeight.w600 : FontWeight.normal,
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: 24),
              Text(
                'How strong is it?',
                style: theme.textTheme.titleMedium,
              ),
              const SizedBox(height: 12),
              Row(
                children: List.generate(5, (index) {
                  final dotIndex = index + 1;
                  final isFilled = dotIndex <= formState.intensity;

                  return GestureDetector(
                    onTap: () => ref
                        .read(journalEntryFormProvider.notifier)
                        .setIntensity(dotIndex),
                    child: Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: Icon(
                        isFilled ? Icons.circle : Icons.circle_outlined,
                        size: 28,
                        color: isFilled
                            ? theme.colorScheme.primary
                            : theme.colorScheme.outline.withAlpha(128),
                      ),
                    ),
                  );
                }),
              ),
              const SizedBox(height: 24),
              Text(
                "What's on your mind?",
                style: theme.textTheme.titleMedium,
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _textController,
                focusNode: _textFocusNode,
                maxLines: null,
                minLines: 4,
                onChanged: (value) => ref
                    .read(journalEntryFormProvider.notifier)
                    .setContent(value),
                decoration: InputDecoration(
                  hintText: 'Write anything \u2014 this is just for you.',
                  hintStyle: TextStyle(
                    color: theme.colorScheme.onSurfaceVariant.withAlpha(128),
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              if (formState.error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(
                    formState.error!,
                    style: TextStyle(color: theme.colorScheme.error),
                  ),
                ),
              Row(
                children: [
                  Expanded(
                    child: FilledButton(
                      onPressed:
                          formState.isValid && !formState.isSaving
                              ? () async {
                                  final success = await ref
                                      .read(journalEntryFormProvider.notifier)
                                      .save();
                                  if (success && context.mounted) {
                                    ref.invalidate(journalListProvider);
                                    context.go('/home');
                                  }
                                }
                              : null,
                      style: FilledButton.styleFrom(
                        backgroundColor: theme.colorScheme.primary,
                      ),
                      child: formState.isSaving
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Text('Save'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => context.go('/home'),
                      child: const Text('Cancel'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Center(
                child: TextButton(
                  onPressed: () => context.go('/journal/history'),
                  child: const Text('View History'),
                ),
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }
}
