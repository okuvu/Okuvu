import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;
import 'package:permission_handler/permission_handler.dart';
import 'journal_entry.dart';
import 'journal_provider.dart';
import 'journal_prompt_service.dart';
import '../home/widgets/home_bottom_nav.dart';
import '../../widgets/okuvu_app_bar_title.dart';
import '../../theme/app_colors.dart';

// Mirrors apps/api/src/routes/journal.ts's MAX_CONTENT_LENGTH — keep the
// two in sync if either changes.
const int _maxJournalContentLength = 10000;

class JournalScreen extends ConsumerStatefulWidget {
  const JournalScreen({super.key});

  @override
  ConsumerState<JournalScreen> createState() => _JournalScreenState();
}

class _JournalScreenState extends ConsumerState<JournalScreen> {
  final _textController = TextEditingController();
  bool _privacyNoticeDismissed = false;
  final _textFocusNode = FocusNode();

  final _speech = stt.SpeechToText();
  bool _isListening = false;
  String _voiceBaseText = '';

  bool _isFetchingPrompt = false;

  @override
  void initState() {
    super.initState();
    _loadPrivacyNotice();
    // okuvu-remaining-changes.md §C.4: chat->journal handoff. The form
    // provider isn't autoDispose, so a prompt set via setContent() just
    // before navigating here (see chat_screen.dart) survives into this
    // screen — but the visible TextField is driven by its own controller,
    // never initialized from provider state, so it must be seeded here.
    final prefill = ref.read(journalEntryFormProvider).content;
    if (prefill.isNotEmpty) {
      _textController.text = prefill;
    }
  }

  @override
  void dispose() {
    _speech.stop();
    _textController.dispose();
    _textFocusNode.dispose();
    super.dispose();
  }

