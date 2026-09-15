import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../features/settings/quote_of_day_notifier.dart';
import '../theme/app_colors.dart';

/// okuvu-remaining-changes.md O6 — Settings toggle for the care-plan-aware
/// quote of the day. Mirrors VoiceToggle's SwitchListTile shape.
class QuoteOfDayToggle extends ConsumerWidget {
  const QuoteOfDayToggle({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final quoteSettings = ref.watch(quoteOfDaySettingsStateProvider);

    if (quoteSettings.isLoading) {
      return const ListTile(
        leading: Icon(LucideIcons.quote),
        title: Text('Quote of the Day'),
        trailing: SizedBox(
          width: 24,
          height: 24,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    }

    return SwitchListTile(
      secondary: const Icon(LucideIcons.quote),
      title: const Text('Quote of the Day'),
      subtitle: const Text('A short supportive line on your Home screen'),
      value: quoteSettings.enabled,
      onChanged: (value) => ref.read(quoteOfDaySettingsProvider.notifier).setEnabled(value),
      activeThumbColor: AppColors.violet,
      inactiveTrackColor: AppColors.hairline,
    );
  }
}
