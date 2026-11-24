//
// The chat frame's screen payload (owner's rule, 24 Nov 2026).
//
// "I want to hurt someone" is a screen on a worksheet answer and now also in
// chat, and the app must render it the same way in both places: from the api's
// words, not a second copy in Dart. These are the three facts that make that
// true on the chat path — the frame parses the screen, it parses the gentler
// variant as well, and an ordinary turn carries nothing.
//

import 'package:flutter_test/flutter_test.dart';

import 'package:okuvu/src/features/chat/models/agent_turn_frame.dart';

Map<String, dynamic> _frame(Map<String, dynamic>? screen) => {
      'type': 'AGENT_TURN',
      'payload': {
        'session_id': 'sess_1',
        'message': 'Some reply',
        'turn_count': 3,
        'turn_id': 'turn_1',
        if (screen != null) 'screen': screen,
      },
    };

Map<String, dynamic> _screen(String kind) => {
      'kind': kind,
      'paragraphs': ['Thank you for telling me.', 'A thought is not an action.'],
      'emergency': {
        'label': 'Emergency services',
        'description': 'Ambulance, police and fire.',
        'number': '112',
        'display': '112',
      },
      'resources': const [],
      'alert': 'Your therapist has been told this is urgent.',
      'plan_label': 'My plan for hard moments',
      'closing': "You can come back to OKUVU whenever you're ready.",
    };

void main() {
  group('AgentTurnFrame — the safety screen payload', () {
    test('parses the intent screen', () {
      final frame = AgentTurnFrame.fromJson(_frame(_screen('harm_to_someone')));

      expect(frame.harmToSomeone, isNotNull);
      expect(frame.harmToSomeone!.paragraphs.first, 'Thank you for telling me.');
      expect(frame.harmToSomeone!.alert, contains('told this is urgent'));
    });

    test('parses the gentler thoughts screen through the same widget', () {
      final frame =
          AgentTurnFrame.fromJson(_frame(_screen('harm_to_someone_thoughts')));

      expect(frame.harmToSomeone, isNotNull);
      expect(frame.harmToSomeone!.paragraphs, hasLength(2));
    });

    test('carries nothing on an ordinary turn', () {
      final frame = AgentTurnFrame.fromJson(_frame(null));

      expect(frame.harmToSomeone, isNull);
      expect(frame.content, 'Some reply');
      expect(frame.turnCount, 3);
    });

    test('ignores a screen of an unknown kind rather than rendering a fragment', () {
      final frame = AgentTurnFrame.fromJson(_frame(_screen('something_else')));

      expect(frame.harmToSomeone, isNull);
    });
  });
}
