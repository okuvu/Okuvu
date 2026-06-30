import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'router/router.dart';
import 'core/providers.dart';
import 'features/crisis/crisis_overlay.dart';

class App extends ConsumerWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerConfigProvider);

    return MaterialApp.router(
      title: 'Evia',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorSchemeSeed: Colors.teal,
        useMaterial3: true,
      ),
      routerConfig: router,
      builder: (context, child) {
        return Stack(
          children: [
            child ?? const SizedBox.shrink(),
            const _CrisisOverlaySlot(),
          ],
        );
      },
    );
  }
}

class _CrisisOverlaySlot extends ConsumerWidget {
  const _CrisisOverlaySlot();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final showCrisis = ref.watch(crisisOverlayProvider);
    if (!showCrisis) return const SizedBox.shrink();
    return const CrisisOverlay();
  }
}
