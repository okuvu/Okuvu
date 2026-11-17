import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:in_app_update/in_app_update.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import '../logger.dart';
import 'version_policy.dart';

/// The Play package id. `market://` needs it literally — the store URL from the
/// server is the fallback, not the primary route, because it opens a browser
/// page rather than the installed Play app's update screen.
const String kPlayPackageId = 'ai.okuvu.app';

/// How the app should report what happened when the client pressed "Update".
enum AppUpdateOutcome {
  /// Google Play took over the screen and is installing the new build.
  playUpdateStarted,

  /// The in-app flow was unavailable or declined, so the store page was opened.
  storeOpened,

  /// Neither route worked — no Play services and no browser.
  failed,
}

class AppUpdateService {
  const AppUpdateService();

  /// One button, two mechanisms.
  ///
  /// Primary: Google Play's in-app update, which downloads over whatever
  /// connection the phone has — mobile data included — and replaces the build
  /// without the client ever opening the Play Store app. Fallback: open the
  /// store page, which is what still works on a handset with no Play services
  /// and on a sideloaded build Play refuses to update in place.
  Future<AppUpdateOutcome> requestUpdate({required String storeUrl}) async {
    try {
      final info = await InAppUpdate.checkForUpdate();
      if (info.updateAvailability == UpdateAvailability.updateAvailable) {
        final result = await InAppUpdate.performImmediateUpdate();
        if (result == AppUpdateResult.success) {
          return AppUpdateOutcome.playUpdateStarted;
        }
        if (result == AppUpdateResult.userDeniedUpdate) {
          // The client tapped the OS's cancel — respect it, do not bounce them
          // into a browser they did not ask for.
          return AppUpdateOutcome.failed;
        }
      }
    } catch (error, stack) {
      Logger.debug('In-app update unavailable: $error\n$stack');
    }
    return openStore(storeUrl);
  }

  Future<AppUpdateOutcome> openStore(String storeUrl) async {
    final candidates = <Uri>[
      Uri.parse('market://details?id=$kPlayPackageId'),
      if (storeUrl.isNotEmpty) Uri.parse(storeUrl),
    ];
    for (final uri in candidates) {
      try {
        final opened =
            await launchUrl(uri, mode: LaunchMode.externalApplication);
        if (opened) return AppUpdateOutcome.storeOpened;
      } catch (error) {
        Logger.debug('Could not open $uri: $error');
      }
    }
    return AppUpdateOutcome.failed;
  }
}

final appUpdateServiceProvider =
    Provider<AppUpdateService>((ref) => const AppUpdateService());

/// SharedPreferences key holding the latest version code the client has already
/// dismissed, so the offer appears once per release rather than every launch.
const String kUpdateDismissedCodeKey = 'app_update_dismissed_version_code';

/// Sits above the router and decides whether this handset may proceed.
///
/// Three states, in order: no policy or no readable build (render the app —
/// fail open), below the floor (block until updated), below the newest build
/// (offer, don't block). The floor is the server's to raise, so a safety fix
/// can be made compulsory without shipping an app release first.
class AppUpdateGate extends ConsumerStatefulWidget {
  const AppUpdateGate({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<AppUpdateGate> createState() => _AppUpdateGateState();
}

class _AppUpdateGateState extends ConsumerState<AppUpdateGate> {
  bool _offered = false;
  bool _busy = false;

  Future<void> _runUpdate(String storeUrl) async {
    if (_busy) return;
    setState(() => _busy = true);
    final outcome = await ref
        .read(appUpdateServiceProvider)
        .requestUpdate(storeUrl: storeUrl);
    if (!mounted) return;
    setState(() => _busy = false);
    if (outcome == AppUpdateOutcome.failed) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Could not open the Play Store. Update Okuvu from the Play Store app.',
          ),
        ),
      );
    }
  }

  Future<void> _offerUpdate(VersionPolicy policy) async {
    _offered = true;
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getInt(kUpdateDismissedCodeKey) == policy.latestVersionCode) {
      return;
    }
    if (!mounted) return;
    final update = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('A new version is ready'),
        content: const Text(
          'Update Okuvu to get the latest fixes. It only takes a few seconds.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Not now'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Update now'),
          ),
        ],
      ),
    );
    if (!mounted) return;
    if (update ?? false) {
      await _runUpdate(policy.storeUrl);
      return;
    }
    await prefs.setInt(kUpdateDismissedCodeKey, policy.latestVersionCode);
  }

  @override
  Widget build(BuildContext context) {
    final policy = ref.watch(versionPolicyProvider).asData?.value;
    final build = ref.watch(appBuildInfoProvider).asData?.value;

    if (policy == null || build == null || !build.isKnown) {
      return widget.child;
    }

    if (build.buildNumber < policy.minimumSupportedVersionCode) {
      return _BlockingUpdateScreen(
        busy: _busy,
        onUpdate: () => _runUpdate(policy.storeUrl),
      );
    }

    if (build.buildNumber < policy.latestVersionCode && !_offered) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && !_offered) _offerUpdate(policy);
      });
    }

    return widget.child;
  }
}

/// Shown instead of the app when the handset is below the server's floor.
///
/// No dismiss control on purpose: the whole point is that a build carrying a
/// fix cannot be sat on. The one escape is the update itself.
class _BlockingUpdateScreen extends StatelessWidget {
  const _BlockingUpdateScreen({required this.busy, required this.onUpdate});

  final bool busy;
  final VoidCallback onUpdate;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Icon(
                Icons.system_update_alt_rounded,
                size: 56,
                color: theme.colorScheme.primary,
              ),
              const SizedBox(height: 24),
              Text(
                'Okuvu needs an update',
                textAlign: TextAlign.center,
                style: theme.textTheme.headlineSmall,
              ),
              const SizedBox(height: 12),
              Text(
                'A newer version is required to keep using Okuvu. '
                'It takes a few seconds and nothing you have written is lost.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium,
              ),
              const SizedBox(height: 28),
              FilledButton(
                onPressed: busy ? null : onUpdate,
                child: busy
                    ? const SizedBox(
                        height: 18,
                        width: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Update now'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
