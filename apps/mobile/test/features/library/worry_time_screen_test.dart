import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:okuvu/src/features/library/worry_time_api.dart';
import 'package:okuvu/src/features/library/worry_time_screen.dart';

/// The two review answers the owner named: "Still bothering me" is `still`,
/// "Not anymore" is `released`. What this proves is that the words on screen
/// send those two statuses and that a resolved worry leaves the review list.
class _FakeWorryTimeApi extends WorryTimeApi {
  _FakeWorryTimeApi({this.parked = const []}) : super(Dio());

  final List<ParkedWorry> parked;
  final List<(String id, String status)> resolved = [];

  @override
  Future<WorryTimeState> load() async {
    return WorryTimeState(
      setting: const WorryTimeSetting(time: '19:00', minutes: 15, active: true),
      parked: parked,
    );
  }

  @override
  Future<void> resolve(String id, String status) async {
    resolved.add((id, status));
  }
}

Widget harness(WorryTimeApi api) {
  return ProviderScope(
    overrides: [worryTimeApiProvider.overrideWithValue(api)],
    child: const MaterialApp(home: WorryTimeScreen()),
  );
}

void main() {
  testWidgets("the review sends 'still' and 'released', not a score",
      (tester) async {
    tester.view.physicalSize = const Size(1080, 3000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final api = _FakeWorryTimeApi(
      parked: const [
        ParkedWorry(id: 'w1', text: 'The money conversation'),
        ParkedWorry(id: 'w2', text: 'The email I have not sent'),
      ],
    );

    await tester.pumpWidget(harness(api));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('worry_time_review')));
    await tester.pumpAndSettle();

    expect(find.text('The money conversation'), findsOneWidget);
    expect(find.text('The email I have not sent'), findsOneWidget);

    await tester.tap(find.text('Still bothering me').first);
    await tester.pumpAndSettle();

    // The first answer is recorded and that worry leaves the review.
    expect(api.resolved, [('w1', 'still')]);
    expect(find.text('The money conversation'), findsNothing);

    await tester.tap(find.text('Not anymore'));
    await tester.pumpAndSettle();

    expect(api.resolved, [('w1', 'still'), ('w2', 'released')]);

    // The review ends on the worksheet's closing reflection, not on a tally.
    expect(find.text('What do you notice about the ones you parked?'),
        findsOneWidget);
    expect(find.text('A worry kept for later is a worry you\'re not carrying all day.'),
        findsOneWidget);
  });
}
