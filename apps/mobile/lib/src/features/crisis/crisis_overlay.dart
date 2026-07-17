import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

class CrisisOverlay extends StatelessWidget {
  const CrisisOverlay({super.key});

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: PopScope(
        canPop: false,
        child: Scaffold(
          backgroundColor: const Color(0xFFBA1A1A),
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
                            _ResourceCard(
                              name: 'iCall (IIT Bombay)',
                              description: 'Psychosocial helpline for individuals in distress.',
                              phone: '9152987821',
                            ),
                            SizedBox(height: 8),
                            _ResourceCard(
                              name: 'Vandrevala Foundation',
                              description: '24x7 crisis intervention and mental health support.',
                              phone: '18602662345',
                              displayPhone: '1860-2662-345',
                            ),
                            SizedBox(height: 8),
                            _ResourceCard(
                              name: 'NIMHANS',
                              description: 'Mental health services and emergency support.',
                              phone: '08046110007',
                              displayPhone: '080-46110007',
                            ),
                            SizedBox(height: 8),
                            _ResourceCard(
                              name: 'Snehi',
                              description: 'Support for emotional and mental health issues.',
                              phone: '04424640050',
                              displayPhone: '044-24640050',
                            ),
                            SizedBox(height: 8),
                            _ResourceCard(
                              name: 'Emergency Services',
                              description: 'Immediate assistance from emergency responders.',
                              phone: '112',
                            ),
                          ],
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                        child: Text(
                          "Your next session with Evia will be here when you're ready.",
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.7),
                            fontSize: 13,
                            fontStyle: FontStyle.italic,
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
            Icons.shield,
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
                        color: Color(0xFF181C1B),
                        height: 20 / 15,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      description,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12,
                        color: Color(0xFF3F4945),
                        height: 16 / 12,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      displayPhone ?? phone,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                        color: Color(0xFF005243),
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
                color: const Color(0xFF005243),
                borderRadius: BorderRadius.circular(22),
                child: InkWell(
                  borderRadius: BorderRadius.circular(22),
                  onTap: _call,
                  child: const Icon(
                    Icons.call,
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
