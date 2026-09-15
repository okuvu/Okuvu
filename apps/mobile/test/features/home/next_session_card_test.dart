import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/home/widgets/next_session_card.dart';

Dio _mockDio(Map<String, dynamic> todayBody) {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        handler.resolve(Response(requestOptions: options, statusCode: 200, data: todayBody));
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
        initialLocation: '/home',
        routes: [
          GoRoute(
            path: '/home',
            builder: (_, __) => const Scaffold(body: NextSessionCard()),
          ),
          GoRoute(
            path: '/appointments/:id',
            builder: (_, state) => Scaffold(
              body: Text('DETAIL_MARKER_${state.pathParameters['id']}'),
            ),
          ),
        ],
      ),
    ),
  );
}

void main() {
  testWidgets('renders nothing when nothing is booked', (tester) async {
    await tester.pumpWidget(_buildApp(_mockDio({'reminders': []})));
    await tester.pumpAndSettle();

    expect(find.text('Your next session'), findsNothing);
  });

  testWidgets('shows the next session summary and navigates to detail on tap', (tester) async {
    await tester.pumpWidget(_buildApp(_mockDio({
      'reminders': [],
      'nextAppointment': {
        'id': 'appt-1',
        'scheduledAt': '2026-09-18T12:30:00.000Z',
        'durationMinutes': 50,
        'mode': 'video',
        'location': null,
        'noteToClient': null,
        'remind24h': false,
        'remind1h': false,
        'rescheduledFrom': null,
        'cancelledAt': null,
        'therapistId': 'th_1',
        'therapistName': 'Dr. Rao',
      },
    })));
    await tester.pumpAndSettle();

    expect(find.text('Your next session'), findsOneWidget);
    expect(find.textContaining('Dr. Rao'), findsOneWidget);

    await tester.tap(find.byType(GestureDetector));
    await tester.pumpAndSettle();

    expect(find.text('DETAIL_MARKER_appt-1'), findsOneWidget);
  });
}
