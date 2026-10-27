import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import '../../core/auth_service.dart';
import '../../core/providers.dart';
import '../../router/router.dart';
import '../../widgets/okuvu_app_bar_title.dart';

enum _AuthStep { phone, otp }

class OtpLoginScreen extends ConsumerStatefulWidget {
  const OtpLoginScreen({super.key});

  @override
  ConsumerState<OtpLoginScreen> createState() => _OtpLoginScreenState();
}

class _OtpLoginScreenState extends ConsumerState<OtpLoginScreen> {
  static const int _otpLength = 6;
  static const int _resendCooldown = 30;

  _AuthStep _step = _AuthStep.phone;

  // Phone step state
  final _phoneController = TextEditingController();
  String? _phoneError;
  bool _isSending = false;

  // Therapist-portal wireframes C-06 — optional invite code, collected
  // inline on the phone step, redeemed after OTP verification succeeds.
  final _inviteCodeController = TextEditingController();
  bool _showInviteCodeField = false;

  // OTP step state
  String? _verificationId;
  int? _forceResendingToken;
  late final List<TextEditingController> _otpControllers;
  late final List<FocusNode> _otpFocusNodes;
  String? _otpError;
  bool _isVerifying = false;
  bool _isResending = false;

  // Resend timer
  int _resendSeconds = _resendCooldown;
  Timer? _resendTimer;

  @override
  void initState() {
    super.initState();
    _otpControllers = List.generate(_otpLength, (_) => TextEditingController());
    _otpFocusNodes = List.generate(_otpLength, (_) => FocusNode());
  }

  @override
  void dispose() {
    _phoneController.dispose();
    _inviteCodeController.dispose();
    for (final c in _otpControllers) {
      c.dispose();
    }
    for (final f in _otpFocusNodes) {
      f.dispose();
    }
    _resendTimer?.cancel();
    super.dispose();
  }

  static bool _isValidPhone(String value) {
    final cleaned = value.replaceAll(RegExp(r'[\s\-]'), '');
    return RegExp(r'^(\+91)?[6-9]\d{9}$').hasMatch(cleaned);
  }

  static String _normalizePhone(String value) {
    final digits = value.replaceAll(RegExp(r'[^\d]'), '');
    return '+91${digits.substring(digits.length - 10)}';
  }

