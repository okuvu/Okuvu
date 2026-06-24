import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'src/app.dart';
import 'src/config/app_config.dart';

void main() {
  AppConfig.init();

  debugPrint('========================================');
  debugPrint('  Evia — Starting up');
  debugPrint('  Environment: ${AppConfig.environment.label}');
  debugPrint('  Base URL:    ${AppConfig.baseUrl}');
  debugPrint('========================================');

  runApp(const ProviderScope(child: App()));
}
