import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers.dart';
import '../../theme/app_colors.dart';
import '../library/safety_plan_screen.dart';

class CrisisOverlay extends ConsumerWidget {
  const CrisisOverlay({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: PopScope(
        canPop: false,
        child: Scaffold(
          backgroundColor: AppColors.crisis,
          body: SafeArea(
            child: Center(
              child: SingleChildScrollView(
                child: Container(
                  constraints: const BoxConstraints(maxWidth: 390),
                  child: Column(
                    children: [
                      const SizedBox(height: 24),
                      const _HeaderSection(),
                      const SizedBox(height: 20),
                      const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 20),
                        child: Column(
                          children: [
                            // E17-S7 rev 6 §2 — the final five-line block, in her
                            // order, with her descriptions. Same names, numbers,
                            // format and hours as HELPLINE_BLOCK and the S4 card in
                            // apps/api/src/pipeline/fallbacks.ts. Two 24-hour lines
                            // lead, 112 sits third rather than last, SNEHA is
                            // fourth, iCall last because it is not a 24-hour
                            // service. NIMHANS (080-46110007) is retired by clinical
                            // decision, 1 November 2026; the 1860-2662-345
                            // Vandrevala number stays retired.
                            //
                            // The descriptions are her parentheticals, verbatim.
                            // 112 carries the one description she did not write
                            // ("Ambulance, police and fire") because the line she
                            // supplied is the name and number only.
                            _ResourceCard(
                              name: 'Tele-MANAS',
                              description: 'free, 24 hours',
                              phone: '14416',
                            ),
                            SizedBox(height: 8),
                            _ResourceCard(
                              name: 'Vandrevala Foundation',
                              description: '24 hours, call or WhatsApp',
                              phone: '+919999666555',
                              displayPhone: '+91 9999 666 555',
                            ),
                            SizedBox(height: 8),
                            _ResourceCard(
                              name: 'Emergency services',
                              description: 'Ambulance, police and fire.',
                              phone: '112',
                            ),
                            SizedBox(height: 8),
                            _ResourceCard(
                              name: 'SNEHA, Chennai',
                              description: '10am-10pm, every day',
                              phone: '04424640050',
                              displayPhone: '044-24640050',
                            ),
                            SizedBox(height: 8),
                            _ResourceCard(
                              name: 'iCall (TISS)',
                              description: 'Monday to Saturday, 10am-8pm',
                              phone: '9152987821',
                            ),
                          ],
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
                        child: Text(
                          "You can come back to OKUVU whenever you're ready.",
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.7),
                            fontSize: 13,
                            fontStyle: FontStyle.italic,
                          ),
                        ),
                      ),
                      // One tap to the plan they made with their therapist.
                      // Only rendered when a plan exists: the provider answers
                      // null for "not created yet", and an empty link on a
                      // crisis screen is a dead end at the worst moment.
                      Consumer(
                        builder: (context, ref, _) {
                          final plan = ref.watch(safetyPlanProvider).asData?.value;
                          if (plan == null) return const SizedBox.shrink();
                          return Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: TextButton.icon(
                              key: const Key('crisisSafetyPlanButton'),
                              onPressed: () {
                                ref.read(crisisOverlayProvider.notifier).hide();
                                context.push('/safety-plan');
                              },
                              icon: const Icon(LucideIcons.bookOpen, size: 16),
                              label: const Text(
                                'My plan for hard moments',
                                style: TextStyle(fontSize: 14),
                              ),
                              style: TextButton.styleFrom(foregroundColor: Colors.white),
                            ),
                          );
                        },
                      ),
                      // A deliberate, low-key way out — not a prominent CTA,
                      // since dialing a helpline should read as the primary
                      // action.
                      //
                      // E17-S7 rev 6 §4.11: the label is "Close". It used to read
                      // "I'm safe for now", which made the screen require a person
                      // in crisis to certify their own safety before it would let
                      // them leave. "Close" removes the certification entirely.
                      Padding(
                        padding: const EdgeInsets.only(bottom: 16),
                        child: TextButton(
                          key: const Key('crisisOverlayDismissButton'),
                          onPressed: () =>
                              ref.read(crisisOverlayProvider.notifier).hide(),
                          style: TextButton.styleFrom(
                            foregroundColor: Colors.white.withValues(alpha: 0.6),
                          ),
                          child: const Text(
                            "Close",
                            style: TextStyle(
                              fontSize: 13,
                              decoration: TextDecoration.underline,
                            ),
                          ),
                        ),
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

class _HeaderSection extends StatelessWidget {
  const _HeaderSection();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.1),
            shape: BoxShape.circle,
          ),
          child: const Icon(
            LucideIcons.shield,
            key: Key('crisisOverlayShieldIcon'),
            size: 48,
            color: Colors.white,
          ),
        ),
        const SizedBox(height: 24),
        const Text(
          "You're not alone.",
          style: TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.w600,
            color: Colors.white,
            letterSpacing: -0.56,
            height: 36 / 28,
          ),
        ),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Text(
            'Here are some people you can call right now.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 16,
              color: Colors.white.withValues(alpha: 0.9),
              height: 24 / 16,
            ),
          ),
        ),
      ],
    );
  }
}

class _ResourceCard extends StatelessWidget {
  final String name;
  final String description;
  final String phone;
  final String? displayPhone;

  const _ResourceCard({
    required this.name,
    required this.description,
    required this.phone,
    this.displayPhone,
  });

  Future<void> _call() async {
    final uri = Uri(scheme: 'tel', path: phone);
    try {
      await launchUrl(uri);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.12),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Expanded(
              child: Padding(
                padding: const EdgeInsets.only(right: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      name,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: AppColors.charcoalInk,
                        height: 20 / 15,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      description,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.charcoalInk,
                        height: 16 / 12,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      displayPhone ?? phone,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                        color: AppColors.royalPurple,
                        height: 14 / 11,
                        letterSpacing: 0.2,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            SizedBox(
              width: 44,
              height: 44,
              child: Material(
                color: AppColors.royalPurple,
                borderRadius: BorderRadius.circular(22),
                child: InkWell(
                  borderRadius: BorderRadius.circular(22),
                  onTap: _call,
                  child: const Icon(
                    LucideIcons.phoneCall,
                    color: Colors.white,
                    size: 22,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
