import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../theme/app_colors.dart';

/// S3-stop — a hard, dead-end block for under-18 signups. Deliberately no
/// "continue" affordance: the wireframe treats this as a stop, not a step.
class AgeBlockedScreen extends StatelessWidget {
  const AgeBlockedScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: Colors.white,
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              child: Container(
                constraints: const BoxConstraints(maxWidth: 390),
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
                child: Column(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: const BoxDecoration(
                        color: AppColors.lavenderTint,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        LucideIcons.shield,
                        size: 48,
                        color: AppColors.royalPurple,
                      ),
                    ),
                    const SizedBox(height: 24),
                    const Text(
                      "OKUVU isn't available for under-18s yet",
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w600,
                        color: AppColors.charcoalInk,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      "We're not able to create an account for you right now. If you need to talk to someone today, here are people who can help.",
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 15,
                        color: AppColors.inkSoft,
                        height: 22 / 15,
                      ),
                    ),
                    const SizedBox(height: 24),
                    // E17-S7 — same corrected list, order and names as
                    // crisis_overlay.dart and HELPLINE_INLINE in
                    // apps/api/src/pipeline/fallbacks.ts. This screen is served to
                    // someone we cannot help at all, so the numbers here must not
                    // disagree with the ones the crisis card names.
                    const _ResourceCard(
                      name: 'Tele-MANAS',
                      description: 'Toll-free national helpline, 24×7.',
                      phone: '14416',
                    ),
                    const SizedBox(height: 8),
                    const _ResourceCard(
                      name: 'Vandrevala Foundation',
                      description: 'Crisis intervention and mental health support.',
                      phone: '919999666555',
                      displayPhone: '+91 9999666555',
                    ),
                    const SizedBox(height: 8),
                    const _ResourceCard(
                      name: 'Sneha, Chennai',
                      description: 'Emotional and mental health support.',
                      phone: '04424640050',
                      displayPhone: '044-24640050',
                    ),
                    const SizedBox(height: 8),
                    const _ResourceCard(
                      name: 'iCall (TISS)',
                      description: 'Mon–Sat, 8 am–9 pm. Not 24×7.',
                      phone: '9152987821',
                    ),
                    const SizedBox(height: 8),
                    const _ResourceCard(
                      name: 'Emergency Services',
                      description: 'Ambulance, police and fire.',
                      phone: '112',
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
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
        border: Border.all(color: AppColors.hairline),
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
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      description,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12, color: AppColors.inkSoft),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      displayPhone ?? phone,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                        color: AppColors.royalPurple,
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
                  child: const Icon(LucideIcons.phoneCall, color: Colors.white, size: 22),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
