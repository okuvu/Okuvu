/// The words a client reads when they tap the (i) beside a breathing exercise,
/// plus the pause and break copy — all in one place, because all of it is
/// clinically reviewed text rather than UI strings.
///
/// Approvals are per version: editing any sentence below means bumping
/// [breathingCopyReview] and sending it back to Dr Goswami, so an old sign-off
/// can never be spent silently on new words.
///
/// v2.0.0 (4 Nov 2026) — her reply of 3 Nov 2026 19:15Z, "Approved with
/// changes". What changed from v1.0.0:
///  * Guided breathing is gone. It and Extended exhale were "essentially the
///    same exercise", so the set is Box, Physiological sigh, Extended exhale
///    and Humming breath (new).
///  * Her sentences replace ours, used exactly as sent, including "Why it
///    helps" as the heading.
///  * Each technique gets its own visual so they never look alike.
///  * The sigh pauses after 5 breaths, not 10.
///  * The typed answer is replaced by three taps: Calmer / About the same /
///    Worse. A free-text box at 2 a.m. is a channel nobody is reading.
///  * Thirty breaths is no longer a hard stop: Done is the main button, with
///    a smaller "Talk to Okuvu".
library;

class BreathingSection {
  final String heading;
  final String body;
  const BreathingSection(this.heading, this.body);
}

/// The four shapes the player can draw. One per technique, so a client can
/// tell two exercises apart with their eyes closed to the text.
enum BreathVisual {
  /// A dot travelling around the four sides of a square.
  box,

  /// A circle that fills, swells a little more, then empties — words, not
  /// numbers.
  swell,

  /// A wave that rises quickly and falls slowly, like a tide going out.
  wave,

  /// Ripples spreading outward from the centre during the hum.
  ripples,
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

  /// Breaths before the pause. The physiological sigh uses 5 because repeated
  /// sighing can cause light-headedness (her note on Q3).
  final int breathsPerRound;

  /// Numbers inside the shape? False for the sigh: "guided by words, not
  /// numbers".
  final bool showsNumbers;

  final BreathVisual visual;

  final List<BreathingSection> explanation;

  const BreathingTechnique({
    required this.toolId,
    required this.name,
    required this.cardLabel,
    required this.paceLine,
    required this.breathsPerRound,
    required this.showsNumbers,
    required this.visual,
    required this.explanation,
  });
}

