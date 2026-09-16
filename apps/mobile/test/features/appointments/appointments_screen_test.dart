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
    expect(find.textContaining('Called off'), findsOneWidget);
    // Decisions doc round, 15 Sep 2026 §10 — never "Cancelled", never red.
    expect(find.textContaining('Cancelled'), findsNothing);
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
    expect(find.text('tell Dr. Rao ›'), findsOneWidget);
    // Read-only: no edit/reschedule/cancel controls anywhere.
    expect(find.textContaining('Edit'), findsNothing);
    expect(find.textContaining('Reschedule'), findsNothing);
  });

  testWidgets('cancelled session detail shows the "Called off" copy, no red, no action buttons',
      (tester) async {
    await tester.pumpWidget(_buildApp(_mockDio(_sampleBody)));
    await tester.pumpAndSettle();

    await tester.tap(find.textContaining('Called off'));
    await tester.pumpAndSettle();

    expect(find.text('Called off'), findsOneWidget);
    expect(find.textContaining('was called off. Nothing you need to do.'), findsOneWidget);
    expect(
      find.textContaining("Want another time? Let Dr. Rao know and she'll sort it."),
      findsOneWidget,
    );
    // Banned per decisions doc round, 15 Sep 2026 §10.
    expect(find.textContaining('cancelled'), findsNothing);
    expect(find.textContaining('we missed you'), findsNothing);
    expect(find.textContaining('you missed'), findsNothing);
    expect(find.text('Add to my calendar'), findsNothing);
    expect(find.textContaining('tell Dr. Rao'), findsNothing);
  });

  testWidgets('"Can\'t make it?" trigger and dialog use the locked copy', (tester) async {
    await tester.pumpWidget(_buildApp(_mockDio(_sampleBody)));
    await tester.pumpAndSettle();

    await tester.tap(find.textContaining('Dr. Rao · Video · 50 min'));
    await tester.pumpAndSettle();

    expect(find.text('tell Dr. Rao ›'), findsOneWidget);

    await tester.tap(find.text('tell Dr. Rao ›'));
    await tester.pumpAndSettle();

    expect(
      find.text(
        "Let Dr. Rao know you can't make it — she'll sort a new time. This won't cancel anything on its own.",
      ),
      findsOneWidget,
    );
  });
}
