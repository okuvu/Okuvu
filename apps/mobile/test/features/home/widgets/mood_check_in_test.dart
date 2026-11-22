import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:okuvu/src/config/app_config.dart';
import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/home/widgets/mood_check_in.dart';

Widget _buildTestApp({required Dio dio}) {
  return ProviderScope(
    overrides: [
      dioClientProvider.overrideWithValue(dio),
    ],
    child: const MaterialApp(
      home: Scaffold(body: MoodCheckIn()),
    ),
  );
}

Dio _dio(Future<Response<dynamic>> Function(RequestOptions options) onRequest) {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) async {
      final response = await onRequest(options);
      handler.resolve(response);
    },
  ));
  return dio;
}

Response<dynamic> _ok(RequestOptions options, [Map<String, dynamic>? data]) =>
    Response(
      requestOptions: options,
      statusCode: 200,
      data: data ?? {'success': true},
    );

void main() {
  AppConfig.init('dev');

  testWidgets('shows five faces with their words, and no 1-5 numbers',
      (tester) async {
    await tester.pumpWidget(_buildTestApp(dio: _dio((o) async => _ok(o))));

    for (final label in ['Awful', 'Low', 'Okay', 'Good', 'Great']) {
      expect(find.text(label), findsOneWidget);
    }
    for (final value in [1, 2, 3, 4, 5]) {
      expect(find.byKey(Key('mood_face_$value')), findsOneWidget);
    }
    // The number scale is gone, not hidden behind the labels.
    expect(find.text('1'), findsNothing);
    expect(find.text('5'), findsNothing);
  });

  testWidgets('tapping a face posts that face\'s value to /progress/mood/checkin',
      (tester) async {
    String? capturedPath;
    Map<String, dynamic>? capturedBody;

    final dio = _dio((options) async {
      capturedPath = options.path;
      capturedBody = options.data as Map<String, dynamic>?;
      return _ok(options, {'success': true, 'id': 'log-1', 'date': '2026-11-22'});
    });

    await tester.pumpWidget(_buildTestApp(dio: dio));
    await tester.tap(find.byKey(const Key('mood_face_4')));
    await tester.pumpAndSettle();

    expect(capturedPath, '/progress/mood/checkin');
    // A quick tap on Home sends the face and nothing else: the day may already
    // carry words from the full screen, and this tap must not clear them.
    expect(capturedBody, {'mood_value': 4});
  });

  testWidgets('shows the selected face\'s word after tapping', (tester) async {
    await tester.pumpWidget(_buildTestApp(dio: _dio((o) async => _ok(o))));

    await tester.tap(find.byKey(const Key('mood_face_3')));
    await tester.pumpAndSettle();

    expect(find.text('Feeling Okay'), findsOneWidget);
  });

  testWidgets('tapping the same face off does not re-post', (tester) async {
    var checkins = 0;

    final dio = _dio((options) async {
      if (options.path == '/progress/mood/checkin') checkins++;
      return _ok(options);
    });

    await tester.pumpWidget(_buildTestApp(dio: dio));
    await tester.tap(find.byKey(const Key('mood_face_2')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('mood_face_2')));
    await tester.pumpAndSettle();

    expect(checkins, 1);
    expect(find.text('Feeling Low'), findsNothing);
  });

  testWidgets('shows an error snackbar when the check-in fails to save',
      (tester) async {
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        handler.reject(DioException(
          requestOptions: options,
          type: DioExceptionType.connectionTimeout,
        ));
      },
    ));

    await tester.pumpWidget(_buildTestApp(dio: dio));
    await tester.tap(find.byKey(const Key('mood_face_1')));
    await tester.pumpAndSettle();

    expect(
      find.text("Couldn't save your check-in. Please try again."),
      findsOneWidget,
    );
  });
}
