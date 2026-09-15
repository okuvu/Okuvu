import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../chat/models/tool_card_config.dart';
import '../../widgets/okuvu_app_bar_title.dart';
import '../../theme/app_colors.dart';
import 'breathing_screen.dart';

const _racingConfig = BreathingConfig(
  inhaleSeconds: 4,
  holdSeconds: 4,
  exhaleSeconds: 4,
  secondHoldSeconds: 4,
  cycles: 4,
  label: 'Box Breathing',
  isBoxVisual: true,
);

const _heavyConfig = BreathingConfig(
  inhaleSeconds: 4,
  holdSeconds: 2,
  exhaleSeconds: 8,
  cycles: 4,
  label: 'Extended Exhale',
);

class BreathingPickerScreen extends StatelessWidget {
  const BreathingPickerScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: const OkuvuAppBarTitle('Breathe'),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'How are you feeling right now?',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
              ),
              const SizedBox(height: 4),
              const Text(
                "We'll pick a technique that fits.",
                style: TextStyle(color: AppColors.inkSoft, fontSize: 14),
              ),
              const SizedBox(height: 24),
              _FeltStateOption(
                icon: LucideIcons.wind,
                title: 'Racing / panicky',
                subtitle: 'Box breathing — steady, even counts',
                onTap: () => _openBreathing(
                  context,
                  const ToolCardConfig(
                    type: ToolCardType.boxBreathing,
                    breathingConfig: _racingConfig,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              _FeltStateOption(
                icon: LucideIcons.cloudOff,
                title: 'Heavy',
                subtitle: 'Extended exhale — long, slow release',
                onTap: () => _openBreathing(
                  context,
                  const ToolCardConfig(
                    type: ToolCardType.guidedBreathing,
                    breathingConfig: _heavyConfig,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              _FeltStateOption(
                icon: LucideIcons.mountain,
                title: 'Overwhelmed',
                subtitle: '5-4-3-2-1 grounding — come back to now',
                onTap: () => _openBreathing(
                  context,
                  const ToolCardConfig(type: ToolCardType.grounding5431),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _openBreathing(BuildContext context, ToolCardConfig config) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => BreathingScreen(config: config),
      ),
    );
  }
}

class _FeltStateOption extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _FeltStateOption({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.hairline),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AppColors.lavenderTint,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: AppColors.royalPurple, size: 22),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 15,
                        color: AppColors.charcoalInk,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        fontSize: 13,
                        color: AppColors.inkSoft,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(LucideIcons.chevronRight, color: AppColors.inkSoft, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}
