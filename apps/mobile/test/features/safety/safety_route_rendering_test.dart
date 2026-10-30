// E17-S11 — every safety outcome the api can serve, rendered by the real
// client.
//
// WHAT IS UNDER TEST: the widget tree a frame reaches after
// `apps/api/src/routes/websocket.ts` sends it. Frames are built in the exact
// shapes that route writes, fed through `WebSocketService.handleRawFrame` (the
// same `_onMessage` a socket read calls), and asserted on as *rendered text* —
// because a safety reply that the client truncates, hides, or turns into an
// empty bubble has failed the user no matter what the server sent.
//
// Every string asserted on is the verbatim server constant (see
// `test/support/safety_copy.dart`, extracted from the api source).

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:okuvu/src/config/app_config.dart';
import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/chat/models/chat_message.dart';
import 'package:okuvu/src/features/chat/widgets/typing_indicator.dart';

import '../../support/safety_copy.dart';
import '../../support/safety_harness.dart';

/// The helpline set on the S4 crisis card, as the client renders it
/// (`lib/src/features/crisis/crisis_overlay.dart`).
const crisisCardNumbers = <String>[
  '9152987821',
  '1860-2662-345',
  '080-46110007',
  '044-24640050',
  '112',
];

const crisisCardNames = <String>[
  'iCall (IIT Bombay)',
  'Vandrevala Foundation',
  'NIMHANS',
  'Snehi',
  'Emergency Services',
];

