//
// The screen for a client who says they want to hurt someone else.
//
// The words are NOT written here. They arrive from the api as data
// (`apps/api/src/lib/harm-to-someone.ts`, the owner-approved copy of 24 Nov
// 2026) and this widget only lays them out. That is deliberate: the copy is
// clinical content that needs a signature, and a second copy in Dart would be a
// second set of words nobody signed — the drift would only ever be noticed on
// the screen a person in the worst moment reads.
//
// What the layout must keep, because the copy depends on it:
//
//  - **112 is a tappable call, above everything else.** The sentence says "call
//    112 now"; a number in a paragraph is not a call action.
//  - **Vandrevala comes after it**, offered to the person who is frightened
//    rather than in the act — never presented as the first thing to do.
//  - **The safety plan is one tap away** and sits under the alert line, because
//    it is the thing they already made with their therapist.
//  - **The therapist line says what happened** ("has been told this is urgent")
//    and never how fast anyone will answer.
//
// If the screen cannot be rendered (an old api, a malformed body), the caller
// shows the ordinary help card instead — a screen that is missing is survivable,
// a screen showing half the copy is not.
//

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../theme/app_colors.dart';
import 'safety_plan_screen.dart';

/// One resource row: name, one line about it, and the number to dial.
class HarmToSomeoneResource {
  const HarmToSomeoneResource({
    required this.label,
    required this.description,
    required this.number,
    required this.display,
  });

  final String label;
  final String description;
  final String number;
  final String display;

  static HarmToSomeoneResource? fromJson(dynamic raw) {
    if (raw is! Map) return null;
    final label = raw['label'];
    final number = raw['number'];
    final display = raw['display'];
    if (label is! String || number is! String || display is! String) return null;
    return HarmToSomeoneResource(
      label: label,
      description: (raw['description'] as String?) ?? '',
      number: number,
      display: display,
    );
  }
}

/// The approved screen, as the api serves it.
class HarmToSomeoneScreen {
  const HarmToSomeoneScreen({
    required this.paragraphs,
    required this.emergency,
    required this.resources,
    required this.alert,
    required this.planLabel,
    required this.closing,
  });

  final List<String> paragraphs;
  final HarmToSomeoneResource emergency;
  final List<HarmToSomeoneResource> resources;
  final String alert;
  final String planLabel;
  final String closing;

  /// Null when the body is not the shape this screen needs — the caller then
  /// falls back to the ordinary help card rather than rendering a fragment.
  static HarmToSomeoneScreen? fromJson(dynamic raw) {
    if (raw is! Map) return null;
    if (raw['kind'] != 'harm_to_someone') return null;

    final rawParagraphs = raw['paragraphs'];
    final paragraphs = rawParagraphs is List
        ? rawParagraphs.whereType<String>().where((p) => p.trim().isNotEmpty).toList()
        : const <String>[];
    final emergency = HarmToSomeoneResource.fromJson(raw['emergency']);
    final alert = raw['alert'];
    final planLabel = raw['plan_label'];
    final closing = raw['closing'];

    if (paragraphs.isEmpty || emergency == null) return null;
    if (alert is! String || planLabel is! String || closing is! String) return null;

    final rawResources = raw['resources'];
    final resources = rawResources is List
        ? rawResources
            .map(HarmToSomeoneResource.fromJson)
            .whereType<HarmToSomeoneResource>()
            .toList()
        : const <HarmToSomeoneResource>[];

    return HarmToSomeoneScreen(
      paragraphs: paragraphs,
      emergency: emergency,
      resources: resources,
      alert: alert,
      planLabel: planLabel,
      closing: closing,
    );
  }
}

/// Holds the screen when the api hands one back. Null means "not showing".
class HarmToSomeoneOverlayNotifier extends Notifier<HarmToSomeoneScreen?> {
  @override
  HarmToSomeoneScreen? build() => null;

  void show(HarmToSomeoneScreen screen) => state = screen;
  void hide() => state = null;
}

