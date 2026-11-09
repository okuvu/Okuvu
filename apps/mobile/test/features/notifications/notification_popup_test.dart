import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/notifications/notification_banner.dart';
import 'package:okuvu/src/features/notifications/notification_popup.dart';
import 'package:okuvu/src/router/router.dart';

/// Answers the two inbox reads from a mutable row list and records every call,
/// so a test can (a) grow the inbox between polls and (b) prove the poller
/// actually asked rather than rendering a cached page.
class _FakeInbox {
  _FakeInbox({List<Map<String, dynamic>>? rows}) : rows = rows ?? [];

  final List<Map<String, dynamic>> rows;
  int listGets = 0;
  int countGets = 0;
  final List<String> posted = [];

  late final Dio dio = _build();

  Dio _build() {
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (options.method == 'POST') {
            posted.add(options.path);
            handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: {'success': true},
              ),
            );
            return;
          }
          final unread = rows.where((r) => r['readAt'] == null).length;
          if (options.path.endsWith('unread-count')) {
            countGets++;
            handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: {'unreadCount': unread},
              ),
            );
            return;
          }
          listGets++;
          handler.resolve(
            Response(
              requestOptions: options,
              statusCode: 200,
              data: {'notifications': rows, 'unreadCount': unread},
            ),
          );
        },
      ),
    );
    return dio;
  }
}

