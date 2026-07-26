import 'package:flutter/material.dart';

import '../chat/models/tool_card_config.dart';
import '../chat/widgets/guided_breathing_card.dart';

class BreathingScreen extends StatelessWidget {
  const BreathingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: const Text('Breathing Exercise'),
      ),
      body: const GuidedBreathingCard(
        config: ToolCardConfig(
          type: ToolCardType.guidedBreathing,
          breathingConfig: BreathingConfig(
            inhaleSeconds: 4,
            holdSeconds: 2,
            exhaleSeconds: 6,
            cycles: 3,
            label: 'Breathing Exercise',
          ),
        ),
      ),
    );
  }
}