final harmToSomeoneOverlayProvider =
    NotifierProvider<HarmToSomeoneOverlayNotifier, HarmToSomeoneScreen?>(
  HarmToSomeoneOverlayNotifier.new,
);

class HarmToSomeoneOverlay extends ConsumerWidget {
  const HarmToSomeoneOverlay({super.key, required this.screen});

  final HarmToSomeoneScreen screen;

  Future<void> _call(BuildContext context, String number) async {
    final uri = Uri(scheme: 'tel', path: number);
    final ok = await launchUrl(uri);
    if (!ok && context.mounted) {
      // Never an infrastructure apology: the number is on the screen above.
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Call ${screen.emergency.display} on your phone.')),
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark,
      child: PopScope(
        canPop: false,
        child: Scaffold(
          backgroundColor: AppColors.crisisTint,
          body: SafeArea(
            child: Center(
              child: SingleChildScrollView(
                child: Container(
                  constraints: const BoxConstraints(maxWidth: 390),
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (final paragraph in screen.paragraphs) ...[
                        Text(
                          paragraph,
                          style: const TextStyle(
                            fontSize: 15,
                            height: 1.45,
                            color: AppColors.charcoalInk,
                          ),
                        ),
                        const SizedBox(height: 14),
                      ],
                      _ResourceRow(
                        key: const Key('harm_emergency_row'),
                        resource: screen.emergency,
                        onCall: () => _call(context, screen.emergency.number),
                        emphasised: true,
                      ),
                      for (final resource in screen.resources) ...[
                        const SizedBox(height: 8),
                        _ResourceRow(
                          resource: resource,
                          onCall: () => _call(context, resource.number),
                          emphasised: false,
                        ),
                      ],
                      const SizedBox(height: 16),
                      Text(
                        screen.alert,
                        style: const TextStyle(
                          fontSize: 14,
                          height: 1.45,
                          fontWeight: FontWeight.w600,
                          color: AppColors.charcoalInk,
                        ),
                      ),
                      const SizedBox(height: 16),
                      // One tap to the plan they made with their therapist. Only
                      // rendered when a plan exists, exactly as the crisis card
                      // does: a button that opens an empty screen is a dead end
                      // offered at the worst moment.
                      Builder(
                        builder: (context) {
                          final plan = ref.watch(safetyPlanProvider).asData?.value;
                          if (plan == null) return const SizedBox.shrink();
                          return FilledButton(
                            key: const Key('harm_safety_plan'),
                            style: FilledButton.styleFrom(
                              backgroundColor: AppColors.royalPurple,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                            ),
                            onPressed: () {
                              ref.read(harmToSomeoneOverlayProvider.notifier).hide();
                              context.push('/safety-plan');
                            },
                            child: Text(screen.planLabel),
                          );
                        },
                      ),
                      const SizedBox(height: 16),
                      Text(
                        screen.closing,
                        style: const TextStyle(
                          fontSize: 13,
                          height: 1.4,
                          color: AppColors.inkSoft,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextButton(
                        key: const Key('harm_close'),
                        onPressed: () =>
                            ref.read(harmToSomeoneOverlayProvider.notifier).hide(),
                        child: const Text('Close'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ResourceRow extends StatelessWidget {
  const _ResourceRow({
    super.key,
    required this.resource,
    required this.onCall,
    required this.emphasised,
  });

  final HarmToSomeoneResource resource;
  final VoidCallback onCall;
  final bool emphasised;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: emphasised ? AppColors.crisis : AppColors.oatElevated,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onCall,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      resource.label,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: emphasised ? Colors.white : AppColors.charcoalInk,
                      ),
                    ),
                    if (resource.description.isNotEmpty)
                      Text(
                        resource.description,
                        style: TextStyle(
                          fontSize: 12,
                          color: emphasised ? Colors.white70 : AppColors.inkSoft,
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Text(
                resource.display,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: emphasised ? Colors.white : AppColors.royalPurple,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
