import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/notifications/notifications_inbox_screen.dart';
import 'package:okuvu/src/features/notifications/notifications_provider.dart';
import 'package:okuvu/src/features/homework/homework_screen.dart';
import 'package:okuvu/src/features/homework/homework_provider.dart';

/// Answers the two inbox routes and records every POST so a test can assert
/// that tapping a row actually marked it read.
Dio _inboxDio({
  required Map<String, dynamic> listResponse,
  Map<String, dynamic>? countResponse,
  List<String>? postedPaths,
}) {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) {
      if (options.method == 'POST') {
        postedPaths?.add(options.path);
        handler.resolve(Response(
          requestOptions: options,
          statusCode: 200,
          data: {'success': true, 'updated': 1},
        ));
        return;
      }
      if (options.path.endsWith('unread-count')) {
        handler.resolve(Response(
          requestOptions: options,
          statusCode: 200,
          data: countResponse ?? {'unreadCount': 0},
        ));
        return;
      }
      handler.resolve(Response(
        requestOptions: options,
        statusCode: 200,
        data: listResponse,
      ));
    },
  ));
  return dio;
}

Widget _app(Dio dio, Widget screen, {String path = '/notifications'}) {
  return ProviderScope(
    overrides: [dioClientProvider.overrideWithValue(dio)],
    child: MaterialApp.router(
      routerConfig: GoRouter(
        initialLocation: path,
        routes: [
          GoRoute(path: path, builder: (_, __) => screen),
          GoRoute(path: '/home', builder: (_, __) => const Scaffold(body: Text('home'))),
          GoRoute(path: '/homework', builder: (_, __) => const Scaffold(body: Text('homework-screen'))),
          GoRoute(
            path: '/appointments/:id',
            builder: (_, __) => const Scaffold(body: Text('appointment-detail')),
          ),
        ],
      ),
    ),
  );
}

Map<String, dynamic> _notificationJson({
  required String id,
  String kind = 'homework_assigned',
  String title = 'New homework',
  String body = 'Write down three things you noticed today.',
  String? homeworkId,
  String? appointmentId,
  String? readAt,
  String createdAt = '2026-11-06T09:00:00.000Z',
}) {
  return {
    'id': id,
    'kind': kind,
    'title': title,
    'body': body,
    'homeworkId': homeworkId,
    'appointmentId': appointmentId,
    'readAt': readAt,
    'createdAt': createdAt,
  };
}

