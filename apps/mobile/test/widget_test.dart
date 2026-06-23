import 'package:flutter_test/flutter_test.dart';

import 'package:evia/src/app.dart';
import 'package:evia/src/config/app_config.dart';

void main() {
  testWidgets('App displays environment info', (WidgetTester tester) async {
    AppConfig.init('dev');

    await tester.pumpWidget(const App());
    expect(find.text('Evia'), findsOneWidget);
    expect(find.textContaining('Environment:'), findsOneWidget);
    expect(find.textContaining('Base URL:'), findsOneWidget);
  });
}