Map<String, dynamic> _row({
  required String id,
  String kind = 'homework_assigned',
  String title = 'New homework',
  String body = 'Practise the breathing exercise twice today.',
  String? homeworkId = 'hw-1',
  String? appointmentId,
  String? readAt,
  String createdAt = '2026-11-08T09:00:00.000Z',
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

Widget _app({
  required _FakeInbox inbox,
  required GoRouter router,
  SessionState session = SessionState.authenticated,
}) {
  return ProviderScope(
    overrides: [
      dioClientProvider.overrideWithValue(inbox.dio),
      sessionProvider.overrideWithValue(session),
      routerProvider.overrideWithValue(router),
    ],
    child: MaterialApp.router(
      routerConfig: router,
      // Mirrors App's builder: the banner shares a Stack with the overlays and
      // sits below them.
      builder: (context, child) => Stack(
        children: [
          child ?? const SizedBox.shrink(),
          const NotificationPopupSlot(),
        ],
      ),
    ),
  );
}

GoRouter _router() {
  return GoRouter(
    initialLocation: '/home',
    routes: [
      GoRoute(
        path: '/home',
        builder: (_, __) => const Scaffold(body: Text('home-screen')),
      ),
      GoRoute(
        path: '/homework',
        builder: (_, __) => const Scaffold(body: Text('homework-screen')),
      ),
      GoRoute(
        path: '/notifications',
        builder: (_, __) => const Scaffold(body: Text('notifications-screen')),
      ),
      GoRoute(
        path: '/appointments/:id',
        builder: (_, __) => const Scaffold(body: Text('appointment-screen')),
      ),
    ],
  );
}

/// One read of the inbox, awaited outside the fake clock.
///
/// `await notifier.poll()` inside a widget test hangs: the response resolves
/// through a timer that only advances when the tester pumps, so the await never
/// returns and the test dies on a timeout with no failure line.
Future<void> _poll(WidgetTester tester, String from) async {
  final notifier = ProviderScope.containerOf(tester.element(find.text(from)))
      .read(notificationPopupProvider.notifier);
  await tester.runAsync(notifier.poll);
  await tester.pumpAndSettle();
}

/// Dispose the tree so the poller's timer is cancelled; a live timer fails
/// teardown with "A Timer is still pending".
Future<void> _teardown(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox.shrink());
  await tester.pump();
}

void main() {
  group('NotificationPopupNotifier', () {
    test('the first read is a baseline and does not pop', () async {
      final inbox = _FakeInbox(rows: [_row(id: 'n1')]);
      final container = ProviderContainer(
        overrides: [
          dioClientProvider.overrideWithValue(inbox.dio),
          sessionProvider.overrideWithValue(SessionState.authenticated),
        ],
      );
      addTearDown(container.dispose);
      container.listen(notificationPopupProvider, (_, __) {});

      final notifier = container.read(notificationPopupProvider.notifier);
      notifier.stop();

      await notifier.poll();
      expect(container.read(notificationPopupProvider), isNull);
      expect(inbox.listGets, 1);
    });

    test('rows that arrive after the baseline pop once, newest first', () async {
      final inbox = _FakeInbox(
        rows: [_row(id: 'n1', readAt: '2026-11-07T09:00:00.000Z')],
      );
      final container = ProviderContainer(
        overrides: [
          dioClientProvider.overrideWithValue(inbox.dio),
          sessionProvider.overrideWithValue(SessionState.authenticated),
        ],
      );
      addTearDown(container.dispose);
      container.listen(notificationPopupProvider, (_, __) {});

      final notifier = container.read(notificationPopupProvider.notifier);
      notifier.stop();

      await notifier.poll();
      expect(container.read(notificationPopupProvider), isNull);

      // Two rows at once: the therapist assigned homework and a reminder.
      inbox.rows.insertAll(0, [
        _row(id: 'n3', title: 'New reminder'),
        _row(id: 'n2', title: 'New homework'),
      ]);

      await notifier.poll();
      expect(container.read(notificationPopupProvider)?.id, 'n3');
      expect(inbox.listGets, 2);

      // The same rows on the next tick must not re-pop.
      notifier.dismiss();
      await notifier.poll();
      expect(container.read(notificationPopupProvider), isNull);
      expect(inbox.listGets, 3);
    });

    test('dismiss ignores an id that is no longer showing', () async {
      final inbox = _FakeInbox();
      final container = ProviderContainer(
        overrides: [
          dioClientProvider.overrideWithValue(inbox.dio),
          sessionProvider.overrideWithValue(SessionState.authenticated),
        ],
      );
      addTearDown(container.dispose);
      container.listen(notificationPopupProvider, (_, __) {});

      final notifier = container.read(notificationPopupProvider.notifier);
      notifier.stop();

      await notifier.poll();
      inbox.rows.insert(0, _row(id: 'n1'));
      await notifier.poll();
      expect(container.read(notificationPopupProvider)?.id, 'n1');

      // A late dismiss for an older row must not clear the newer banner.
      notifier.dismiss(id: 'n-old');
      expect(container.read(notificationPopupProvider)?.id, 'n1');
    });

    test('a failed read leaves the banner alone and does not throw', () async {
      final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) => handler.reject(
            DioException(
              requestOptions: options,
              type: DioExceptionType.connectionError,
            ),
            true,
          ),
        ),
      );
      final container = ProviderContainer(
        overrides: [
          dioClientProvider.overrideWithValue(dio),
          sessionProvider.overrideWithValue(SessionState.authenticated),
        ],
      );
      addTearDown(container.dispose);
      container.listen(notificationPopupProvider, (_, __) {});

      final notifier = container.read(notificationPopupProvider.notifier);
      notifier.stop();

      await notifier.poll();
      expect(container.read(notificationPopupProvider), isNull);
    });

    test('signed out, no poll is started', () async {
      final inbox = _FakeInbox(rows: [_row(id: 'n1')]);
      final container = ProviderContainer(
        overrides: [
          dioClientProvider.overrideWithValue(inbox.dio),
          sessionProvider.overrideWithValue(SessionState.unauthenticated),
        ],
      );
      addTearDown(container.dispose);
      container.listen(notificationPopupProvider, (_, __) {});

      await Future<void>.delayed(const Duration(milliseconds: 30));
      expect(inbox.listGets, 0);
    });
  });

  group('NotificationPopupSlot', () {
    testWidgets('a task assigned while the app is open pops up and opens it', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(1080, 1920);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final inbox = _FakeInbox();
      final router = _router();
      await tester.pumpWidget(_app(inbox: inbox, router: router));
      await tester.pumpAndSettle();

      // The launch read happened and primed the baseline.
      expect(inbox.listGets, 1);
      expect(find.byKey(const ValueKey('notification_banner')), findsNothing);

      inbox.rows.insert(0, _row(id: 'n1'));
      await _poll(tester, 'home-screen');

      expect(find.byKey(const ValueKey('notification_banner')), findsOneWidget);
      expect(find.text('New homework'), findsOneWidget);
      expect(
        find.text('Practise the breathing exercise twice today.'),
        findsOneWidget,
      );
      expect(find.text('View task'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('notification_banner')));
      await tester.pumpAndSettle();

      expect(find.text('homework-screen'), findsOneWidget);
      expect(find.byKey(const ValueKey('notification_banner')), findsNothing);
      expect(inbox.posted, contains('/users/me/notifications/n1/read'));

      await _teardown(tester);
    });

    testWidgets('rows already waiting at launch do not pop', (tester) async {
      final inbox = _FakeInbox(rows: [_row(id: 'n1')]);
      final router = _router();

      await tester.pumpWidget(_app(inbox: inbox, router: router));
      await tester.pumpAndSettle();

      expect(inbox.listGets, 1);
      expect(find.byKey(const ValueKey('notification_banner')), findsNothing);
      // The row still reaches the bell and the inbox: this is a delivery
      // decision, not a dropped notification.
      expect(find.text('home-screen'), findsOneWidget);

      await _teardown(tester);
    });

    testWidgets('dismiss closes the banner and it stays closed', (tester) async {
      final inbox = _FakeInbox();
      final router = _router();

      await tester.pumpWidget(_app(inbox: inbox, router: router));
      await tester.pumpAndSettle();

      inbox.rows.insert(0, _row(id: 'n1'));
      await _poll(tester, 'home-screen');
      expect(find.byKey(const ValueKey('notification_banner')), findsOneWidget);

      await tester.tap(
        find.byKey(const ValueKey('notification_banner_dismiss')),
      );
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('notification_banner')), findsNothing);

      await _poll(tester, 'home-screen');
      expect(find.byKey(const ValueKey('notification_banner')), findsNothing);

      await _teardown(tester);
    });

    testWidgets('an appointment row opens that appointment', (tester) async {
      final inbox = _FakeInbox();
      final router = _router();

      await tester.pumpWidget(_app(inbox: inbox, router: router));
      await tester.pumpAndSettle();

      inbox.rows.insert(
        0,
        _row(
          id: 'n9',
          kind: 'appointment_booked',
          title: 'Appointment booked',
          body: 'Your session is on Tue, 24 Nov at 6:00 pm.',
          homeworkId: null,
          appointmentId: 'ap-9',
        ),
      );
      await _poll(tester, 'home-screen');

      expect(find.text('Appointment booked'), findsOneWidget);
      // An appointment is not a task, so the call to action is plain.
      expect(find.text('View'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('notification_banner')));
      await tester.pumpAndSettle();
      expect(find.text('appointment-screen'), findsOneWidget);

      await _teardown(tester);
    });

    testWidgets('signed out, nothing pops', (tester) async {
      final inbox = _FakeInbox(rows: [_row(id: 'n1')]);
      final router = _router();

      await tester.pumpWidget(
        _app(
          inbox: inbox,
          router: router,
          session: SessionState.unauthenticated,
        ),
      );
      await tester.pumpAndSettle();
      await tester.pump(const Duration(minutes: 2));

      expect(inbox.listGets, 0);
      expect(find.byKey(const ValueKey('notification_banner')), findsNothing);

      await _teardown(tester);
    });
  });
}
