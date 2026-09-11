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

void main() {
  AppConfig.init('dev');

  testWidgets('tapping a mood posts mood_value to /progress/mood/checkin',
      (tester) async {
    String? capturedPath;
    Map<String, dynamic>? capturedBody;

    final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        capturedPath = options.path;
        capturedBody = options.data as Map<String, dynamic>?;
        handler.resolve(Response(
          requestOptions: options,
          statusCode: 200,
          data: {'success': true, 'date': '2026-09-11', 'mood_value': 4},
        ));
      },
    ));

    await tester.pumpWidget(_buildTestApp(dio: dio));
    await tester.tap(find.text('4'));
    await tester.pumpAndSettle();

    expect(capturedPath, '/progress/mood/checkin');
    expect(capturedBody, {'mood_value': 4});
  });

  testWidgets('shows the selected mood label after tapping', (tester) async {
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        handler.resolve(Response(
          requestOptions: options,
          statusCode: 200,
          data: {'success': true},
        ));
      },
    ));

    await tester.pumpWidget(_buildTestApp(dio: dio));
    await tester.tap(find.text('3'));
    await tester.pumpAndSettle();

    expect(find.text('Feeling Okay'), findsOneWidget);
  });

  testWidgets('toggling the same mood off does not re-post', (tester) async {
    var requestCount = 0;

    final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        requestCount++;
        handler.resolve(Response(
          requestOptions: options,
          statusCode: 200,
          data: {'success': true},
        ));
      },
    ));

    await tester.pumpWidget(_buildTestApp(dio: dio));
    await tester.tap(find.text('2'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('2'));
    await tester.pumpAndSettle();

    expect(requestCount, 1);
    expect(find.text('Feeling Down'), findsNothing);
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
    await tester.tap(find.text('1'));
    await tester.pumpAndSettle();

    expect(
      find.text("Couldn't save your check-in. Please try again."),
      findsOneWidget,
    );
  });
}
