import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../config/google_config.dart';
import '../../core/auth_service.dart';
import '../../core/providers.dart';
import '../../router/router.dart';
import '../../widgets/okuvu_app_bar_title.dart';

/// Sign-in — Google only.
///
/// Replaced the phone + SMS-OTP screen: SMS needed TRAI DLT registration before
/// a single client could sign in, and every client is already a Google user, so
/// Google is both the faster path and the one that needs no new paperwork.
///
/// The identity that matters is the **email**: the therapist portal's Add-Client
/// wizard creates the client's `User` row from an email address, and
/// `POST /auth/google` binds the Google subject to that row when the addresses
/// match. An invite code stays available for clients whose therapist has not
/// pre-registered them yet.
class GoogleLoginScreen extends ConsumerStatefulWidget {
  const GoogleLoginScreen({super.key});

  @override
  ConsumerState<GoogleLoginScreen> createState() => _GoogleLoginScreenState();
}

class _GoogleLoginScreenState extends ConsumerState<GoogleLoginScreen> {
  bool _isSigningIn = false;
  String? _error;

  // Therapist-portal wireframes C-06 — optional invite code, redeemed after
  // sign-in succeeds.
  final _inviteCodeController = TextEditingController();
  bool _showInviteCodeField = false;

  @override
  void dispose() {
    _inviteCodeController.dispose();
    super.dispose();
  }

  Future<void> _signIn() async {
    setState(() {
      _isSigningIn = true;
      _error = null;
    });

    try {
      final result = await ref.read(authServiceProvider).signInWithGoogle();

      final inviteCode = _inviteCodeController.text.trim().toUpperCase();
      if (inviteCode.isNotEmpty) {
        final error = await _redeemInvite(inviteCode);
        if (!mounted) return;
        if (error != null) {
          setState(() {
            _isSigningIn = false;
            _error = error;
          });
          return;
        }
        setState(() => _isSigningIn = false);
        ref.read(routerProvider).go('/onboarding/welcome');
        return;
      }

      if (!mounted) return;
      setState(() => _isSigningIn = false);

      if (result.hasAccount) {
        ref.read(routerProvider).go('/onboarding/coldstart');
      } else {
        // Verified by Google, but no Okuvu account and no invite — capture an
        // email so there is a list to follow up on (S6).
        ref.read(routerProvider).go('/waitlist', extra: result.email);
      }
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() {
        _isSigningIn = false;
        // A cancelled consent dialog is not an error worth shouting about.
        _error = e.code == 'Cancelled' ? null : e.message;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isSigningIn = false;
        _error = 'Something went wrong. Please try again.';
      });
    }
  }

  /// Returns null on success, or a user-facing message on failure.
  Future<String?> _redeemInvite(String code) async {
    try {
      await ref
          .read(dioClientProvider)
          .post('/invites/redeem', data: {'token': code});
      return null;
    } on DioException catch (e) {
      return switch (_errorCode(e.response?.data)) {
        'ALREADY_REDEEMED' => 'This invite code has already been used.',
        'EXPIRED' => 'This invite code has expired. Ask your therapist to resend it.',
        'NOT_FOUND' => "That invite code wasn't recognized. Check it and try again.",
        'ACCOUNT_ALREADY_LINKED' =>
          'This device is already signed in as a different OKUVU account.',
        _ => 'Something went wrong. Please try again.',
      };
    }
  }

  static String? _errorCode(dynamic responseData) {
    var data = responseData;
    if (data is String && data.isNotEmpty) {
      try {
        data = jsonDecode(data);
      } catch (_) {
        return null;
      }
    }
    if (data is Map) {
      final error = data['error'];
      if (error is Map && error['code'] is String) return error['code'] as String;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final configured = GoogleConfig.isConfigured;

    return Scaffold(
      appBar: AppBar(title: const OkuvuAppBarTitle('Sign In')),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                LucideIcons.sprout,
                size: 80,
                color: theme.colorScheme.primary,
              ),
              const SizedBox(height: 24),
              Text('Welcome to OKUVU', style: theme.textTheme.headlineMedium),
              const SizedBox(height: 8),
              Text(
                'Sign in with the Google account your therapist has for you',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyLarge
                    ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
              const SizedBox(height: 32),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: FilledButton.icon(
                  key: const ValueKey('google_sign_in_button'),
                  // Enabled even when the build has no client id: the tap then
                  // surfaces "Sign-in is not configured on this build" through
                  // AuthService, which is the same message — and keeps the
                  // screen testable without a compiled-in OAuth client.
                  onPressed: _isSigningIn ? null : _signIn,
                  icon: _isSigningIn
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(LucideIcons.mail, size: 20),
                  label: const Text('Continue with Google'),
                ),
              ),
              if (!configured) ...[
                const SizedBox(height: 12),
                Text(
                  'Sign-in is not configured on this build.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: theme.colorScheme.error, fontSize: 13),
                ),
              ],
              if (_error != null) ...[
                const SizedBox(height: 16),
                Text(
                  _error!,
                  key: const ValueKey('sign_in_error'),
                  textAlign: TextAlign.center,
                  style: TextStyle(color: theme.colorScheme.error, fontSize: 14),
                ),
              ],
              const SizedBox(height: 24),
              if (_showInviteCodeField)
                TextField(
                  key: const ValueKey('invite_code_input'),
                  controller: _inviteCodeController,
                  textCapitalization: TextCapitalization.characters,
                  maxLength: 8,
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9]')),
                  ],
                  decoration: const InputDecoration(
                    labelText: 'Invite code',
                    hintText: 'e.g. AB12CD34',
                    counterText: '',
                  ),
                  enabled: !_isSigningIn,
                )
              else
                TextButton(
                  onPressed: () => setState(() => _showInviteCodeField = true),
                  child: const Text('Have an invite code?'),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
