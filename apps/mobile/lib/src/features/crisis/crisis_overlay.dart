import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

class CrisisOverlay extends StatelessWidget {
  const CrisisOverlay({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.white,
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          child: SingleChildScrollView(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.start,
              children: [
                Icon(Icons.emergency,
                    size: 40, color: Theme.of(context).colorScheme.error),
                const SizedBox(height: 12),
                Text(
                  'Crisis Support',
                  style: Theme.of(context).textTheme.headlineSmall,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                const Text(
                  "If you're in immediate danger, please call emergency services.",
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                const _ResourceTile(
                  name: 'iCall (IIT Bombay)',
                  phone: '9152987821',
                ),
                const _ResourceTile(
                  name: 'Vandrevala Foundation',
                  phone: '18602662345',
                ),
                const _ResourceTile(
                  name: 'NIMHANS',
                  phone: '08046110007',
                ),
                const _ResourceTile(
                  name: 'Snehi',
                  phone: '04424640050',
                ),
                const _ResourceTile(
                  name: 'Emergency Services',
                  phone: '112',
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ResourceTile extends StatelessWidget {
  final String name;
  final String phone;

  const _ResourceTile({required this.name, required this.phone});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Material(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: () async {
            final uri = Uri(scheme: 'tel', path: phone);
            try {
              await launchUrl(uri);
            } catch (_) {}
          },
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(
              children: [
                Expanded(
                  child: Text(name),
                ),
                Text(
                  phone,
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