  void _startResendTimer() {
    _resendTimer?.cancel();
    setState(() => _resendSeconds = _resendCooldown);
    _resendTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      setState(() {
        _resendSeconds--;
        if (_resendSeconds <= 0) {
          _resendSeconds = 0;
          timer.cancel();
        }
      });
    });
  }

  void _onOtpChanged(int index, String value) {
    if (value.isNotEmpty) {
      if (index < _otpLength - 1) {
        _otpFocusNodes[index + 1].requestFocus();
      } else {
        _otpFocusNodes[index].unfocus();
        _verifyOtp();
      }
    }
  }

  Future<void> _sendOtp() async {
    final phone = _phoneController.text.trim();
    if (!_isValidPhone(phone)) {
      setState(
          () => _phoneError = 'Enter a valid 10-digit Indian phone number');
      return;
    }

    setState(() {
      _phoneError = null;
      _isSending = true;
    });

    ref.read(authServiceProvider).verifyPhone(
          phoneNumber: _normalizePhone(phone),
          onCodeSent: (verificationId, token) {
            if (!mounted) return;
            setState(() {
              _isSending = false;
              _verificationId = verificationId;
              _forceResendingToken = token;
              _step = _AuthStep.otp;
            });
            _startResendTimer();
          },
          onError: (AuthException e) {
            if (!mounted) return;
            setState(() {
              _isSending = false;
              _phoneError = e.message;
            });
          },
        );
  }

  Future<void> _resendCode() async {
    setState(() => _isResending = true);

    ref.read(authServiceProvider).verifyPhone(
          phoneNumber: _normalizePhone(_phoneController.text.trim()),
          forceResendingToken: _forceResendingToken,
          onCodeSent: (verificationId, token) {
            if (!mounted) return;
            setState(() {
              _isResending = false;
              _verificationId = verificationId;
              _forceResendingToken = token;
              _otpError = null;
            });
            _clearOtpFields();
            _startResendTimer();
          },
          onError: (AuthException e) {
            if (!mounted) return;
            setState(() {
              _isResending = false;
              _otpError = e.message;
            });
          },
        );
  }

  void _clearOtpFields() {
    for (final c in _otpControllers) {
      c.clear();
    }
    _otpFocusNodes[0].requestFocus();
  }

  Future<void> _verifyOtp() async {
    if (_verificationId == null) return;

    final otp = _otpControllers.map((c) => c.text).join();
    if (otp.length != _otpLength) return;

    final authService = ref.read(authServiceProvider);
    final dio = ref.read(dioClientProvider);

    setState(() {
      _isVerifying = true;
      _otpError = null;
    });

    try {
      await authService.verifyOtp(
            verificationId: _verificationId!,
            smsCode: otp,
          );

      final inviteCode = _inviteCodeController.text.trim().toUpperCase();
      if (inviteCode.isNotEmpty) {
        try {
          await dio.post('/invites/redeem', data: {'token': inviteCode});
          // The invite's placeholder User already has phone_number/email
          // from the Add-Client wizard — no need to also call
          // /auth/verify-otp here; go straight to the welcome screen.
          ref.read(routerProvider).go('/onboarding/welcome');
          return;
        } on DioException catch (e) {
          if (!mounted) return;
          String? code;
          var responseData = e.response?.data;
          if (responseData is String) {
            try {
              responseData = jsonDecode(responseData);
            } catch (_) {
              // Not JSON — leave code null, falls through to the generic message.
            }
          }
          if (responseData is Map) {
            final errorField = responseData['error'];
            if (errorField is Map) {
              code = errorField['code'] as String?;
            }
          }
          setState(() {
            _isVerifying = false;
            _otpError = switch (code) {
              'ALREADY_REDEEMED' => 'This invite code has already been used.',
              'EXPIRED' => 'This invite code has expired. Ask your therapist to resend it.',
              'NOT_FOUND' => 'That invite code wasn\'t recognized. Check it and try again.',
              _ => 'Something went wrong. Please try again.',
            };
          });
          return;
        }
      }

      try {
        final response = await dio.post('/auth/verify-otp', data: {
          'phone_number': _normalizePhone(_phoneController.text.trim()),
        });
        final data = response.data;
        final shouldOnboard = data is! Map<String, dynamic> || data['is_new_user'] != false;
        if (shouldOnboard) {
          ref.read(routerProvider).go('/onboarding/coldstart');
        }
      } on DioException catch (e) {
        if (!mounted) return;
        String? code;
        var responseData = e.response?.data;
        if (responseData is String) {
          try {
            responseData = jsonDecode(responseData);
          } catch (_) {
            // Not JSON — leave code null, falls through to the generic message.
          }
        }
        if (responseData is Map) {
          final errorField = responseData['error'];
          if (errorField is Map) {
            code = errorField['code'] as String?;
          }
        }
        // Verify-otp no longer auto-provisions an account (see
        // apps/api/src/routes/auth.ts) — a phone number with no invite
        // goes to the waitlist (S6) rather than a dead-end error.
        if (code == 'NO_ACCOUNT') {
          setState(() => _isVerifying = false);
          ref.read(routerProvider).go(
                '/waitlist',
                extra: _normalizePhone(_phoneController.text.trim()),
              );
          return;
        }
        setState(() {
          _isVerifying = false;
          _otpError = 'Something went wrong. Please try again.';
        });
        return;
      }
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() {
        _isVerifying = false;
        _otpError = e.message;
      });
      _clearOtpFields();
    }
  }

  void _goBackToPhone() {
    _resendTimer?.cancel();
    setState(() {
      _step = _AuthStep.phone;
      _verificationId = null;
      _otpError = null;
      _resendSeconds = _resendCooldown;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: OkuvuAppBarTitle(_step == _AuthStep.phone ? 'Sign In' : 'Verify OTP'),
        leading: _step == _AuthStep.otp
            ? IconButton(
                icon: const Icon(LucideIcons.arrowLeft),
                onPressed: _goBackToPhone,
              )
            : null,
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: _step == _AuthStep.phone
              ? _buildPhoneStep(theme)
              : _buildOtpStep(theme),
        ),
      ),
    );
  }

  Widget _buildPhoneStep(ThemeData theme) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(LucideIcons.smartphone, size: 80, color: theme.colorScheme.primary),
        const SizedBox(height: 24),
        Text('Welcome to OKUVU', style: theme.textTheme.headlineMedium),
        const SizedBox(height: 8),
        Text(
          'Enter your phone number to get started',
          style: theme.textTheme.bodyLarge
              ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
        const SizedBox(height: 32),
        TextField(
          key: const ValueKey('phone_input'),
          controller: _phoneController,
          decoration: InputDecoration(
            labelText: 'Phone Number',
            hintText: '99999 99999',
            prefixIcon: const Icon(LucideIcons.phone),
            prefix: Padding(
              padding: const EdgeInsets.only(left: 12, right: 4),
              child: Text(
                '+91',
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  color: theme.colorScheme.onSurface,
                ),
              ),
            ),
            errorText: _phoneError,
          ),
          keyboardType: TextInputType.phone,
          enabled: !_isSending,
        ),
        const SizedBox(height: 24),
        SizedBox(
          width: double.infinity,
          height: 48,
          child: FilledButton(
            onPressed: _isSending ? null : _sendOtp,
            child: _isSending
                ? const SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Text('Continue with Phone'),
          ),
        ),
        const SizedBox(height: 16),
        if (_showInviteCodeField)
          TextField(
            key: const ValueKey('invite_code_input'),
            controller: _inviteCodeController,
            textCapitalization: TextCapitalization.characters,
            maxLength: 8,
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9]'))],
            decoration: const InputDecoration(
              labelText: 'Invite code',
              hintText: 'e.g. AB12CD34',
              counterText: '',
            ),
            enabled: !_isSending,
          )
        else
          TextButton(
            onPressed: () => setState(() => _showInviteCodeField = true),
            child: const Text('Have an invite code?'),
          ),
      ],
    );
  }

  Widget _buildOtpStep(ThemeData theme) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(LucideIcons.smartphone, size: 64, color: theme.colorScheme.primary),
        const SizedBox(height: 24),
        Text('OTP Verification', style: theme.textTheme.headlineMedium),
        const SizedBox(height: 8),
        Text(
          'Enter the code sent to ${_normalizePhone(_phoneController.text.trim())}',
          style: theme.textTheme.bodyMedium
              ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
        const SizedBox(height: 32),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(_otpLength, (i) {
            return Padding(
              padding: EdgeInsets.only(left: i == 0 ? 0 : 8),
              child: SizedBox(
                width: 44,
                child: Focus(
                  onKeyEvent: (node, event) {
                    if (event is KeyDownEvent &&
                        event.logicalKey == LogicalKeyboardKey.backspace &&
                        _otpControllers[i].text.isEmpty &&
                        i > 0) {
                      _otpFocusNodes[i - 1].requestFocus();
                      return KeyEventResult.handled;
                    }
                    return KeyEventResult.ignored;
                  },
                  child: TextField(
                    key: ValueKey('otp_$i'),
                    controller: _otpControllers[i],
                    focusNode: _otpFocusNodes[i],
                    textAlign: TextAlign.center,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    maxLength: 1,
                    buildCounter: (_,
                            {required int currentLength,
                            required bool isFocused,
                            int? maxLength}) =>
                        null,
                    style: const TextStyle(
                        fontSize: 22, fontWeight: FontWeight.w600),
                    decoration: InputDecoration(
                      counterText: '',
                      contentPadding: EdgeInsets.zero,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    onChanged: (value) => _onOtpChanged(i, value),
                    enabled: !_isVerifying,
                  ),
                ),
              ),
            );
          }),
        ),
        if (_otpError != null) ...[
          const SizedBox(height: 12),
          Text(
            _otpError!,
            style: TextStyle(color: theme.colorScheme.error, fontSize: 14),
            textAlign: TextAlign.center,
          ),
        ],
        const SizedBox(height: 24),
        Stack(
          alignment: Alignment.center,
          children: [
            Visibility(
              maintainState: true,
              maintainSize: true,
              maintainAnimation: true,
              visible: !_isVerifying,
              child: SizedBox(
                width: double.infinity,
                height: 48,
                child: FilledButton(
                  onPressed: _verifyOtp,
                  child: const Text('Verify & Continue'),
                ),
              ),
            ),
            if (_isVerifying) const CircularProgressIndicator(),
          ],
        ),
        const SizedBox(height: 16),
        if (_isResending)
          const SizedBox(
            width: 16,
            height: 16,
            child: CircularProgressIndicator(strokeWidth: 2),
          )
        else if (_resendSeconds > 0)
          Text(
            'Resend code in $_resendSeconds s',
            style: TextStyle(color: theme.colorScheme.onSurfaceVariant),
          )
        else
          TextButton(
            onPressed: _resendCode,
            child: const Text('Resend code'),
          ),
      ],
    );
  }
}
