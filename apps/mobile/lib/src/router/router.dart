import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/splash/splash_screen.dart';
import '../features/auth/otp_login_screen.dart';
import '../features/consent/consent_screen.dart';
import '../features/intake/intake_screen.dart';
import '../features/intake/cold_start_screen.dart';
import '../features/home/home_screen.dart';
import '../features/chat/chat_screen.dart';
import '../features/progress/progress_screen.dart';
import '../features/settings/settings_screen.dart';
import '../features/settings/profile_screen.dart';
import '../features/settings/notifications_screen.dart';
import '../features/settings/privacy_screen.dart';
import '../features/settings/about_screen.dart';
import '../features/settings/account_deletion_screen.dart';
import '../features/settings/emergency_contact_screen.dart';
import '../core/not_found_screen.dart';
import '../core/providers.dart';

class _CrisisAwareBackButtonDispatcher extends RootBackButtonDispatcher {
  _CrisisAwareBackButtonDispatcher(this._isCrisisActive);
  final bool Function() _isCrisisActive;

  @override
  Future<bool> didPopRoute() {
    if (_isCrisisActive()) return Future<bool>.value(true);
    return super.didPopRoute();
  }
}

class _CrisisAwareRouterConfig implements RouterConfig<RouteMatchList> {
  _CrisisAwareRouterConfig(this._goRouter, this._isCrisisActive);

  final GoRouter _goRouter;
  final bool Function() _isCrisisActive;
  late final _CrisisAwareBackButtonDispatcher _dispatcher =
      _CrisisAwareBackButtonDispatcher(_isCrisisActive);

  @override
  BackButtonDispatcher? get backButtonDispatcher => _dispatcher;

  @override
  RouteInformationProvider? get routeInformationProvider =>
      _goRouter.routeInformationProvider;

  @override
  RouteInformationParser<RouteMatchList>? get routeInformationParser =>
      _goRouter.routeInformationParser;

  @override
  RouterDelegate<RouteMatchList> get routerDelegate => _goRouter.routerDelegate;
}

final routerProvider = Provider<GoRouter>((ref) {
  final session = ref.watch(sessionProvider);

  final goRouter = GoRouter(
    initialLocation: '/splash',
    redirect: (context, state) {
      final location = state.matchedLocation;

      if (session == SessionState.initial) {
        return location == '/splash' ? null : '/splash';
      }

      if (session == SessionState.unauthenticated) {
        final publicRoutes = ['/splash', '/auth'];
        return publicRoutes.contains(location) ? null : '/auth';
      }

      if (session == SessionState.authenticated) {
        if (location == '/auth') {
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
        builder: (context, state) => const OtpLoginScreen(),
      ),
      GoRoute(
        path: '/onboarding/consent',
        builder: (context, state) => const ConsentScreen(),
      ),
      GoRoute(
        path: '/intake',
        builder: (context, state) => const IntakeScreen(),
      ),
      GoRoute(
        path: '/onboarding/coldstart',
        builder: (context, state) => const ColdStartScreen(),
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
            path: 'emergency-contact',
            builder: (context, state) => const EmergencyContactScreen(),
          ),
          GoRoute(
            path: 'about',
            builder: (context, state) => const AboutScreen(),
          ),
          GoRoute(
            path: 'delete-account',
            builder: (context, state) => const AccountDeletionScreen(),
          ),
        ],
      ),
    ],
  );

  return goRouter;
});

final routerConfigProvider = Provider<RouterConfig<RouteMatchList>>((ref) {
  final goRouter = ref.watch(routerProvider);
  return _CrisisAwareRouterConfig(
    goRouter,
    () => ref.read(crisisOverlayProvider),
  );
});
