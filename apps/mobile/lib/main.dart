import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_core/firebase_core.dart';
import 'src/app.dart';
import 'src/config/app_config.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  AppConfig.init();

  await Firebase.initializeApp();

  debugPrint('========================================');
  debugPrint('  Evia — Starting up');
  debugPrint('  Environment: ${AppConfig.environment.label}');
  debugPrint('  Base URL:    ${AppConfig.baseUrl}');
  debugPrint('========================================');

  runApp(const ProviderScope(child: App()));
}
