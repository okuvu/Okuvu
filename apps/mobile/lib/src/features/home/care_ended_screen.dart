import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/providers.dart';
import '../../theme/app_colors.dart';
import '../journal/journal_entry.dart';

/// Decisions doc round, 15 Sep 2026 §11 — the graceful close screen shown
/// when a therapist has ended care. Locked copy only; the "still open"
/// product questions (hold vs. waitlist-redirect on next launch, whether
/// journal/export stays permanent, re-provisioning) are deliberately not
/// answered here — this screen just holds, with no further redirect logic.
class CareEndedScreen extends ConsumerStatefulWidget {
  final String? therapistName;

  /// Overridable for tests — the real OS share sheet has no responder in a
  /// widget-test environment and can leave a platform channel call (and its
  /// underlying timer) pending past test teardown.
  final Future<void> Function(ShareParams params)? shareOverride;

  const CareEndedScreen({this.therapistName, this.shareOverride, super.key});

  @override
  ConsumerState<CareEndedScreen> createState() => _CareEndedScreenState();
}

class _CareEndedScreenState extends ConsumerState<CareEndedScreen> {
  bool _isExporting = false;

  Future<void> _exportJournal() async {
    setState(() => _isExporting = true);
    try {
      final entries = await ref.read(journalListProvider.future);
      final buffer = StringBuffer('My OKUVU journal\n\n');
      for (final entry in entries.reversed) {
        buffer.writeln('${entry.createdAt.toLocal()}');
        buffer.writeln('Feeling: ${journalEmotionLabels[entry.emotion] ?? entry.emotion} '
            '(${entry.intensity}/5)');
        buffer.writeln(entry.content);
        buffer.writeln('---');
      }
      final share = widget.shareOverride ?? SharePlus.instance.share;
      await share(
        ShareParams(text: buffer.toString(), subject: 'My OKUVU journal'),
      );
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Couldn't export your journal. Please try again.")),
        );
      }
    } finally {
      if (mounted) setState(() => _isExporting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final therapist = widget.therapistName ?? 'Your therapist';

    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: Colors.white,
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              child: Container(
                constraints: const BoxConstraints(maxWidth: 390),
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: const BoxDecoration(
                        color: AppColors.lavenderTint,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(LucideIcons.heart, size: 48, color: AppColors.royalPurple),
                    ),
                    const SizedBox(height: 24),
                    const Text(
                      'Your therapist has closed this space.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w600,
                        color: AppColors.charcoalInk,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'This can bring up a lot, and whatever you\'re feeling is fair. '
                      '$therapist has ended your care on OKUVU — that\'s a decision between the two of you, not a verdict on you.',
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 15, color: AppColors.inkSoft, height: 22 / 15),
                    ),
                    const SizedBox(height: 20),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: AppColors.oat,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: AppColors.hairline),
                      ),
                      child: const Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Still true',
                              style: TextStyle(fontWeight: FontWeight.w600, color: AppColors.charcoalInk)),
                          SizedBox(height: 8),
                          Text('• The crisis line stays — always one tap away.',
                              style: TextStyle(color: AppColors.inkSoft, fontSize: 14)),
                          SizedBox(height: 4),
                          Text('• Your journal is still yours, export any time.',
                              style: TextStyle(color: AppColors.inkSoft, fontSize: 14)),
                          SizedBox(height: 4),
                          Text('• Reminders stop, and chat goes read-only.',
                              style: TextStyle(color: AppColors.inkSoft, fontSize: 14)),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),
                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: FilledButton.icon(
                        onPressed: () => ref.read(crisisOverlayProvider.notifier).show(),
                        style: FilledButton.styleFrom(backgroundColor: AppColors.crisis),
                        icon: const Icon(LucideIcons.phoneCall),
                        label: const Text('Get support now'),
                      ),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: OutlinedButton.icon(
                        onPressed: _isExporting ? null : _exportJournal,
                        icon: _isExporting
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(LucideIcons.download),
                        label: const Text('Export my writing'),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      child: Text(
                        "If this wasn't what you expected, you can talk to $therapist directly.",
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontSize: 13, color: AppColors.inkSoft),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