void main() {
  group('NotificationsInboxScreen', () {
    testWidgets('renders every row the server returned, unread first-class', (tester) async {
      tester.view.physicalSize = const Size(1080, 1920);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final dio = _inboxDio(listResponse: {
        'notifications': [
          _notificationJson(
            id: 'n1',
            kind: 'homework_assigned',
            title: 'New homework',
            body: 'Write down three things you noticed today.',
            homeworkId: 'hw-1',
            createdAt: '2026-11-06T09:00:00.000Z',
          ),
          _notificationJson(
            id: 'n2',
            kind: 'appointment_booked',
            title: 'Appointment booked',
            body: 'Your session is on Tue, 24 Nov at 6:00 pm.',
            appointmentId: 'ap-1',
            readAt: '2026-11-05T10:00:00.000Z',
            createdAt: '2026-11-05T08:00:00.000Z',
          ),
        ],
        'unreadCount': 1,
      });

      await tester.pumpWidget(_app(dio, const NotificationsInboxScreen()));
      await tester.pumpAndSettle();

      expect(find.text('New homework'), findsOneWidget);
      expect(find.text('Write down three things you noticed today.'), findsOneWidget);
      expect(find.text('Appointment booked'), findsOneWidget);
      // One unread row out of two.
      final unreadDots = find.byWidgetPredicate((w) =>
          w is Container &&
          w.decoration is BoxDecoration &&
          (w.decoration as BoxDecoration).shape == BoxShape.circle &&
          (w.decoration as BoxDecoration).color == const Color(0xFF7B6CD9));
      expect(unreadDots, findsOneWidget);
      // Mark-all-read is offered only while something is unread.
      expect(find.text('Mark all read'), findsOneWidget);
    });

    testWidgets('shows the honest empty state', (tester) async {
      final dio = _inboxDio(listResponse: {'notifications': [], 'unreadCount': 0});

      await tester.pumpWidget(_app(dio, const NotificationsInboxScreen()));
      await tester.pumpAndSettle();

      expect(find.text('Nothing yet'), findsOneWidget);
      expect(
        find.text(
          'When your therapist adds homework, a reminder or an appointment, it appears here.',
        ),
        findsOneWidget,
      );
      expect(find.text('Mark all read'), findsNothing);
    });

    testWidgets('tapping a homework row marks it read and opens the homework list',
        (tester) async {
      final posted = <String>[];
      final dio = _inboxDio(
        postedPaths: posted,
        listResponse: {
          'notifications': [
            _notificationJson(id: 'n1', homeworkId: 'hw-1'),
          ],
          'unreadCount': 1,
        },
      );

      await tester.pumpWidget(_app(dio, const NotificationsInboxScreen()));
      await tester.pumpAndSettle();

      await tester.tap(find.text('New homework'));
      await tester.pumpAndSettle();

      expect(posted, contains('/users/me/notifications/n1/read'));
      expect(find.text('homework-screen'), findsOneWidget);
    });

    testWidgets('tapping an appointment row opens that appointment', (tester) async {
      final dio = _inboxDio(listResponse: {
        'notifications': [
          _notificationJson(
            id: 'n2',
            kind: 'appointment_booked',
            title: 'Appointment booked',
            appointmentId: 'ap-9',
            readAt: '2026-11-05T10:00:00.000Z',
          ),
        ],
        'unreadCount': 0,
      });

      await tester.pumpWidget(_app(dio, const NotificationsInboxScreen()));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Appointment booked'));
      await tester.pumpAndSettle();

      expect(find.text('appointment-detail'), findsOneWidget);
    });
  });

  group('HomeworkScreen', () {
    Map<String, dynamic> homeworkJson({
      required String id,
      required String description,
      String status = 'active',
      String? toolLabel,
    }) {
      return {
        'id': id,
        'description': description,
        'status': status,
        'toolId': toolLabel == null ? null : 'box_breathing',
        'toolLabel': toolLabel,
        'assignedAt': '2026-11-06T08:00:00.000Z',
      };
    }

    testWidgets('lists every assignment, not just the newest one', (tester) async {
      tester.view.physicalSize = const Size(1080, 2600);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final dio = _inboxDio(listResponse: {
        'homework': [
          homeworkJson(id: 'hw-3', description: 'Third assignment', toolLabel: 'Box breathing'),
          homeworkJson(id: 'hw-2', description: 'Second assignment'),
          homeworkJson(id: 'hw-1', description: 'First assignment', status: 'completed'),
        ],
        'reminders': [
          {
            'id': 'rem-1',
            'scheduleNote': 'Practise before bed',
            'frequency': 'once_daily',
            'times': ['22:00'],
            'homeworkId': 'hw-3',
            'toolLabel': 'Box breathing',
          },
        ],
      });

      await tester.pumpWidget(_app(dio, const HomeworkScreen(), path: '/homework'));
      await tester.pumpAndSettle();

      expect(find.text('Third assignment'), findsOneWidget);
      expect(find.text('Second assignment'), findsOneWidget);
      expect(find.text('First assignment'), findsOneWidget);
      expect(find.text('To do (2)'), findsOneWidget);
      expect(find.text('Done (1)'), findsOneWidget);
      expect(find.text('Reminders (1)'), findsOneWidget);
      expect(find.text('Practise before bed'), findsOneWidget);
      expect(find.text('Once a day at 10:00 pm'), findsOneWidget);
      // The tool label rides along with the assignment.
      expect(find.text('Box breathing'), findsOneWidget);
    });

    testWidgets('shows an empty state when nothing is assigned', (tester) async {
      final dio = _inboxDio(listResponse: {'homework': [], 'reminders': []});

      await tester.pumpWidget(_app(dio, const HomeworkScreen(), path: '/homework'));
      await tester.pumpAndSettle();

      expect(find.text('Nothing here yet'), findsOneWidget);
    });
  });

  group('format helpers', () {
    test('formatNotificationAge reads like a human clock', () {
      final now = DateTime.utc(2026, 11, 6, 12, 0);
      expect(
        formatNotificationAge(now.subtract(const Duration(seconds: 20)), now: now),
        'Just now',
      );
      expect(
        formatNotificationAge(now.subtract(const Duration(minutes: 5)), now: now),
        '5m ago',
      );
      expect(
        formatNotificationAge(now.subtract(const Duration(hours: 3)), now: now),
        '3h ago',
      );
      expect(
        formatNotificationAge(now.subtract(const Duration(days: 1)), now: now),
        'Yesterday',
      );
      expect(
        formatNotificationAge(now.subtract(const Duration(days: 3)), now: now),
        '3d ago',
      );
    });

    test('describeReminderSchedule matches the wording the inbox uses', () {
      expect(describeReminderSchedule('once_daily', ['09:00']), 'Once a day at 9:00 am');
      expect(
        describeReminderSchedule('twice_daily', ['08:00', '20:00']),
        'Twice a day (8:00 am, 8:00 pm)',
      );
      expect(describeReminderSchedule('off', []), 'No set time');
      expect(describeReminderSchedule('as_needed', []), 'Whenever you need it');
      // An unknown frequency must not leak a raw enum into the client's screen.
      expect(describeReminderSchedule('every_fortnight', []), 'No set time');
    });
  });
}
