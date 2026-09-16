import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/today_card_provider.dart';
import '../../../core/providers.dart';

/// Decisions doc round, 15 Sep 2026 §9 — "the ask + Grant / Not now." Shown
/// when a therapist has requested to see summaries of the client's chats
/// and the client hasn't answered yet. Grant/deny is the client's own
/// action, via PATCH /users/me/chat-access (chatAccessRequestProvider) —
/// the portal can only indicate + request, never set this directly.
/// "Not now" is silent — the therapist only ever sees "Not shared", never
/// that a request was declined (§9 rules).
class PendingChatAccessBanner extends ConsumerStatefulWidget {
  const PendingChatAccessBanner({super.key});

  @override
  ConsumerState<PendingChatAccessBanner> createState() => _PendingChatAccessBannerState();
}

class _PendingChatAccessBannerState extends ConsumerState<PendingChatAccessBanner> {
  bool _dismissed = false;
  bool _isResponding = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final todayAsync = ref.watch(todayCardProvider);
    final pending = todayAsync.value?.pendingChatAccessRequest;
    // Never surface this mid-crisis (§9 rules) — the crisis overlay already
    // takes over the whole screen when active, but this guards against any
    // stale build racing in before that intercept.
    final crisisActive = ref.watch(crisisOverlayProvider);

    if (_dismissed || pending == null || crisisActive) return const SizedBox.shrink();

    Future<void> respond(bool granted) async {
      setState(() => _isResponding = true);
      final success = await ref
          .read(chatAccessRequestProvider.notifier)
          .respond(therapistId: pending.therapistId, granted: granted);
      if (!mounted) return;
      setState(() => _isResponding = false);
      if (success) {
        setState(() => _dismissed = true);
      } else if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Couldn't save that. Please try again.")),
        );
      }
    }

    final therapistLabel = pending.therapistName ?? 'Your therapist';

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.colorScheme.primary.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '$therapistLabel asked to see summaries of your chats.',
            style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 4),
          Text(
            'It means the themes you two talk about — not your messages. Your chats work exactly the same either way; this only changes what they can read. You can switch it off any time.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              TextButton(
                onPressed: _isResponding ? null : () => setState(() => _dismissed = true),
                child: const Text('Not now'),
              ),
              const Spacer(),
              FilledButton(
                onPressed: _isResponding ? null : () => respond(true),
                child: const Text('Grant'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
