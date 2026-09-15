import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../chat/models/tool_card_config.dart';
import '../chat/widgets/tool_card_widget.dart';
import '../../widgets/okuvu_app_bar_title.dart';

const _defaultConfig = ToolCardConfig(
  type: ToolCardType.guidedBreathing,
  breathingConfig: BreathingConfig(
    inhaleSeconds: 4,
    holdSeconds: 2,
    exhaleSeconds: 6,
    cycles: 3,
    label: 'Breathing Exercise',
  ),
);

class BreathingScreen extends StatelessWidget {
  final ToolCardConfig config;

  const BreathingScreen({this.config = _defaultConfig, super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: const OkuvuAppBarTitle('Breathing Exercise'),
      ),
      body: ToolCardWidget(config: config),
    );
  }
}
