import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

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
  bool _isEditing = false;

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

  bool get _hasChanges =>
      _nameController.text.trim().isNotEmpty ||
      _phoneController.text.trim().isNotEmpty;

  Future<void> _save() async {
    final name = _nameController.text.trim();
    final phone = _phoneController.text.trim();

    if (name.isEmpty && phone.isEmpty) {
      await ref.read(emergencyContactProvider.notifier).clearEmergencyContact();
      if (mounted) {
        setState(() => _isEditing = false);
      }
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
    if (mounted) {
      setState(() => _isEditing = false);
    }
  }

  bool _isValidPhone(String phone) {
    final regex = RegExp(r'^\+[1-9]\d{6,14}$');
    return regex.hasMatch(phone);
  }

  String _maskPhone(String phone) {
    if (phone.length < 5) return phone;
    final lastThree = phone.substring(phone.length - 3);
    final prefix = phone.substring(0, phone.length - 3);
    return '${prefix.substring(0, 1)}${'*' * (prefix.length - 1)}$lastThree';
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(emergencyContactProvider);
    _populateFields(state);

    final theme = Theme.of(context);

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) context.go('/settings');
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => context.go('/settings'),
          ),
          title: const Text('Emergency Contact'),
        ),
        body: state.isLoading
            ? const Center(child: CircularProgressIndicator())
            : SafeArea(
                child: state.hasContact && !_isEditing
                    ? _buildFilledState(theme, state)
                    : _buildEmptyState(theme, state),
              ),
      ),
    );
  }

  Widget _buildEmptyState(ThemeData theme, EmergencyContactState state) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: double.infinity,
            decoration: BoxDecoration(
              color: theme.colorScheme.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border(
                left: const BorderSide(
                  color: Color(0xFF1A6B5A),
                  width: 4,
                ),
                top: BorderSide(color: theme.colorScheme.outlineVariant),
                right: BorderSide(color: theme.colorScheme.outlineVariant),
                bottom: BorderSide(color: theme.colorScheme.outlineVariant),
              ),
            ),
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Emergency Contact',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Optionally provide a contact to reach in an emergency. '
                  'This information is encrypted and stored securely.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          TextField(
            controller: _nameController,
            decoration: const InputDecoration(
              labelText: 'Name',
              hintText: 'Full name',
              border: OutlineInputBorder(),
            ),
            textCapitalization: TextCapitalization.words,
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _phoneController,
            decoration: const InputDecoration(
              labelText: 'Phone',
              hintText: '+1234567890',
              border: OutlineInputBorder(),
            ),
            keyboardType: TextInputType.phone,
          ),
          const SizedBox(height: 8),
          Text(
            'Their number is encrypted and stored securely. We never contact them without your knowledge.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: const Color(0xFF6B6B6B),
              fontSize: 12,
            ),
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
        ],
      ),
    );
  }

  Widget _buildFilledState(ThemeData theme, EmergencyContactState state) {
    final maskedPhone =
        state.phone != null ? _maskPhone(state.phone!) : '';

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: double.infinity,
            decoration: BoxDecoration(
              color: theme.colorScheme.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border(
                left: const BorderSide(
                  color: Color(0xFF1A6B5A),
                  width: 4,
                ),
                top: BorderSide(color: theme.colorScheme.outlineVariant),
                right: BorderSide(color: theme.colorScheme.outlineVariant),
                bottom: BorderSide(color: theme.colorScheme.outlineVariant),
              ),
            ),
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Emergency Contact',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'This information is encrypted and stored securely.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          if (state.name != null) ...[
            Text(
              'Name',
              style: theme.textTheme.labelMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              state.name!,
              style: theme.textTheme.bodyLarge,
            ),
            const SizedBox(height: 16),
          ],
          Text(
            'Phone',
            style: theme.textTheme.labelMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            maskedPhone,
            style: theme.textTheme.bodyLarge,
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
              onPressed: () {
                setState(() => _isEditing = true);
              },
              child: const Text('Edit'),
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
                        if (mounted) {
                          _nameController.clear();
                          _phoneController.clear();
                          _initialized = false;
                          setState(() => _isEditing = false);
                        }
                      },
                style: OutlinedButton.styleFrom(
                  foregroundColor: theme.colorScheme.error,
                ),
                child: const Text('Remove Contact'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
