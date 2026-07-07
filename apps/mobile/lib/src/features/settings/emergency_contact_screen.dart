import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'emergency_contact_notifier.dart';

class EmergencyContactScreen extends ConsumerStatefulWidget {
  const EmergencyContactScreen({super.key});

  @override
  ConsumerState<EmergencyContactScreen> createState() =>
      _EmergencyContactScreenState();
}

class _EmergencyContactScreenState
    extends ConsumerState<EmergencyContactScreen> {
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  bool _initialized = false;

  bool get _hasChanges =>
      _nameController.text.isNotEmpty || _phoneController.text.isNotEmpty;

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  void _populateFields(EmergencyContactState state) {
    if (_initialized) return;
    _initialized = true;
    if (state.hasContact) {
      _nameController.text = state.name ?? '';
      _phoneController.text = state.phone ?? '';
    }
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    final phone = _phoneController.text.trim();

    if (name.isEmpty && phone.isEmpty) {
      await ref
          .read(emergencyContactProvider.notifier)
          .clearEmergencyContact();
      return;
    }

    if (phone.isNotEmpty && !_isValidPhone(phone)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Phone must be in international format (e.g. +1234567890)',
          ),
        ),
      );
      return;
    }

    await ref
        .read(emergencyContactProvider.notifier)
        .saveEmergencyContact(name, phone);
  }

  bool _isValidPhone(String phone) {
    final regex = RegExp(r'^\+[1-9]\d{6,14}$');
    return regex.hasMatch(phone);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(emergencyContactProvider);
    _populateFields(state);

    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Emergency Contact')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Emergency Contact',
                style: theme.textTheme.headlineMedium,
              ),
              const SizedBox(height: 8),
              Text(
                'Optionally provide a contact to reach in an emergency. '
                'This information is encrypted and stored securely.',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 24),
              TextField(
                controller: _nameController,
                decoration: const InputDecoration(
                  labelText: 'Name (Optional)',
                  hintText: 'Full name',
                  border: OutlineInputBorder(),
                ),
                textCapitalization: TextCapitalization.words,
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _phoneController,
                decoration: const InputDecoration(
                  labelText: 'Phone (Optional)',
                  hintText: '+1234567890',
                  border: OutlineInputBorder(),
                ),
                keyboardType: TextInputType.phone,
              ),
              if (state.error != null) ...[
                const SizedBox(height: 16),
                Text(
                  state.error!,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.error,
                  ),
                ),
              ],
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed:
                      state.isSaving || (!_hasChanges && !state.hasContact)
                          ? null
                          : _save,
                  child: state.isSaving
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Text('Save'),
                ),
              ),
              if (state.hasContact) ...[
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    onPressed: state.isSaving
                        ? null
                        : () async {
                            await ref
                                .read(emergencyContactProvider.notifier)
                                .clearEmergencyContact();
                            _nameController.clear();
                            _phoneController.clear();
                            _initialized = false;
                          },
                    style: OutlinedButton.styleFrom(
                      foregroundColor: theme.colorScheme.error,
                    ),
                    child: const Text('Clear'),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}