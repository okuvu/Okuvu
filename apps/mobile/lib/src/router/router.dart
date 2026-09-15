import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/splash/splash_screen.dart';
import '../features/auth/otp_login_screen.dart';
import '../features/onboarding_welcome/welcome_screen.dart';
import '../features/onboarding_welcome/age_blocked_screen.dart';
import '../features/auth/waitlist_screen.dart';
import '../features/consent/consent_screen.dart';
import '../features/intake/cold_start_screen.dart';
import '../features/home/home_screen.dart';
import '../features/chat/chat_screen.dart';
import '../features/progress/progress_screen.dart';
import '../features/settings/settings_screen.dart';
import '../features/settings/profile_screen.dart';
import '../features/settings/notifications_screen.dart';
import '../features/settings/about_screen.dart';
import '../features/settings/privacy_screen.dart';
import '../features/settings/account_deletion_screen.dart';
import '../features/settings/emergency_contact_screen.dart';
import '../features/settings/my_focus_area_screen.dart';
import '../features/settings/privacy_data_screen.dart';
import '../features/settings/language_screen.dart';
import '../features/journal/journal_screen.dart';
import '../features/journal/journal_list_screen.dart';
import '../features/appointments/appointments_screen.dart';
import '../features/appointments/appointment_detail_screen.dart';
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

class _RouterNotifier extends ChangeNotifier {
  _RouterNotifier(this._ref) {
    _ref.listen<SessionState>(sessionProvider, (_, __) => notifyListeners());
  }

  final Ref _ref;

  SessionState get session => _ref.read(sessionProvider);
}

final routerProvider = Provider<GoRouter>((ref) {
  final notifier = _RouterNotifier(ref);
  ref.onDispose(notifier.dispose);

  final goRouter = GoRouter(
    initialLocation: '/splash',
    refreshListenable: notifier,
    redirect: (context, state) {
      final location = state.matchedLocation;
      final session = notifier.session;

      if (session == SessionState.initial) {
        return location == '/splash' ? null : '/splash';
      }

      if (session == SessionState.unauthenticated) {
        if (location == '/splash') return '/auth';
        return location == '/auth' ? null : '/auth';
      }

      if (session == SessionState.authenticated) {
        if (location == '/auth' || location == '/splash') {
          return '/onboarding/coldstart';
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
        path: '/onboarding/welcome',
        builder: (context, state) => const WelcomeScreen(),
      ),
      GoRoute(
        path: '/onboarding/age-blocked',
        builder: (context, state) => const AgeBlockedScreen(),
      ),
      GoRoute(
        path: '/onboarding/consent',
        builder: (context, state) => const ConsentScreen(),
      ),
      GoRoute(
        path: '/waitlist',
        builder: (context, state) =>
            WaitlistScreen(phoneNumber: state.extra as String?),
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
        path: '/journal',
        builder: (context, state) => const JournalScreen(),
      ),
      GoRoute(
        path: '/journal/history',
        builder: (context, state) => const JournalListScreen(),
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
        path: '/appointments',
        builder: (context, state) => const AppointmentsScreen(),
      ),
      GoRoute(
        path: '/appointments/:id',
        builder: (context, state) =>
            AppointmentDetailScreen(appointmentId: state.pathParameters['id']!),
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
            builder: (context, state) => const PrivacyDataScreen(),
          ),
          GoRoute(
            path: 'emergency',
            builder: (context, state) => const EmergencyContactScreen(),
          ),
          GoRoute(
            path: 'about',
            builder: (context, state) => const AboutScreen(),
          ),
          GoRoute(
            path: 'privacy-policy',
            builder: (context, state) => const PrivacyScreen(),
          ),
          GoRoute(
            path: 'delete-account',
            builder: (context, state) => const AccountDeletionScreen(),
          ),
          GoRoute(
            path: 'focus',
            builder: (context, state) => const MyFocusAreaScreen(),
          ),
          GoRoute(
            path: 'language',
            builder: (context, state) => const LanguageScreen(),
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
