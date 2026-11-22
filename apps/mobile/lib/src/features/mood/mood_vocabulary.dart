import 'package:flutter/material.dart';

import '../../theme/app_colors.dart';

/// The mood check-in's vocabulary, in one file.
///
/// The owner's instruction (22 Nov 2026) is the approved copy for this surface:
/// five faces with the words Awful / Low / Okay / Good / Great, the four feeling
/// groups, the strength question and the gentle card. Nothing here is composed.
///
/// `packages/shared-types/mood.ts` holds the same list for the api and the
/// therapist portal. Flutter cannot import it, so the two are kept identical by
/// a repo test that reads this file and compares the words (see
/// `apps/api/src/__tests__/mood-vocabulary-parity.test.ts`); editing one without
/// the other fails that test rather than drifting into a build.
///
/// The stored value stays 1-5 (`mood_value`), so old check-ins keep their
/// meaning: the faces are a rendering of that value, not a new scale.

/// One face: its stored value, the word under it, and the two brand colours it
/// is drawn in. All five are drawn here rather than taken from the system emoji
/// font — a phone's emoji set is a different face on every handset.
class MoodFaceStyle {
  const MoodFaceStyle({
    required this.value,
    required this.label,
    required this.stroke,
    required this.fill,
  });

  final int value;
  final String label;

  /// The outline, eyes, brows and mouth.
  final Color stroke;

  /// The face itself.
  final Color fill;
}

/// 1 = Awful … 5 = Great, in the order they are shown.
const List<MoodFaceStyle> kMoodFaces = [
  MoodFaceStyle(
    value: 1,
    label: 'Awful',
    stroke: AppColors.royalPurple,
    fill: AppColors.lavenderTint,
  ),
  MoodFaceStyle(
    value: 2,
    label: 'Low',
    stroke: AppColors.indigoViolet,
    fill: AppColors.orchidWash,
  ),
  MoodFaceStyle(
    value: 3,
    label: 'Okay',
    stroke: AppColors.inkSoft,
    fill: AppColors.oat,
  ),
  MoodFaceStyle(
    value: 4,
    label: 'Good',
    stroke: AppColors.sageDeep,
    fill: AppColors.sageTint,
  ),
  MoodFaceStyle(
    value: 5,
    label: 'Great',
    stroke: AppColors.honeyDeep,
    fill: AppColors.honeyTint,
  ),
];

MoodFaceStyle? moodFaceFor(int? value) {
  if (value == null) return null;
  for (final face in kMoodFaces) {
    if (face.value == value) return face;
  }
  return null;
}

String? moodLabelFor(int? value) => moodFaceFor(value)?.label;

/// The feeling words, in the owner's four groups — group order his, order inside
/// a group his. 18 words in total.
const List<List<String>> kFeelingGroups = [
  ['anxious', 'angry', 'overwhelmed', 'restless'],
  ['sad', 'lonely', 'tired', 'numb', 'hopeless'],
  ['calm', 'relieved', 'content', 'grateful'],
  ['happy', 'excited', 'hopeful', 'proud', 'motivated'],
];

/// Every word a chip can send, flattened.
final List<String> kFeelingWords =
    kFeelingGroups.expand((group) => group).toList(growable: false);

/// Up to three chips, no repeats.
const int kMaxFeelingWords = 3;

/// The "Something else" text box, same limit as the api's.
const int kFeelingOtherMax = 120;

const String kFeelingQuestion = 'Any words for this?';
const String kFeelingOtherLabel = 'Something else';
const String kSkipLabel = 'Skip';

/// The optional strength slider: 1 = a little, 5 = a lot.
const int kStrengthMin = 1;
const int kStrengthMax = 5;
const String kStrengthQuestion = 'How strong is this feeling?';
const String kStrengthLowLabel = 'a little';
const String kStrengthHighLabel = 'a lot';

/// The two chips that show the gentle card after a save.
///
/// A card, not an alert: no safety flag is written and nothing is sent to the
/// therapist because one of these was tapped. The client chooses what happens
/// next. (Contrast the "Something else" text box, which the api screens like any
/// other client-typed text.)
const List<String> kHeavyFeelingWords = ['hopeless', 'numb'];

bool showsGentleCard(Iterable<String> words) =>
    words.any(kHeavyFeelingWords.contains);

/// The gentle card, verbatim — one sentence, written as one Dart literal so a
/// parity test can find it in the raw source.
const String kGentleCardLine =
    "That sounds really heavy. You don't have to sit with this alone. Would you like some support right now?";

const String kGentleChatLabel = 'Talk in chat';
const String kGentleSupportLabel = 'See support lines';
const String kGentleNotNowLabel = 'Not now';
