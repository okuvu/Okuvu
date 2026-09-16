import 'package:flutter/material.dart';

import 'guided_breathing_card.dart';
import '../models/tool_card_config.dart';
import 'grounding_card.dart';

class ToolCardWidget extends StatelessWidget {
  final ToolCardConfig config;
  const ToolCardWidget({required this.config, super.key});

  @override
  Widget build(BuildContext context) {
    switch (config.type) {
      case ToolCardType.guidedBreathing:
      case ToolCardType.boxBreathing:
      case ToolCardType.physiologicalSigh:
      case ToolCardType.extendedExhale:
        return GuidedBreathingCard(config: config);
      case ToolCardType.grounding5431:
        return const GroundingCard();
    }
  }
}
