import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'src/app.dart';
import 'src/config/app_config.dart';

void main() {
  runZonedGuarded(() async {
    WidgetsFlutterBinding.ensureInitialized();

    String startupError = '';

    try {
      AppConfig.init();
    } catch (e, st) {
      startupError = 'AppConfig.init failed: $e\n$st';
      debugPrint('========================================');
      debugPrint(startupError);
      debugPrint('========================================');
      runApp(_FatalErrorApp(message: startupError));
      return;
    }

    try {
      await Firebase.initializeApp();
    } catch (e, st) {
      startupError = 'Firebase.initializeApp failed: $e\n$st';
      debugPrint('========================================');
      debugPrint(startupError);
      debugPrint('========================================');
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

    debugPrint('========================================');
    debugPrint('  Evia — Starting up');
    debugPrint('  Environment: ${AppConfig.environment.label}');
    debugPrint('  Base URL:    ${AppConfig.apiBaseUrl}');
    debugPrint('========================================');

    runApp(const ProviderScope(child: App()));
  }, (error, stack) {
    FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
    debugPrint('========================================');
    debugPrint('  Evia — Unhandled error during startup');
    debugPrint('  $error');
    debugPrint('  $stack');
    debugPrint('========================================');
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
        backgroundColor: const Color(0xFF1A6B5A),
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Evia',
                  style: TextStyle(
                    fontSize: 40.0,
                    fontWeight: FontWeight.bold,
                    fontFamily: 'Inter',
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 16.0),
                const Text(
                  'The app failed to start.',
                  style: TextStyle(
                    fontSize: 18.0,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 16.0),
                Expanded(
                  child: SingleChildScrollView(
                    child: Text(
                      message,
                      style: const TextStyle(
                        fontSize: 12.0,
                        color: Colors.white70,
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
