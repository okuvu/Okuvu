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
                    // E17-S7 rev 6 §4.12 — her text, in full. The line stays at
                    // 18 and the stop is hard: the pilot is neither designed nor
                    // consented for minors, and DPDP requires verifiable parental
                    // consent for under-18s. "yet" is gone — the old heading
                    // ("OKUVU isn't available for under-18s yet") read to a
                    // 16-year-old as a roadmap item — and 1098 is added, the one
                    // number on this screen that is for the person reading it.
                    // The full five-line block does not appear here: item 12 of
                    // the record gives this screen its own text, which is the
                    // more specific instruction (rev 6 §8.1 item 1).
                    const Text(
                      'OKUVU is for adults aged 18 and over.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w600,
                        color: AppColors.charcoalInk,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'If you need to talk to someone today, these people can help:',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 15,
                        color: AppColors.inkSoft,
                        height: 22 / 15,
                      ),
                    ),
                    const SizedBox(height: 24),
                    const _ResourceCard(
                      name: 'Tele-MANAS',
                      description: 'free, 24 hours, for all ages',
                      phone: '14416',
                    ),
                    const SizedBox(height: 8),
                    const _ResourceCard(
                      name: 'Child Helpline',
                      description: 'For children and young people',
                      phone: '1098',
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'If you are in danger right now, call 112.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: AppColors.charcoalInk,
                        height: 22 / 15,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'It can also help to talk to a parent, teacher or another adult you trust.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 15,
                        color: AppColors.inkSoft,
                        height: 22 / 15,
                      ),
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

  const _ResourceCard({
    required this.name,
    required this.description,
    required this.phone,
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
                      phone,
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
