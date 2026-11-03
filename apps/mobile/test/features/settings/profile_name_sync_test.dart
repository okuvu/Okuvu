import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:okuvu/src/config/app_config.dart';
import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/home/home_screen.dart';
import 'package:okuvu/src/features/home/providers/today_card_provider.dart';
import 'package:okuvu/src/features/settings/profile_provider.dart';

/// Owner round 7 (3 Nov 2026) — the Home greeting showed the short name saved
/// on the welcome screen ("S") while Settings > Profile showed the account
/// name ("Shubha G"). These tests pin the greeting to the profile name and
/// prove a name saved in Profile reaches Home without an app restart.
class _ProfileDio {
  _ProfileDio({required this.name, this.abbreviation = 'S'});

  String name;
  final String? abbreviation;
  int profileGets = 0;
  int todayGets = 0;
  final List<Map<String, dynamic>> patches = [];

  Dio build() {
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          final path = options.path;
          if (options.method == 'GET' && path.endsWith('/settings/profile')) {
            profileGets++;
            handler.resolve(Response(
              requestOptions: options,
              statusCode: 200,
              data: {
                'full_name': name,
                'email': 'shubha@example.com',
                'date_of_birth': null,
                'gender': null,
              },
            ));
            return;
          }
          if (options.method == 'PATCH' && path.endsWith('/settings/profile')) {
            final body = Map<String, dynamic>.from(options.data as Map);
            patches.add(body);
            final saved = body['full_name'] as String?;
            if (saved != null) name = saved;
            handler.resolve(Response(
              requestOptions: options,
              statusCode: 200,
              data: {'success': true},
            ));
            return;
          }
          if (path.endsWith('/users/me/today')) {
            todayGets++;
            handler.resolve(Response(
              requestOptions: options,
              statusCode: 200,
              data: {'displayAbbreviation': abbreviation},
            ));
            return;
          }
          handler.resolve(Response(
            requestOptions: options,
            statusCode: 200,
            data: {'success': true},
          ));
        },
      ),
    );
    return dio;
  }
}

String _greetingFor(String name) {
  final hour = DateTime.now().hour;
  final base = hour < 12
      ? 'Good morning'
      : hour < 17
          ? 'Good afternoon'
          : 'Good evening';
  return '$base, $name';
}

Future<ProviderContainer> _pumpHome(
  WidgetTester tester,
  _ProfileDio profileDio,
) async {
  tester.view.physicalSize = const Size(1080, 1920);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  final container = ProviderContainer(
    overrides: [dioClientProvider.overrideWithValue(profileDio.build())],
  );
  addTearDown(container.dispose);

  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(home: HomeScreen()),
    ),
  );
  await tester.pumpAndSettle();
  return container;
}

void main() {
  AppConfig.init('dev');

  group('greetingFirstName', () {
    test('takes the first word of a full name', () {
      expect(greetingFirstName('Shubha G'), 'Shubha');
      expect(greetingFirstName('  Ananya   Rao '), 'Ananya');
      expect(greetingFirstName('Shubha'), 'Shubha');
    });

    test('is null when there is no usable name', () {
      expect(greetingFirstName(null), isNull);
      expect(greetingFirstName(''), isNull);
      expect(greetingFirstName('   '), isNull);
    });
  });

  group('Home greeting uses the profile name', () {
    testWidgets('shows the profile name even when a welcome short name exists',
        (tester) async {
      final dio = _ProfileDio(name: 'Shubha G', abbreviation: 'S');
      await _pumpHome(tester, dio);

      expect(find.text(_greetingFor('Shubha')), findsOneWidget);
      expect(find.text(_greetingFor('S')), findsNothing);
    });

    testWidgets('falls back to the welcome short name when no profile name',
        (tester) async {
      final dio = _ProfileDio(name: '', abbreviation: 'Zee');
      await _pumpHome(tester, dio);

      expect(find.text(_greetingFor('Zee')), findsOneWidget);
    });

    test('a name saved in Profile drops the cached profile and today card',
        () async {
      final dio = _ProfileDio(name: 'Shubha G', abbreviation: 'S');
      final container = ProviderContainer(
        overrides: [dioClientProvider.overrideWithValue(dio.build())],
      );
      addTearDown(container.dispose);

      // HomeScreen keeps both autoDispose providers alive; listen the same way.
      container.listen(profileInfoProvider, (_, __) {});
      container.listen(todayCardProvider, (_, __) {});

      expect(
        (await container.read(profileInfoProvider.future)).fullName,
        'Shubha G',
      );
      await container.read(todayCardProvider.future);
      final profileGetsBefore = dio.profileGets;
      final todayGetsBefore = dio.todayGets;

      final saved = await container.read(profileSaveProvider.notifier).save(
            fullName: 'Ananya Rao',
            dateOfBirth: null,
            gender: null,
          );

      expect(saved, isTrue);
      expect(dio.patches.single['full_name'], 'Ananya Rao');
      expect(
        (await container.read(profileInfoProvider.future)).fullName,
        'Ananya Rao',
      );
      expect(dio.profileGets, greaterThan(profileGetsBefore));
      await container.read(todayCardProvider.future);
      expect(dio.todayGets, greaterThan(todayGetsBefore));
    });
  });
}
