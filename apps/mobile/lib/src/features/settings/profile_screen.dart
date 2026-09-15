import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../widgets/okuvu_app_bar_title.dart';
import '../../theme/app_colors.dart';
import 'profile_provider.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final _fullNameController = TextEditingController();
  final _genderController = TextEditingController();
  DateTime? _dateOfBirth;
  bool _prefilled = false;
  bool _isSaving = false;
  String? _email;

  @override
  void dispose() {
    _fullNameController.dispose();
    _genderController.dispose();
    super.dispose();
  }

  void _prefill(ProfileInfo info) {
    if (_prefilled) return;
    _fullNameController.text = info.fullName ?? '';
    _genderController.text = info.gender ?? '';
    _dateOfBirth = info.dateOfBirth;
    _email = info.email;
    _prefilled = true;
  }

  Future<void> _pickDateOfBirth() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _dateOfBirth ?? DateTime(now.year - 18, now.month, now.day),
      firstDate: DateTime(now.year - 100),
      lastDate: now,
    );
    if (picked != null) setState(() => _dateOfBirth = picked);
  }

  Future<void> _save() async {
    setState(() => _isSaving = true);
    final success = await ref.read(profileSaveProvider.notifier).save(
          fullName: _fullNameController.text.trim().isEmpty
              ? null
              : _fullNameController.text.trim(),
          dateOfBirth: _dateOfBirth,
          gender: _genderController.text.trim().isEmpty
              ? null
              : _genderController.text.trim(),
        );
    if (!mounted) return;
    setState(() => _isSaving = false);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(success ? 'Profile saved' : "Couldn't save. Please try again."),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final profileAsync = ref.watch(profileInfoProvider);
    final theme = Theme.of(context);

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) context.go('/settings');
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(LucideIcons.arrowLeft),
            onPressed: () => context.go('/settings'),
          ),
          title: const OkuvuAppBarTitle('Profile'),
        ),
        body: profileAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, __) => Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text("Couldn't load your profile.", style: theme.textTheme.bodyMedium),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () => ref.invalidate(profileInfoProvider),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
          data: (info) {
            _prefill(info);
            return SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Icon(LucideIcons.user, size: 56, color: theme.colorScheme.primary),
                  ),
                  const SizedBox(height: 24),
                  Text('Full name', style: theme.textTheme.titleSmall),
                  const SizedBox(height: 8),
                  TextField(
                    key: const ValueKey('profile_full_name_input'),
                    controller: _fullNameController,
                    enabled: !_isSaving,
                    decoration: const InputDecoration(hintText: 'Your name'),
                  ),
                  const SizedBox(height: 20),
                  Text('Email', style: theme.textTheme.titleSmall),
                  const SizedBox(height: 8),
                  Text(
                    _email ?? 'Not set',
                    style: const TextStyle(color: AppColors.inkSoft),
                  ),
                  const SizedBox(height: 20),
                  Text('Date of birth', style: theme.textTheme.titleSmall),
                  const SizedBox(height: 8),
                  InkWell(
                    key: const ValueKey('profile_dob_field'),
                    onTap: _isSaving ? null : _pickDateOfBirth,
                    child: InputDecorator(
                      decoration: const InputDecoration(
                        hintText: 'Select a date',
                        suffixIcon: Icon(LucideIcons.calendar),
                      ),
                      child: Text(
                        _dateOfBirth == null
                            ? ''
                            : '${_dateOfBirth!.day.toString().padLeft(2, '0')}/'
                                '${_dateOfBirth!.month.toString().padLeft(2, '0')}/'
                                '${_dateOfBirth!.year}',
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text('Gender', style: theme.textTheme.titleSmall),
                  const SizedBox(height: 8),
                  TextField(
                    key: const ValueKey('profile_gender_input'),
                    controller: _genderController,
                    enabled: !_isSaving,
                    decoration: const InputDecoration(hintText: 'Optional'),
                  ),
                  const SizedBox(height: 28),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: FilledButton(
                      onPressed: _isSaving ? null : _save,
                      child: _isSaving
                          ? const SizedBox(
                              width: 22,
                              height: 22,
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
          },
        ),
      ),
    );
  }
}
