import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/providers.dart';
import '../../theme/app_colors.dart';

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
                            // E17-S7 — the clinical lead's corrected helpline list,
                            // signed 31 Oct 2026. Same order, names, numbers and iCall
                            // hours as HELPLINE_INLINE and the S4 card in
                            // apps/api/src/pipeline/fallbacks.ts: Tele-MANAS first
                            // because iCall is not 24×7, iCall last with its hours
                            // stated, Sneha (not "Snehi"), and the retired Vandrevala
                            // number 1860-2662-345 gone. 112 is kept as the emergency
                            // number: her list does not include it, and removing the
                            // ambulance number from a crisis screen is a decision for
                            // her, not for this change — it is an open question in
                            // evidence/E17-S7.md.
                            //
                            // Descriptions state only what is known. Vandrevala carries
                            // no hours claim because her list does not give one; iCall's
                            // hours are the ones she wrote, and the exact hours are her
                            // own open question (TISS's page says 10 am–8 pm).
                            _ResourceCard(
                              name: 'Tele-MANAS',
                              description: 'Toll-free national helpline, 24×7.',
                              phone: '14416',
                            ),
                            SizedBox(height: 8),
                            _ResourceCard(
                              name: 'Vandrevala Foundation',
                              description: 'Crisis intervention and mental health support.',
                              phone: '919999666555',
                              displayPhone: '+91 9999666555',
                            ),
                            SizedBox(height: 8),
                            _ResourceCard(
                              name: 'Sneha, Chennai',
                              description: 'Emotional and mental health support.',
                              phone: '04424640050',
                              displayPhone: '044-24640050',
                            ),
                            SizedBox(height: 8),
                            _ResourceCard(
                              name: 'iCall (TISS)',
                              description: 'Mon–Sat, 8 am–9 pm. Not 24×7.',
                              phone: '9152987821',
                            ),
                            SizedBox(height: 8),
                            _ResourceCard(
                              name: 'Emergency Services',
                              description: 'Ambulance, police and fire.',
                              phone: '112',
                            ),
                          ],
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
                        child: Text(
                          "Your next session with OKUVU will be here when you're ready.",
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.7),
                            fontSize: 13,
                            fontStyle: FontStyle.italic,
                          ),
                        ),
                      ),
                      // A deliberate, low-key way out — not a prominent CTA,
                      // since dialing a helpline should read as the primary
                      // action. hide() was previously dead code: nothing
                      // called it, so once shown this screen could not be
                      // dismissed short of logging out.
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
                            "I'm safe for now",
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
