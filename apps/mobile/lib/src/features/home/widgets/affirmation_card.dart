import 'package:flutter/material.dart';

class AffirmationCard extends StatelessWidget {
  const AffirmationCard({super.key});

  static const List<String> _affirmations = [
    "What you're feeling right now is real, and it's okay.",
    "You don't have to have everything figured out today.",
    "Small steps count. You showed up — that matters.",
    "You are allowed to rest. Rest is not giving up.",
    "The fact that you're here means you're trying. That's enough.",
    "Your feelings are not a burden. They are information.",
    "It's okay if today is hard. Hard days don't last forever.",
    "You have handled difficult things before. You have that in you.",
    "Progress doesn't always look like progress. It still is.",
    "You don't have to be okay all the time.",
    "Taking care of yourself is not selfish. It's necessary.",
    "You are more than your productivity or your grades.",
    "It's okay to ask for what you need.",
    "Your worth is not tied to how much you achieve.",
    "Feeling overwhelmed doesn't mean you're failing. It means you're human.",
    "One conversation at a time. One breath at a time.",
    "You deserve support — not just when things are bad, but always.",
    "Being vulnerable takes courage. You are braver than you know.",
    "You don't have to explain your feelings to anyone.",
    "The pressure you feel is real. And you are still here.",
    "It's okay if your pace is slower than others.",
    "Your feelings about your family, your future, your life — they are valid.",
    "You are not alone in this, even when it feels that way.",
    "Rest before you are exhausted. Breathe before you are overwhelmed.",
    "Uncertainty is not failure. It is part of being alive.",
    "You can hold both — the difficulty and the hope.",
    "There is no timeline you have to follow but your own.",
    "Being kind to yourself is a practice, not a destination.",
    "You noticed how you were feeling. That awareness matters.",
    "Today, you don't have to solve everything. Just stay with it.",
  ];

  @override
  Widget build(BuildContext context) {
    final index = DateTime.now()
            .difference(DateTime(2026, 1, 1))
            .inDays %
        _affirmations.length;
    final affirmation = _affirmations[index];

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFE8F5EE),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: const Color(0x331A6B5A),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Text(
                '\u2728',
                style: TextStyle(fontSize: 14),
              ),
              SizedBox(width: 6),
              Text(
                'Today',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: Color(0xFF1A6B5A),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            affirmation,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w400,
              height: 1.5,
              color: Color(0xFF1A1A1A),
            ),
          ),
        ],
      ),
    );
  }
}