void main() {
  setUpAll(() => AppConfig.init('dev'));

  group('S4 — crisis outcome (CRISIS_SIGNAL)', () {
    testWidgets(
      'a CRISIS_SIGNAL frame shows the crisis card with all five helplines',
      (tester) async {
        final ws = FrameDrivenWebSocketService();
        final container = await pumpOkuvuApp(tester, ws: ws);
        ws.handleRawFrame(openSessionFrame());
        await tester.pumpAndSettle();

        // Nothing on screen before the frame: this is the frame doing it.
        expect(find.text("You're not alone."), findsNothing);

        ws.handleRawFrame(crisisSignalFrame(message: crisisResponse));
        await tester.pumpAndSettle();

        // The app-wide flag the overlay slot watches.
        expect(container.read(crisisOverlayProvider), isTrue);

        expect(find.text("You're not alone."), findsOneWidget);
        expect(find.text('Here are some people you can call right now.'),
            findsOneWidget);

        for (final name in crisisCardNames) {
          expect(find.text(name), findsOneWidget,
              reason: 'crisis card must name $name');
        }

        for (final number in crisisCardNumbers) {
          expectVisibleAndComplete(tester, number);
        }

        // Every digit has to be readable as text, not just present as a
        // tel: argument — the number is useless if the user cannot read it.
        final rendered = renderedParagraphs(tester).join('\n');
        for (final number in crisisCardNumbers) {
          expect(rendered, contains(number),
              reason: '$number must appear in rendered paragraph text');
        }
      },
    );

    testWidgets(
      'a CRISIS_SIGNAL carrying the CRISIS_FLOOR notice shows the same card',
      (tester) async {
        final ws = FrameDrivenWebSocketService();
        final container = await pumpOkuvuApp(tester, ws: ws);
        ws.handleRawFrame(openSessionFrame());
        await tester.pumpAndSettle();

        ws.handleRawFrame(crisisSignalFrame(
          message: crisisResponse,
          safety: {
            'code': 'CRISIS_FLOOR',
            'reason': 'llm_timeout',
            'crisis_floor': true,
          },
        ));
        await tester.pumpAndSettle();

        expect(container.read(crisisOverlayProvider), isTrue);
        expect(find.text("You're not alone."), findsOneWidget);
        for (final number in crisisCardNumbers) {
          expectVisibleAndComplete(tester, number);
        }
      },
    );

    testWidgets(
      'the crisis copy the api sends with the frame is not lost from the '
      'transcript after the card is dismissed',
      (tester) async {
        final ws = FrameDrivenWebSocketService();
        final container = await pumpOkuvuApp(tester, ws: ws);
        ws.handleRawFrame(openSessionFrame());
        await tester.pumpAndSettle();

        ws.handleRawFrame(crisisSignalFrame(message: crisisResponse));
        await tester.pumpAndSettle();
        expect(container.read(crisisOverlayProvider), isTrue);

        await tester.tap(find.byKey(const Key('crisisOverlayDismissButton')));
        await tester.pumpAndSettle();

        expect(container.read(crisisOverlayProvider), isFalse);

        // The S4 turn's message is what the api sent as `payload.message`.
        // The client must not leave the user looking at their own message with
        // no reply under it once the card is gone.
        final agentMessages = container
            .read(chatMessagesProvider)
            .messages
            .where((m) => m.sender == MessageSender.agent)
            .toList();
        expect(agentMessages, isNotEmpty,
            reason: 'the crisis turn must leave an assistant message behind');
        expectVisibleAndComplete(tester, crisisResponse);
      },
    );

    testWidgets(
      'a CRISIS_SIGNAL settles the pending turn instead of timing out',
      (tester) async {
        final ws = FrameDrivenWebSocketService();
        await pumpChatScreen(tester, ws: ws);
        ws.handleRawFrame(openSessionFrame());
        await tester.pumpAndSettle();

        await tester.enterText(
            find.byKey(const ValueKey('chat_input')), 'I want to die');
        await tester.pump();
        await tester.tap(find.byKey(const ValueKey('chat_send')));
        await tester.pump();
        await tester.pump();
        expect(find.byType(TypingIndicator), findsOneWidget);

        ws.handleRawFrame(crisisSignalFrame(message: crisisResponse));
        await tester.pumpAndSettle();

        // The turn is answered, so the spinner must stop and the 20s
        // "No response received. Please try again." timer must not fire — a
        // user in crisis must never be told their message went unanswered.
        expect(find.byType(TypingIndicator), findsNothing);
        await tester.pump(const Duration(seconds: 21));
        expect(
            find.text('No response received. Please try again.'), findsNothing);
        expectVisibleAndComplete(tester, crisisResponse);
      },
    );
  });

  group('S3 — grounding outcome (AGENT_TURN, no safety notice)', () {
    testWidgets(
      'the S3 grounding message renders in full, helpline digits included',
      (tester) async {
        final ws = FrameDrivenWebSocketService();
        await pumpChatScreen(tester, ws: ws);
        ws.handleRawFrame(openSessionFrame());
        await tester.pumpAndSettle();

        ws.handleRawFrame(agentTurnFrame(message: a8S3GroundingResponse));
        await tester.pumpAndSettle();

        // 1. The whole string, paragraph for paragraph, not a prefix.
        expectVisibleAndComplete(tester, a8S3GroundingResponse);

        // 2. The digits specifically. Two independent readings: the paragraph
        //    text as laid out, and the raw blob of every rendered paragraph.
        final rendered = renderedParagraphs(tester).join('\n');
        expect(rendered, contains('9152987821'));
        expect(rendered, contains('1860-2662-345'));

        // 3. A crisis line the user can actually dial: the number is in the
        //    same paragraph run with its label, not split off or dropped.
        expect(rendered, contains('iCall on 9152987821'));
        expect(rendered, contains('Vandrevala Foundation on 1860-2662-345'));

        // 4. The closing line survives too — the copy is not clipped at the
        //    second newline.
        expect(rendered, contains("I'm here with you."));
      },
    );
  });

  group('medical emergency outcome (AGENT_TURN, MEDICAL_EMERGENCY_FLOOR)', () {
    testWidgets(
      'the medical emergency message renders in full, 112 first',
      (tester) async {
        final ws = FrameDrivenWebSocketService();
        await pumpChatScreen(tester, ws: ws);
        ws.handleRawFrame(openSessionFrame());
        await tester.pumpAndSettle();

        ws.handleRawFrame(agentTurnFrame(
          message: medicalEmergencyResponse,
          safety: {
            'code': 'MEDICAL_EMERGENCY_FLOOR',
            'reason': 'deterministic_screen',
          },
        ));
        await tester.pumpAndSettle();

        expectVisibleAndComplete(tester, medicalEmergencyResponse);

        final paragraph = renderedTextFor(tester, medicalEmergencyResponse);
        expect(paragraph, contains('112'));
        // The number must be in the first sentence, where a user in an
        // emergency reads it — not buried after the acknowledgement.
        expect(
          paragraph,
          startsWith('Please call 112 for emergency medical help right now'),
        );
      },
    );

    testWidgets(
      'the medical+crisis overlap copy keeps both 112 and the helplines',
      (tester) async {
        final ws = FrameDrivenWebSocketService();
        await pumpChatScreen(tester, ws: ws);
        ws.handleRawFrame(openSessionFrame());
        await tester.pumpAndSettle();

        ws.handleRawFrame(agentTurnFrame(
          message: medicalEmergencyCrisisResponse,
          safety: {
            'code': 'MEDICAL_EMERGENCY_FLOOR',
            'reason': 'deterministic_screen',
          },
        ));
        await tester.pumpAndSettle();

        expectVisibleAndComplete(tester, medicalEmergencyCrisisResponse);
        final rendered = renderedParagraphs(tester).join('\n');
        expect(rendered, contains('112'));
        expect(rendered, contains('9152987821'));
        expect(rendered, contains('1860-2662-345'));
      },
    );
  });

  group('degraded outcomes (AGENT_TURN with a safety notice)', () {
    testWidgets('SAFE_FALLBACK renders as a visible assistant message',
        (tester) async {
      final ws = FrameDrivenWebSocketService();
      await pumpChatScreen(tester, ws: ws);
      ws.handleRawFrame(openSessionFrame());
      await tester.pumpAndSettle();

      // The generic canned-response line, on the wire exactly as
      // apps/api/src/lib/canned-response.ts defines it.
      ws.handleRawFrame(agentTurnFrame(
        message: safeFallback,
        safety: {'code': 'MODEL_UNAVAILABLE', 'reason': 'llm_throttled'},
      ));
      await tester.pumpAndSettle();

      expectVisibleAndComplete(tester, safeFallback);
    });

    testWidgets('SAFE_FALLBACK with no safety field at all still renders',
        (tester) async {
      final ws = FrameDrivenWebSocketService();
      await pumpChatScreen(tester, ws: ws);
      ws.handleRawFrame(openSessionFrame());
      await tester.pumpAndSettle();

      // An older server, or the canned-response path, sends no notice. The
      // client must render the text regardless — the notice is metadata.
      ws.handleRawFrame(agentTurnFrame(message: safeFallback));
      await tester.pumpAndSettle();

      expectVisibleAndComplete(tester, safeFallback);
    });

    testWidgets('the two degraded copies keep their helpline digits',
        (tester) async {
      final ws = FrameDrivenWebSocketService();
      await pumpChatScreen(tester, ws: ws);
      ws.handleRawFrame(openSessionFrame());
      await tester.pumpAndSettle();

      ws.handleRawFrame(agentTurnFrame(
        message: safetyUnavailableResponse,
        safety: {'code': 'SAFETY_UNAVAILABLE', 'reason': 'llm_timeout'},
        turnId: 'turn-a',
      ));
      await tester.pumpAndSettle();
      ws.handleRawFrame(agentTurnFrame(
        message: modelUnavailableResponse,
        safety: {'code': 'MODEL_UNAVAILABLE', 'reason': 'llm_api_error'},
        turnId: 'turn-b',
        turnCount: 2,
      ));
      await tester.pumpAndSettle();

      expectVisibleAndComplete(tester, safetyUnavailableResponse);
      expectVisibleAndComplete(tester, modelUnavailableResponse);

      final rendered = renderedParagraphs(tester).join('\n');
      expect(rendered, contains('9152987821'));
      expect(rendered, contains('1860-2662-345'));
    });
  });

  group('unrecognised and missing safety codes', () {
    testWidgets(
      'an unknown safety code renders the message instead of an empty bubble',
      (tester) async {
        final ws = FrameDrivenWebSocketService();
        final container = await pumpChatScreen(tester, ws: ws);
        ws.handleRawFrame(openSessionFrame());
        await tester.pumpAndSettle();

        const futureCopy = 'A safety outcome this build has never heard of.';
        ws.handleRawFrame(agentTurnFrame(
          message: futureCopy,
          safety: {'code': 'SOMETHING_ADDED_IN_2027', 'reason': 'unknown'},
        ));
        await tester.pumpAndSettle();

        expectVisibleAndComplete(tester, futureCopy);

        // And it is a real bubble with content, not a zero-height box.
        final messages = container.read(chatMessagesProvider).messages;
        expect(messages, hasLength(1));
        expect(messages.single.content, futureCopy);
      },
    );

    testWidgets(
      'the budget refusal copy renders with its helplines (E17-S6 wire shape)',
      (tester) async {
        final ws = FrameDrivenWebSocketService();
        await pumpChatScreen(tester, ws: ws);
        ws.handleRawFrame(openSessionFrame());
        await tester.pumpAndSettle();

        final frame = agentTurnFrame(
          message: budgetPausedResponse,
          turnId: null,
          turnCount: 0,
        );
        ws.handleRawFrame(frame);
        await tester.pumpAndSettle();

        expectVisibleAndComplete(tester, budgetPausedResponse);
        expect(renderedParagraphs(tester).join('\n'), contains('9152987821'));
      },
    );

    testWidgets(
      'a frame with a safety notice but no message never leaves an empty bubble',
      (tester) async {
        final ws = FrameDrivenWebSocketService();
        final container = await pumpChatScreen(tester, ws: ws);
        ws.handleRawFrame(openSessionFrame());
        await tester.pumpAndSettle();

        ws.handleRawFrame(agentTurnFrameWithoutMessage(
          safety: {
            'code': 'MEDICAL_EMERGENCY_FLOOR',
            'reason': 'deterministic_screen'
          },
        ));
        await tester.pumpAndSettle();

        // A message with no text is a contract violation, and the client is
        // right to refuse to guess at copy — but it must not paint the empty
        // white bubble that refusal would produce if the frame were accepted.
        final messages = container.read(chatMessagesProvider).messages;
        expect(messages.where((m) => m.content.trim().isEmpty), isEmpty,
            reason: 'no empty assistant bubble may reach the transcript');
        expect(find.byType(Text), findsWidgets);
      },
    );
  });
}
