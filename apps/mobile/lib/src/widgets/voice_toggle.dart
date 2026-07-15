import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/providers.dart';

class VoiceToggle extends ConsumerStatefulWidget {
  const VoiceToggle({super.key});

  @override
  ConsumerState<VoiceToggle> createState() => _VoiceToggleState();
}

class _VoiceToggleState extends ConsumerState<VoiceToggle> {
  bool _isLanguageAvailable = false;
  bool _isLoadingLanguageCheck = true;

  @override
  void initState() {
    super.initState();
    _checkLanguageAvailability();
  }

  Future<void> _checkLanguageAvailability() async {
    final ttsService = ref.read(ttsServiceProvider);
    final available = await ttsService.isLanguageAvailable();

    if (mounted) {
      setState(() {
        _isLanguageAvailable = available;
        _isLoadingLanguageCheck = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final voiceSettings = ref.watch(voiceSettingsStateProvider);

    if (_isLoadingLanguageCheck) {
      return const SizedBox.shrink();
    }

    if (!_isLanguageAvailable) {
      return const SizedBox.shrink();
    }

    if (voiceSettings.isLoading) {
      return const ListTile(
        leading: Icon(Icons.volume_up),
        title: Text('Voice'),
        trailing: SizedBox(
          width: 24,
          height: 24,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    }

    return SwitchListTile(
      secondary: const Icon(Icons.volume_up),
      title: const Text('Voice'),
      subtitle: const Text('Read messages aloud'),
      value: voiceSettings.voiceEnabled,
      onChanged: (value) => _toggleVoice(value),
      activeThumbColor: const Color(0xFF1A6B5A),
      inactiveTrackColor: const Color(0xFFC4C0BC),
    );
  }

  Future<void> _toggleVoice(bool value) async {
    final voiceNotifier = ref.read(voiceSettingsProvider.notifier);
    final ttsService = ref.read(ttsServiceProvider);

    await voiceNotifier.toggleVoice(value);
    await ttsService.setVoiceEnabled(value);
  }
}
