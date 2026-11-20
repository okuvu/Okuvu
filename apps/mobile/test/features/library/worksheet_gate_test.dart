import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:okuvu/src/core/auth_service.dart';
import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/library/library_api.dart';
import 'package:okuvu/src/features/library/worksheet_screen.dart';

/// The demanding-worksheet gate, as the client met it.
///
/// Report, 20 Nov 2026: tapped "Spot the thinking trap" on the Today card,
/// answered the feeling question (7), tapped Continue — and the screen showed a
/// spinner that never ended. The api had answered in 13 ms.
///
/// Two things made it look like an infinite load, and each has a test here:
///
///  1. the 403 was thrown, so the provider was *failed*, and Riverpod 3 retries
///     a failed provider ten times with backoff while still reporting
///     `isLoading` — the spinner covered the refusal sentence;
///  2. every retry re-requested the worksheet, which is what the api log shows
///     (nine GETs of one worksheet in 35 seconds).
///
/// The fix is to carry a refusal as data: no exception, no retry, the copy on
/// screen on the first frame.
LibraryEntryRefused _gateRefusal() => const LibraryEntryRefused(
      code: 'DEMANDING_GATE',
      message: 'It sounds like a lot is going on right now. This one works best '
          'when things feel a bit steadier. Want to try something calming '
          'first? You can come back to it anytime.',
    );

class _GateApi extends LibraryApi {
  _GateApi() : super(Dio());

  int calls = 0;

  @override
  Future<LibraryEntryResult> entry(String toolId, {int? feelingNow}) async {
    calls++;
    return _gateRefusal();
  }
}

/// A failure that is not a refusal (no network, 5xx): still an exception, so
/// the screen offers a retry instead of pretending the api said something.
class _FailingApi extends LibraryApi {
  _FailingApi() : super(Dio());

  int calls = 0;

  @override
  Future<LibraryEntryResult> entry(String toolId, {int? feelingNow}) async {
    calls++;
    throw DioException(
      requestOptions: RequestOptions(path: '/library/$toolId'),
      type: DioExceptionType.connectionError,
      message: 'no network',
    );
  }
}

Widget harness(LibraryApi api, {int? feelingNow = 7}) {
  return ProviderScope(
    overrides: [
      libraryApiProvider.overrideWithValue(api),
      // The screen reads the uid for the draft key. No account in a widget
      // test, and the real provider would construct the auth service.
      authStateProvider.overrideWith((ref) => Stream<AuthUser?>.value(null)),
    ],
    child: MaterialApp(
      home: WorksheetScreen(toolId: 'ws_thinking_trap', feelingNow: feelingNow),
    ),
  );
}

void main() {
  testWidgets('a refusal shows the api sentence instead of a spinner',
      (tester) async {
    await tester.pumpWidget(harness(_GateApi()));
    await tester.pump();

    expect(find.textContaining('It sounds like a lot is going on right now'),
        findsOneWidget);
    expect(find.text('Try grounding'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });

  testWidgets('a refusal is asked for once, never retried', (tester) async {
    final api = _GateApi();
    await tester.pumpWidget(harness(api));
    // Long enough to cover Riverpod's first four backoff windows (200 ms,
    // 400 ms, 800 ms, 1.6 s) — the old code had re-requested the worksheet
    // three times by now.
    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(seconds: 3));

    expect(api.calls, 1);
    expect(find.text('Try grounding'), findsOneWidget);
  });

  testWidgets('a real failure offers a retry and never sits on a spinner',
      (tester) async {
    final api = _FailingApi();
    await tester.pumpWidget(harness(api));
    await tester.pump();

    expect(find.text('Try again'), findsOneWidget);

    // Even while Riverpod is retrying behind the scenes, the screen keeps the
    // explanation rather than flashing back to a bare spinner.
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('Try again'), findsOneWidget);
  });

  test('the gate answer travels to the api as the gate answer', () async {
    // The screen is keyed by tool id AND the rating, so a second attempt with a
    // different number fetches a fresh body rather than replaying a cached
    // refusal — and the number reaching the api is the slider's, not a default.
    final api = _RecordingApi();
    final container = ProviderContainer(
      overrides: [libraryApiProvider.overrideWithValue(api)],
    );
    addTearDown(container.dispose);
    container.listen(libraryEntryProvider('ws_thinking_trap|7'), (_, __) {});

    await container.read(libraryEntryProvider('ws_thinking_trap|7').future);

    expect(api.seen, [('ws_thinking_trap', 7)]);
  });
}

class _RecordingApi extends LibraryApi {
  _RecordingApi() : super(Dio());

  final List<(String, int?)> seen = [];

  @override
  Future<LibraryEntryResult> entry(String toolId, {int? feelingNow}) async {
    seen.add((toolId, feelingNow));
    return _gateRefusal();
  }
}
