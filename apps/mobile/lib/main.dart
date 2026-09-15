import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'src/app.dart';
import 'src/config/app_config.dart';
import 'src/core/logger.dart';
import 'src/theme/app_colors.dart';
import 'src/features/intake/onboarding_provider.dart';

void main() {
  runZonedGuarded(() async {
    WidgetsFlutterBinding.ensureInitialized();

    String startupError = '';

    try {
      AppConfig.init();
    } catch (e, st) {
      startupError = 'AppConfig.init failed: $e\n$st';
      Logger.debug('========================================');
      Logger.debug(startupError);
      Logger.debug('========================================');
      runApp(_FatalErrorApp(message: startupError));
      return;
    }

    try {
      await Firebase.initializeApp();
    } catch (e, st) {
      startupError = 'Firebase.initializeApp failed: $e\n$st';
      Logger.debug('========================================');
      Logger.debug(startupError);
      Logger.debug('========================================');
      runApp(_FatalErrorApp(message: startupError));
      return;
    }

    FlutterError.onError = (details) {
      FirebaseCrashlytics.instance.recordFlutterFatalError(details);
    };

    PlatformDispatcher.instance.onError = (error, stack) {
      FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
      return true;
    };

    Logger.debug('========================================');
      Logger.debug('  Okuvu — Starting up');
    Logger.debug('  Environment: ${AppConfig.environment.label}');
    Logger.debug('  Base URL:    ${AppConfig.apiBaseUrl}');
    Logger.debug('========================================');

    final prefs = await SharedPreferences.getInstance();

    runApp(ProviderScope(
      overrides: [
        hasCompletedOnboardingProvider.overrideWith(
          () => OnboardingCompleteNotifier(prefs),
        ),
      ],
      child: const App(),
    ));
  }, (error, stack) {
    FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
    Logger.debug('========================================');
      Logger.debug('  Okuvu — Unhandled error during startup');
    Logger.debug('  $error');
    Logger.debug('  $stack');
    Logger.debug('========================================');
  });
}

class _FatalErrorApp extends StatelessWidget {
  const _FatalErrorApp({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        backgroundColor: AppColors.royalNight,
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'OKUVU',
                  style: TextStyle(
                    fontSize: 32.0,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 3.2,
                    color: AppColors.lavenderTint,
                  ),
                ),
                const SizedBox(height: 16.0),
                const Text(
                  'The app failed to start.',
                  style: TextStyle(
                    fontSize: 18.0,
                    color: AppColors.lavenderTint,
                  ),
                ),
                const SizedBox(height: 16.0),
                Expanded(
                  child: SingleChildScrollView(
                    child: Text(
                      message,
                      style: TextStyle(
                        fontSize: 12.0,
                        color: AppColors.lavenderTint.withValues(alpha: 0.7),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
