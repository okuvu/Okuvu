import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../../../core/websocket_service.dart';

class ReconnectBanner extends ConsumerWidget {
  const ReconnectBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final showBanner = ref.watch(wsShowBannerProvider);
    final wsState = ref.watch(wsConnectionStateProvider);

    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 300),
      transitionBuilder: (child, animation) => SizeTransition(
        sizeFactor: animation,
        child: FadeTransition(opacity: animation, child: child),
      ),
      child: showBanner
          ? _BannerContent(
              wsState: wsState,
              onRetry: () => ref.read(webSocketServiceProvider).retry(),
            )
          : const SizedBox.shrink(key: ValueKey('hidden')),
    );
  }
}

class _BannerContent extends StatelessWidget {
  final WsConnectionState wsState;
  final VoidCallback onRetry;

  const _BannerContent({
    required this.wsState,
    required this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    final isRetryMode = wsState == WsConnectionState.error;
    final theme = Theme.of(context);

    return Container(
      key: const ValueKey('banner'),
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: theme.colorScheme.secondaryContainer,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (isRetryMode)
            Icon(
              LucideIcons.wifiOff,
              size: 18,
              color: theme.colorScheme.onSecondaryContainer,
            )
          else
            SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: theme.colorScheme.onSecondaryContainer,
              ),
            ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              isRetryMode ? 'Connection lost' : 'Reconnecting\u2026',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSecondaryContainer,
              ),
            ),
          ),
          if (isRetryMode)
            TextButton(
              onPressed: onRetry,
              style: TextButton.styleFrom(
                foregroundColor: theme.colorScheme.onSecondaryContainer,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: const Text('Retry'),
            ),
        ],
      ),
    );
  }
}
