import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/my_space/my_space_providers.dart';

/// "Download my entries and notes" must hand the client a readable document,
/// not a JSON blob. The api writes the document; this proves the app asks for
/// that endpoint and passes the text through unchanged.
void main() {
  test('the download is the readable document endpoint, passed through as text',
      () async {
    String? requestedPath;
    Object? requestedOptions;

    final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        requestedPath = options.path;
        requestedOptions = options.responseType;
        handler.resolve(Response(
          requestOptions: options,
          statusCode: 200,
          data: 'OKUVU — my entries and notes\n\n9 November 2026, 10:00 am\n'
              'Journal entry\nShared with my therapist: No\n\n    A quiet day.\n',
        ));
        return;
      },
    ));

    final container = ProviderContainer(
      overrides: [dioClientProvider.overrideWithValue(dio)],
    );
    addTearDown(container.dispose);

    final text = await container.read(myDataProvider.notifier).exportText();

    expect(requestedPath, '/me/export/document');
    expect(requestedOptions, ResponseType.plain);
    expect(text, contains('OKUVU — my entries and notes'));
    expect(text, contains('Journal entry'));
    expect(text, contains('Shared with my therapist: No'));
    expect(text, isNot(contains('{')));
  });

  test('a failed download is null, never an empty file', () async {
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) => handler.reject(
        DioException(requestOptions: options, message: 'offline'),
      ),
    ));

    final container = ProviderContainer(
      overrides: [dioClientProvider.overrideWithValue(dio)],
    );
    addTearDown(container.dispose);

    expect(await container.read(myDataProvider.notifier).exportText(), isNull);
  });
}