/// The four techniques in the order they are offered. Box breathing stays
/// first because it is the app's default and the first one taught.
const List<BreathingTechnique> breathingTechniques = [
  BreathingTechnique(
    toolId: 'box_breathing',
    name: 'Box breathing',
    cardLabel: 'Box Breathing',
    paceLine: '4 in, 4 hold, 4 out, 4 hold',
    breathsPerRound: 10,
    showsNumbers: true,
    visual: BreathVisual.box,
    explanation: [
      BreathingSection(
        'What it is',
        'Four equal parts – breathe in, hold, breathe out, hold – like walking '
            'around the four sides of a square.',
      ),
      BreathingSection(
        'How to do it',
        'Breathe in through your nose for 4. Hold for 4. Breathe out for 4. '
            'Hold for 4. Then begin again. Follow the dot as it moves around '
            'the square, so you do not have to count.',
      ),
      BreathingSection(
        'Why it helps',
        'Counting gives your attention something steady to hold on to, and an '
            'even rhythm is easier to keep when your mind is not. Use it when '
            'you notice yourself tensing, before something you are dreading, '
            'or when you want to come back to the room you are in.',
      ),
      BreathingSection(
        'If 4 feels too long',
        'keep the same shape with 3. If holding your breath feels '
            'uncomfortable, skip the holds.',
      ),
    ],
  ),
  BreathingTechnique(
    toolId: 'physiological_sigh',
    name: 'Physiological sigh',
    cardLabel: 'Physiological Sigh',
    paceLine: 'a full breath in, a little more, a long breath out',
    breathsPerRound: 5,
    showsNumbers: false,
    visual: BreathVisual.swell,
    explanation: [
      BreathingSection(
        'What it is',
        'A deep breath in through the nose until your lungs feel full, a small '
            'extra sip of air on top, then one long sigh out through the '
            'mouth. It is the breath your body takes by itself after crying '
            'or a fright.',
      ),
      BreathingSection(
        'How to do it',
        'Breathe in through your nose and fill your lungs – take as long as '
            'you need. When you feel full, take one more small sip of air on '
            'top. Then let it all go in a long, slow breath out through your '
            'mouth, longer than your breath in. No holding. Go at your own '
            'pace; the screen is a guide, not a rule.',
      ),
      BreathingSection(
        'Why it helps',
        'When you are already wound up, a slow counted breath can feel '
            'impossible. This one works with how your body already wants to '
            'breathe, and the long sigh out is the release. Use it when you '
            'are already activated – not when you are calm. A few sighs are '
            'usually enough.',
      ),
      BreathingSection(
        'If you feel light-headed',
        'stop and breathe normally for a moment.',
      ),
    ],
  ),
  BreathingTechnique(
    toolId: 'extended_exhale',
    name: 'Extended exhale',
    cardLabel: 'Extended Exhale',
    paceLine: '4 in, 8 out',
    breathsPerRound: 10,
    showsNumbers: true,
    visual: BreathVisual.wave,
    explanation: [
      BreathingSection(
        'What it is',
        'A slow breath where the out-breath is twice as long as the in-breath. '
            'No hold.',
      ),
      BreathingSection(
        'How to do it',
        'Breathe in through your nose for 4. Breathe out slowly through your '
            'mouth or nose for 8, gently, without forcing it. Follow the wave '
            '– it rises as you breathe in and falls slowly as you breathe out.',
      ),
      BreathingSection(
        'Why it helps',
        'A long out-breath is one of the simplest ways to slow fast, shallow '
            'breathing. Use it when your breathing has moved high into your '
            'chest, before sleep, or when you cannot settle.',
      ),
      BreathingSection(
        'If 8 feels too long',
        'breathe out for 6. Never push the last bit of air out.',
      ),
    ],
  ),
  BreathingTechnique(
    toolId: 'humming_breath',
    name: 'Humming breath',
    cardLabel: 'Humming Breath',
    paceLine: '4 in, 6 hum out',
    breathsPerRound: 10,
    showsNumbers: true,
    visual: BreathVisual.ripples,
    explanation: [
      BreathingSection(
        'What it is',
        'Breathe in through your nose, then breathe out with a soft, steady '
            'hum, lips gently closed. You may know it from yoga as bhramari, '
            'the bee breath.',
      ),
      BreathingSection(
        'How to do it',
        'Breathe in through your nose for 4. Close your lips and breathe out '
            'with a low, comfortable hum for 6 – you should feel a gentle buzz '
            'in your face and chest. Watch the ripples spread while you hum. '
            'Then breathe in and begin again.',
      ),
      BreathingSection(
        'Why it helps',
        'The hum slows your out-breath for you without counting, and the buzz '
            'gives your mind something to feel instead of think. Use it when '
            'your thoughts are racing and counting is not working.',
      ),
      BreathingSection(
        'If you cannot make sound where you are',
        'hum very softly, or switch to Extended exhale.',
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

/// The pause copy, part of the same clinical review. Three taps, never a text
/// box: "A free-text box at 2 a.m. is a channel nobody is reading."
const String breathPauseQuestion = "Let's pause here. How are you feeling now?";
const String breathCalmerLabel = 'Calmer';
const String breathSameLabel = 'About the same';
const String breathWorseLabel = 'Worse';
const String breathContinueLabel = 'Continue';
const String breathStopLabel = 'Stop for now';
const String breathDoneLabel = 'Done';
const String breathTalkLabel = 'Talk to Okuvu';

/// Offered after the last round, and whenever the client taps "Worse".
const String breathBreakHeadline = 'A good place to rest';
const String breathBreakBody =
    'Come back to it whenever you need. Breathing practice works better in '
    'short sittings than in one long one.';

/// "You took a moment for yourself. Come back whenever you like."
/// Deliberately no breath count — "it reads like a score".
const String breathStoppedCopy =
    'You took a moment for yourself. Come back whenever you like.';

const String breathWorseCopy =
    'Thank you for saying so. Talking can help — Okuvu is here, and the '
    'helplines are on the crisis screen.';

/// "That's 30 breaths. A good place to rest – come back to it whenever you
/// need." The count is the technique's own ceiling (15 for the sigh).
String breathFinishedHeadline(int breaths) =>
    "That's $breaths ${breaths == 1 ? 'breath' : 'breaths'}. $breathBreakHeadline.";

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
  version: '2.0.0',
  sentOn: '2026-11-04',
  emailMessageId: '1a1a2c3077d1bc02',
  approvedOn: '2026-11-03',
  approvalMessageId: '1a1a2d6769fe9e01',
);
