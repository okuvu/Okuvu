import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/providers.dart';

class CrisisOverlay extends ConsumerWidget {
  const CrisisOverlay({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GestureDetector(
      onTap: () => ref.read(crisisOverlayProvider.notifier).state = false,
      child: Container(
        color: Colors.black38,
        alignment: Alignment.center,
        child: GestureDetector(
          onTap: () {},
          child: Card(
            margin: const EdgeInsets.all(32),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.emergency, size: 48,
                    color: Theme.of(context).colorScheme.error),
                  const SizedBox(height: 16),
                  Text('Crisis Support',
                    style: Theme.of(context).textTheme.headlineSmall),
                  const SizedBox(height: 12),
                  const Text(
                    'If you\'re in immediate danger, please call emergency services.',
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Crisis overlay content — coming in E6-S02.',
                    style: TextStyle(fontStyle: FontStyle.italic),
                  ),
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: () => ref.read(crisisOverlayProvider.notifier).state = false,
                    child: const Text('Dismiss'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
