import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/providers.dart';
import '../../theme/app_colors.dart';

/// The client's safety plan, read-only.
///
/// Written with the therapist in the portal; there is no edit control here on
/// purpose. The seven parts and their wording come from the approved catalogue
/// body, the answers are the client's own words as typed in session, and the
/// crisis numbers are the central list the api serves — never stored on the
/// plan, so a retired line cannot survive inside it.
///
/// It ends with the fixed "Get help now" button the approved document specifies,
/// which opens the same crisis screen every other surface opens.
class SafetyPlanScreen extends ConsumerWidget {
  const SafetyPlanScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final planAsync = ref.watch(safetyPlanProvider);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft),
          onPressed: () => context.pop(),
        ),
        title: const Text('My plan for hard moments'),
      ),
      body: planAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => const Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Text(
              "This isn't available right now. Try again in a moment.",
              textAlign: TextAlign.center,
            ),
          ),
        ),
        data: (plan) {
          if (plan == null) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text('You and your therapist fill this in together.',
                    textAlign: TextAlign.center),
              ),
            );
          }

          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
            children: [
              if (plan.intro != null) ...[
                Text(
                  plan.intro!,
                  style: const TextStyle(
                    fontSize: 15,
                    height: 1.5,
                    color: AppColors.charcoalInk,
                  ),
                ),
                const SizedBox(height: 20),
              ],
              for (var i = 0; i < plan.parts.length; i++) ...[
                Text(
                  'Part ${i + 1}. ${plan.parts[i].prompt}',
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: AppColors.charcoalInk,
                  ),
                ),
                const SizedBox(height: 6),
                if (plan.parts[i].id == 'professional') ..._professional(plan),
                ..._answerLines(plan.answers[plan.parts[i].id]),
                const SizedBox(height: 20),
              ],
              const SizedBox(height: 8),
              FilledButton(
                key: const Key('safetyPlanGetHelpNow'),
                onPressed: () => ref.read(crisisOverlayProvider.notifier).show(),
                child: const Text('Get help now'),
              ),
            ],
          );
        },
      ),
    );
  }

  /// Part 5: the therapist's own contact details, then the one central list.
  List<Widget> _professional(SafetyPlan plan) {
    return [
      if (plan.therapistContact != null && plan.therapistContact!.trim().isNotEmpty) ...[
        Text(
          'Your therapist: ${plan.therapistContact}',
          style: const TextStyle(fontSize: 14, color: AppColors.charcoalInk),
        ),
        const SizedBox(height: 10),
      ],
      for (final line in plan.helplines)
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: InkWell(
            onTap: () => launchUrl(Uri(scheme: 'tel', path: line.phone)),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(LucideIcons.phone, size: 16),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${line.name} — ${line.display}',
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: AppColors.charcoalInk,
                        ),
                      ),
                      Text(
                        line.description,
                        style: TextStyle(
                          fontSize: 12,
                          color: AppColors.charcoalInk.withValues(alpha: 0.6),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
    ];
  }

  /// A part's answer: one line per item, whatever shape the api stored.
  List<Widget> _answerLines(Object? answer) {
    if (answer == null) {
      return const [
        Text('—', style: TextStyle(fontSize: 14, color: AppColors.charcoalInk)),
      ];
    }

    if (answer is String) {
      return [
        Text(answer, style: const TextStyle(fontSize: 14, height: 1.45, color: AppColors.charcoalInk)),
      ];
    }

    if (answer is List) {
      return [
        for (final row in answer)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('•  ', style: TextStyle(color: AppColors.charcoalInk)),
                Expanded(
                  child: Text(
                    row is Map
                        ? row.values
                            .where((value) => value != null && '$value'.trim().isNotEmpty)
                            .map((value) => '$value')
                            .join(' · ')
                        : '$row',
                    style: const TextStyle(
                      fontSize: 14,
                      height: 1.4,
                      color: AppColors.charcoalInk,
                    ),
                  ),
                ),
              ],
            ),
          ),
      ];
    }

    return [
      Text('$answer', style: const TextStyle(fontSize: 14, color: AppColors.charcoalInk)),
    ];
  }
}

class Helpline {
  const Helpline({
    required this.key,
    required this.name,
    required this.description,
    required this.phone,
    required this.display,
  });

  final String key;
  final String name;
  final String description;
  final String phone;
  final String display;
}

class SafetyPlanPart {
  const SafetyPlanPart({required this.id, required this.prompt});

  final String id;
  final String prompt;
}

class SafetyPlan {
  const SafetyPlan({
    required this.intro,
    required this.parts,
    required this.answers,
    required this.therapistContact,
    required this.helplines,
  });

  final String? intro;
  final List<SafetyPlanPart> parts;
  final Map<String, Object?> answers;
  final String? therapistContact;
  final List<Helpline> helplines;
}

/// The plan, or null when the therapist has not made one yet.
///
/// A 404 is the normal "not created" answer, not a failure: the Library card is
/// hidden until a plan exists, and the crisis screen's link only appears when
/// this returns one.
final safetyPlanProvider = FutureProvider<SafetyPlan?>((ref) async {
  final dio = ref.watch(dioClientProvider);
  try {
    final res = await dio.get<Map<String, dynamic>>('/safety-plan');
    final body = res.data!;
    final parts = (body['parts'] as List? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map((part) => SafetyPlanPart(
              id: part['id'] as String,
              prompt: part['prompt'] as String,
            ))
        .toList();
    final helplines = (body['helplines'] as List? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map((line) => Helpline(
              key: line['key'] as String,
              name: line['name'] as String,
              description: line['description'] as String,
              phone: line['phone'] as String,
              display: line['display'] as String,
            ))
        .toList();

    return SafetyPlan(
      intro: body['intro'] as String?,
      parts: parts,
      answers: (body['answers'] as Map?)?.cast<String, Object?>() ?? const {},
      therapistContact: body['therapistContact'] as String?,
      helplines: helplines,
    );
  } on DioException catch (error) {
    if (error.response?.statusCode == 404) return null;
    rethrow;
  }
});