  // J1 — talk-to-journal voice input. Transcribed text is appended to
  // whatever was already in the field, updating both the controller (what's
  // visibly rendered) and the form provider (what actually gets saved) —
  // the same dual-state update the chat-handoff prefill above requires,
  // since the TextField's controller is never provider-driven.
  Future<void> _toggleListening() async {
    if (_isListening) {
      await _speech.stop();
      if (mounted) setState(() => _isListening = false);
      return;
    }

    final micStatus = await Permission.microphone.request();
    if (!micStatus.isGranted) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Microphone access is needed to talk instead of type.'),
          ),
        );
      }
      return;
    }

    final available = await _speech.initialize(
      onStatus: (status) {
        if ((status == 'done' || status == 'notListening') && mounted) {
          setState(() => _isListening = false);
        }
      },
      onError: (_) {
        if (mounted) setState(() => _isListening = false);
      },
    );

    if (!available) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Voice input isn't available on this device.")),
        );
      }
      return;
    }

    _voiceBaseText = _textController.text;
    if (mounted) setState(() => _isListening = true);

    await _speech.listen(
      onResult: (result) {
        final transcript = result.recognizedWords;
        final combined = _voiceBaseText.isEmpty || transcript.isEmpty
            ? '$_voiceBaseText$transcript'
            : '$_voiceBaseText $transcript';
        _textController.value = TextEditingValue(
          text: combined,
          selection: TextSelection.collapsed(offset: combined.length),
        );
        ref.read(journalEntryFormProvider.notifier).setContent(combined);
      },
    );
  }

  // J2 — writing prompt. Serves a sentence from the vetted prompt library
  // (server-side, journal-prompt/prompt-library.ts) and puts it straight into
  // the text area, which is where the client asked to see it. Two properties
  // matter and both used to be missing: it always answers — the library read
  // is cheap, and an offline phone falls back to a built-in set rather than a
  // dead tap — and it never destroys what was already written, because it
  // appends and the confirmation offers Undo.
  Future<void> _fetchPrompt() async {
    if (_isFetchingPrompt) return;
    setState(() => _isFetchingPrompt = true);

    final prompt = await ref.read(journalPromptServiceProvider).next(
          emotion: ref.read(journalEntryFormProvider).emotion,
        );

    if (!mounted) return;
    setState(() => _isFetchingPrompt = false);
    _insertPrompt(prompt);
  }

  void _insertPrompt(String prompt) {
    final before = _textController.text;
    final base = before.trimRight();
    final combined = base.isEmpty ? '$prompt\n\n' : '$base\n\n$prompt\n\n';

    _textController.value = TextEditingValue(
      text: combined,
      selection: TextSelection.collapsed(offset: combined.length),
    );
    ref.read(journalEntryFormProvider.notifier).setContent(combined);
    _textFocusNode.requestFocus();

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: const Text('Prompt added — write below it.'),
        action: SnackBarAction(
          label: 'Undo',
          onPressed: () {
            _textController.value = TextEditingValue(
              text: before,
              selection: TextSelection.collapsed(offset: before.length),
            );
            ref.read(journalEntryFormProvider.notifier).setContent(before);
          },
        ),
      ),
    );
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
        // Clear the form (including any chat-handoff prefill) so a later,
        // unrelated visit to Journal doesn't silently reopen with this
        // entry's text still sitting in the (non-autoDispose) provider.
        ref.read(journalEntryFormProvider.notifier).reset();
        context.go('/home');
      }
    });

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) {
          ref.read(journalEntryFormProvider.notifier).reset();
          context.go('/home');
        }
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(LucideIcons.arrowLeft),
            onPressed: () {
              ref.read(journalEntryFormProvider.notifier).reset();
              context.go('/home');
            },
          ),
          title: const OkuvuAppBarTitle('Journal'),
        ),
        bottomNavigationBar: const HomeBottomNav(currentIndex: 2),
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
                      const Icon(LucideIcons.lock, size: 16),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          "Your journal is private. OKUVU doesn't read it and your therapist can't see it.",
                          style: theme.textTheme.bodySmall,
                        ),
                      ),
                      IconButton(
                        icon: const Icon(LucideIcons.x, size: 16),
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
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'How are you feeling? (optional)',
                      style: theme.textTheme.titleMedium,
                    ),
                  ),
                  // A visible way back to "no mood". The chips used to answer a
                  // tap with a change of roughly one shade, so a client who had
                  // selected one had no way of knowing it, and no way of undoing
                  // it. Both are now on screen.
                  if (formState.emotion != null)
                    TextButton(
                      key: const ValueKey('journal_clear_mood_button'),
                      onPressed: () {
                        HapticFeedback.selectionClick();
                        ref.read(journalEntryFormProvider.notifier).clearMood();
                      },
                      child: const Text('Clear'),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: journalEmotions.map((emotion) {
                  final isSelected = formState.emotion == emotion;
                  final bgColor = emotionColors[emotion] ?? AppColors.lavenderWash;
                  final label = journalEmotionLabels[emotion] ?? emotion;

                  return Semantics(
                    button: true,
                    selected: isSelected,
                    label: label,
                    child: GestureDetector(
                      key: Key('emotionChip_$emotion'),
                      // Taps must land on the whole chip, including the gap
                      // around the label, and must be felt: the old chip gave
                      // no sign a tap had registered at all.
                      behavior: HitTestBehavior.opaque,
                      onTap: () {
                        HapticFeedback.selectionClick();
                        ref
                            .read(journalEntryFormProvider.notifier)
                            .toggleEmotion(emotion);
                      },
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 150),
                        constraints: const BoxConstraints(minHeight: 48),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 8,
                        ),
                        decoration: BoxDecoration(
                          color: isSelected
                              ? bgColor
                              : bgColor.withAlpha(90),
                          borderRadius: BorderRadius.circular(24),
                          border: Border.all(
                            color: isSelected
                                ? AppColors.violet
                                : AppColors.hairline,
                            width: isSelected ? 2 : 1,
                          ),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (isSelected) ...[
                              const Icon(
                                LucideIcons.check,
                                size: 16,
                                color: AppColors.violet,
                              ),
                              const SizedBox(width: 6),
                            ],
                            Text(
                              label,
                              style: theme.textTheme.bodyMedium?.copyWith(
                                color: isSelected
                                    ? AppColors.charcoalInk
                                    : theme.colorScheme.onSurface,
                                fontWeight: isSelected
                                    ? FontWeight.w700
                                    : FontWeight.normal,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: 24),
              Text(
                'How strong is it? (optional)',
                style: theme.textTheme.titleMedium,
              ),
              const SizedBox(height: 12),
              Row(
                children: List.generate(5, (index) {
                  final dotIndex = index + 1;
                  final isFilled = dotIndex <= formState.intensity;

                  return GestureDetector(
                    key: Key('intensityDot_$dotIndex'),
                    behavior: HitTestBehavior.opaque,
                    onTap: () {
                      HapticFeedback.selectionClick();
                      ref
                          .read(journalEntryFormProvider.notifier)
                          .setIntensity(dotIndex);
                    },
                    // 48x48 of tappable area around a 24px dot: the dot stays
                    // the size the design asks for, but the target is a size a
                    // thumb can actually hit.
                    child: SizedBox(
                      width: 48,
                      height: 48,
                      child: Center(
                        child: Container(
                          width: 24,
                          height: 24,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: isFilled ? theme.colorScheme.primary : null,
                            border: isFilled
                                ? null
                                : Border.all(
                                    color:
                                        theme.colorScheme.outline.withAlpha(128),
                                    width: 2,
                                  ),
                          ),
                        ),
                      ),
                    ),
                  );
                }),
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Text(
                    "What's on your mind?",
                    style: theme.textTheme.titleMedium,
                  ),
                  const Spacer(),
                  TextButton.icon(
                    onPressed: _isFetchingPrompt ? null : _fetchPrompt,
                    icon: _isFetchingPrompt
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(LucideIcons.sparkles, size: 16),
                    label: const Text('Get a prompt'),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _textController,
                focusNode: _textFocusNode,
                maxLines: null,
                minLines: 4,
                maxLength: _maxJournalContentLength,
                maxLengthEnforcement: MaxLengthEnforcement.enforced,
                onChanged: (value) => ref
                    .read(journalEntryFormProvider.notifier)
                    .setContent(value),
                decoration: InputDecoration(
                  hintText: 'Write anything \u2014 this is just for you.',
                  hintStyle: TextStyle(
                    color: theme.colorScheme.onSurfaceVariant.withAlpha(128),
                  ),
                  counterText: '',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  suffixIcon: IconButton(
                    key: const ValueKey('journal_voice_input_button'),
                    icon: Icon(
                      _isListening ? LucideIcons.circleDot : LucideIcons.mic,
                      color: _isListening ? theme.colorScheme.error : null,
                    ),
                    tooltip: _isListening ? 'Stop' : 'Talk instead of type',
                    onPressed: _toggleListening,
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
                      onPressed: () {
                        ref.read(journalEntryFormProvider.notifier).reset();
                        context.go('/home');
                      },
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
