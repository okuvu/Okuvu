import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/appointments/appointments_screen.dart';
import 'package:okuvu/src/features/appointments/appointment_detail_screen.dart';

Dio _mockDio(Map<String, dynamic> appointmentsBody) {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        if (options.path.endsWith('/users/me/appointments')) {
          handler.resolve(
            Response(requestOptions: options, statusCode: 200, data: appointmentsBody),
          );
          return;
        }
        handler.resolve(Response(requestOptions: options, statusCode: 200, data: {}));
      },
    ),
  );
  return dio;
}

Widget _buildApp(Dio dio) {
  return ProviderScope(
    overrides: [dioClientProvider.overrideWithValue(dio)],
    child: MaterialApp.router(
      routerConfig: GoRouter(
        initialLocation: '/appointments',
        routes: [
          GoRoute(
            path: '/home',
            builder: (_, __) => const Scaffold(body: Text('HOME_MARKER')),
          ),
          GoRoute(
            path: '/appointments',
            builder: (_, __) => const AppointmentsScreen(),
          ),
          GoRoute(
            path: '/appointments/:id',
            builder: (_, state) =>
                AppointmentDetailScreen(appointmentId: state.pathParameters['id']!),
          ),
        ],
      ),
    ),
  );
}

final _sampleBody = {
  'upcoming': [
    {
      'id': 'appt-upcoming',
      'scheduledAt': '2026-09-18T12:30:00.000Z',
      'durationMinutes': 50,
      'mode': 'video',
      'location': null,
      'noteToClient': "Let's pick up the sleep thread from last week.",
      'remind24h': true,
      'remind1h': false,
      'rescheduledFrom': null,
      'cancelledAt': null,
      'therapistId': 'th_1',
      'therapistName': 'Dr. Rao',
    },
  ],
  'past': [
    {
      'id': 'appt-past',
      'scheduledAt': '2026-08-28T13:00:00.000Z',
      'durationMinutes': 30,
      'mode': 'phone',
      'location': null,
      'noteToClient': null,
      'remind24h': false,
      'remind1h': false,
      'rescheduledFrom': null,
      'cancelledAt': '2026-08-27T09:00:00.000Z',
      'therapistId': 'th_1',
      'therapistName': 'Dr. Rao',
    },
  ],
};

void main() {
  testWidgets('renders Upcoming and Earlier sections', (tester) async {
    await tester.pumpWidget(_buildApp(_mockDio(_sampleBody)));
    await tester.pumpAndSettle();

    expect(find.text('Upcoming'), findsOneWidget);
    expect(find.text('Earlier'), findsOneWidget);
    expect(find.textContaining('Dr. Rao · Video · 50 min'), findsOneWidget);
    expect(find.textContaining('Cancelled'), findsOneWidget);
  });

  testWidgets('shows empty state when nothing is booked', (tester) async {
    await tester.pumpWidget(_buildApp(_mockDio({'upcoming': [], 'past': []})));
    await tester.pumpAndSettle();

    expect(find.text('No sessions scheduled yet.'), findsOneWidget);
  });

  testWidgets('tapping an upcoming session opens read-only detail with the note', (tester) async {
    await tester.pumpWidget(_buildApp(_mockDio(_sampleBody)));
    await tester.pumpAndSettle();

    await tester.tap(find.textContaining('Dr. Rao · Video · 50 min'));
    await tester.pumpAndSettle();

    expect(find.byType(AppointmentDetailScreen), findsOneWidget);
    expect(find.textContaining("Let's pick up the sleep thread"), findsOneWidget);
    expect(find.text('Add to my calendar'), findsOneWidget);
    expect(find.text("Can't make it?"), findsOneWidget);
    // Read-only: no edit/reschedule/cancel controls anywhere.
    expect(find.textContaining('Edit'), findsNothing);
    expect(find.textContaining('Reschedule'), findsNothing);
  });

  testWidgets('cancelled session detail shows the cancelled banner and no action buttons',
      (tester) async {
    await tester.pumpWidget(_buildApp(_mockDio(_sampleBody)));
    await tester.pumpAndSettle();

    await tester.tap(find.textContaining('Cancelled'));
    await tester.pumpAndSettle();

    expect(find.text('This session was cancelled.'), findsOneWidget);
    expect(find.text('Add to my calendar'), findsNothing);
    expect(find.text("Can't make it?"), findsNothing);
  });
}
