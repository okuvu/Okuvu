import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/splash/splash_screen.dart';
import '../features/auth/auth_screen.dart';
import '../features/auth/otp_screen.dart';
import '../features/consent/consent_screen.dart';
import '../features/intake/intake_screen.dart';
import '../features/home/home_screen.dart';
import '../features/chat/chat_screen.dart';
import '../features/progress/progress_screen.dart';
import '../features/settings/settings_screen.dart';
import '../features/settings/profile_screen.dart';
import '../features/settings/notifications_screen.dart';
import '../features/settings/privacy_screen.dart';
import '../features/settings/about_screen.dart';
import '../core/not_found_screen.dart';
import '../core/providers.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final session = ref.watch(sessionProvider);

  return GoRouter(
    initialLocation: '/splash',
    redirect: (context, state) {
      final location = state.matchedLocation;

      if (session == SessionState.initial) {
        return location == '/splash' ? null : '/splash';
      }

      if (session == SessionState.unauthenticated) {
        final publicRoutes = ['/splash', '/auth', '/otp'];
        return publicRoutes.contains(location) ? null : '/auth';
      }

      if (session == SessionState.authenticated) {
        if (location == '/splash' || location == '/auth') {
          return '/home';
        }
      }

      return null;
    },
    errorBuilder: (context, state) => const NotFoundScreen(),
    routes: [
      GoRoute(
        path: '/splash',
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(
        path: '/auth',
        builder: (context, state) => const AuthScreen(),
      ),
      GoRoute(
        path: '/otp',
        builder: (context, state) => const OtpScreen(),
      ),
      GoRoute(
        path: '/consent',
        builder: (context, state) => const ConsentScreen(),
      ),
      GoRoute(
        path: '/intake',
        builder: (context, state) => const IntakeScreen(),
      ),
      GoRoute(
        path: '/home',
        builder: (context, state) => const HomeScreen(),
      ),
      GoRoute(
        path: '/chat',
        builder: (context, state) => const ChatScreen(),
      ),
      GoRoute(
        path: '/progress',
        builder: (context, state) => const ProgressScreen(),
      ),
      GoRoute(
        path: '/settings',
        builder: (context, state) => const SettingsScreen(),
        routes: [
          GoRoute(
            path: 'profile',
            builder: (context, state) => const ProfileScreen(),
          ),
          GoRoute(
            path: 'notifications',
            builder: (context, state) => const NotificationsScreen(),
          ),
          GoRoute(
            path: 'privacy',
            builder: (context, state) => const PrivacyScreen(),
          ),
          GoRoute(
            path: 'about',
            builder: (context, state) => const AboutScreen(),
          ),
        ],
      ),
    ],
  );
});
