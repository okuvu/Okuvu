/// The words a client reads when they tap the (i) beside a breathing exercise,
/// plus the pause and break copy — all in one place, because all of it is
/// clinically reviewed text rather than UI strings.
///
/// OWNER ROUND 2 (4 Nov 2026). Rajwant's instruction: send the explanations to
/// Dr Shubhangi Goswami for approval *before* they go into the app. The text
/// below is the exact text sent for review — see [breathingCopyReview] — so an
/// approval covers what ships and an edit needs a fresh review. Do not reword
/// these paragraphs in place; change the text, bump the version and send it.
library;

class BreathingSection {
  final String heading;
  final String body;
  const BreathingSection(this.heading, this.body);
}

class BreathingTechnique {
  /// Registry id, matching ToolRegistryEntry / ToolCardType.
  final String toolId;

  /// Lower-case name used in the chooser: "Box breathing".
  final String name;

  /// Title shown on the card and at the top of the explanation.
  final String cardLabel;

  /// The pace line, e.g. "4 in, 4 hold, 4 out, 4 hold".
  final String paceLine;

  final List<BreathingSection> explanation;

  const BreathingTechnique({
    required this.toolId,
    required this.name,
    required this.cardLabel,
    required this.paceLine,
    required this.explanation,
  });
}

/// The four breathing techniques in the order they are offered. Box breathing
/// stays first because it is the app's default and the first one taught.
const List<BreathingTechnique> breathingTechniques = [
  BreathingTechnique(
    toolId: 'box_breathing',
    name: 'Box breathing',
    cardLabel: 'Box Breathing',
    paceLine: '4 in, 4 hold, 4 out, 4 hold',
    explanation: [
      BreathingSection(
        'What it is',
        'Four equal parts, one after another — breathe in, hold, breathe out, '
            'hold — like walking round the four sides of a square.',
      ),
      BreathingSection(
        'How to do it',
        'Breathe in through your nose for 4. Hold for 4. Breathe out through '
            'your nose or your mouth for 4. Hold for 4. Then start the next '
            'round straight away. The shape on the screen grows as you breathe '
            'in, waits while you hold, and shrinks as you breathe out, so you '
            'can follow it instead of counting.',
      ),
      BreathingSection(
        'Why it is taught',
        'The counting gives your attention something steady to hold on to, and '
            'an even rhythm is easier to keep even when your mind is not. It is '
            'usually the first technique taught. Use it when you notice '
            'yourself tensing, before something you are dreading, or when you '
            'want to come back to the room you are in.',
      ),
      BreathingSection(
        'If 4 feels too long',
        'Keep the same shape with 3.',
      ),
    ],
  ),
  BreathingTechnique(
    toolId: 'guided_breathing',
    name: 'Guided breathing',
    cardLabel: 'Guided Breathing',
    paceLine: '4 in, 2 hold, 6 out',
    explanation: [
      BreathingSection(
        'What it is',
        'A slow breath with a longer out-breath — in for 4, a short pause of 2, '
            'out for 6.',
      ),
      BreathingSection(
        'How to do it',
        'Breathe in through your nose for 4. Hold for 2. Breathe out through '
            'your mouth for 6, as if you were fogging a mirror. No gap — the '
            'next breath starts from the end of the out-breath. The circle '
            'grows on the in-breath, stays still for the hold, and shrinks on '
            'the out-breath.',
      ),
      BreathingSection(
        'Why it is taught',
        'The long out-breath is the part that settles fast, shallow breathing. '
            'Use it when you notice your breathing has moved high into your '
            'chest, or when you want something slow to follow rather than '
            'something to count.',
      ),
    ],
  ),
  BreathingTechnique(
    toolId: 'physiological_sigh',
    name: 'Physiological sigh',
    cardLabel: 'Physiological Sigh',
    paceLine: '2 in, 2 more in, 8 out',
    explanation: [
      BreathingSection(
        'What it is',
        'Two breaths in through the nose — one ordinary, then a second small '
            'sip on top — followed by one long sigh out through the mouth. It '
            'is the breath the body takes by itself after crying or after a '
            'fright.',
      ),
      BreathingSection(
        'How to do it',
        'Breathe in through your nose for 2. Without breathing out, take a '
            'second short breath in on top of it, for 2. Then let a long, slow '
            'breath out through your mouth, for 8. No hold. The next round '
            'starts straight away.',
      ),
      BreathingSection(
        'Why it is taught',
        'When you are already wound up, a slow counted breath can feel '
            'impossible. The second small breath in refills the tiny air sacs '
            'in the lungs that close up when you are tense, and the long breath '
            'out is the release. Use it when you are already activated — not '
            'when you are calm.',
      ),
    ],
  ),
  BreathingTechnique(
    toolId: 'extended_exhale',
    name: 'Extended exhale',
    cardLabel: 'Extended Exhale',
    paceLine: '4 in, 2 hold, 8 out',
    explanation: [
      BreathingSection(
        'What it is',
        'In for 4, hold for 2, out for 8 — the out-breath twice as long as the '
            'in-breath.',
      ),
      BreathingSection(
        'How to do it',
        'Breathe in through your nose for 4. Hold for 2. Breathe out through '
            'your mouth or nose for 8, slowly and without forcing it. If the 8 '
            'runs out before the circle has finished shrinking, keep breathing '
            'out gently until it does rather than pushing.',
      ),
      BreathingSection(
        'Why it is taught',
        'Same family as guided breathing, with a longer hold and a longer '
            'out-breath. Choose it when you have the time to let the out-breath '
            'do most of the work — before sleep, or when you cannot settle.',
      ),
    ],
  ),
];

BreathingTechnique? breathingTechniqueFor(String toolId) {
  for (final technique in breathingTechniques) {
    if (technique.toolId == toolId) return technique;
  }
  return null;
}

/// The pause and closing copy, also part of the same clinical review.
const String breathPauseQuestion = "Let's pause here. How are you feeling?";
const String breathPauseHint = 'Optional — type as much or as little as you like.';
const String breathContinueLabel = 'Continue';
const String breathStopLabel = 'Stop for now';
const String breathFinishedHeadline = "That's 30 breaths. A good place to stop.";
const String breathFinishedBody =
    'Take a break and come back to it later — breathing practice works better '
    'in short sittings than in one long one.';

String breathStoppedHeadline(int breaths) =>
    'You stopped at $breaths ${breaths == 1 ? 'breath' : 'breaths'}.';

/// Provenance for the copy above. A review covers one version of this file:
/// editing any sentence requires a new version and a fresh approval, so an old
/// sign-off can never be spent on new words silently.
class BreathingCopyReview {
  final String reviewer;
  final String version;
  final String sentOn;
  final String emailMessageId;
  final String? approvedOn;
  final String? approvalMessageId;

  const BreathingCopyReview({
    required this.reviewer,
    required this.version,
    required this.sentOn,
    required this.emailMessageId,
    this.approvedOn,
    this.approvalMessageId,
  });

  bool get isApproved => approvedOn != null;
}

const BreathingCopyReview breathingCopyReview = BreathingCopyReview(
  reviewer: 'Dr Shubhangi Goswami',
  version: '1.0.0',
  sentOn: '2026-11-04',
  emailMessageId: '1a1a2c3077d1bc02',
);
