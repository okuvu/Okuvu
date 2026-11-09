import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../theme/app_colors.dart';
import '../../widgets/okuvu_app_bar_title.dart';

/// The Treasure Box, as a placeholder.
///
/// Owner's Step 5 instruction: the entry exists and leads here, and the box
/// itself is built in Step 6A. Deliberately not pretending: no empty state, no
/// add button, no collections — those arrive with the real screen, and a client
/// who taps "Add" here would be promised something that does not exist.
class TreasureBoxScreen extends StatelessWidget {
  const TreasureBoxScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft),
          onPressed: () => context.go('/toolkit'),
        ),
        title: const OkuvuAppBarTitle('Treasure Box'),
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(LucideIcons.gift, size: 40, color: AppColors.violet),
              const SizedBox(height: 16),
              Text(
                'Your Treasure Box opens here soon.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
