import 'package:flutter/material.dart';

import '../../core/logger.dart';

/// Settings writes used to be fire-and-forget: the switch moved, the PATCH was
/// dispatched with `unawaited`, every error was logged and dropped, and the
/// screen kept showing the optimistic value. A failed save therefore looked
/// exactly like a successful one until the app was relaunched — the owner's
/// report was "nothing in Settings is getting saved", and from the phone there
/// was no way to tell which setting had failed or that anything had.
///
/// Every Settings save now awaits its request, reverts the control on failure
/// and says so here. `what` names the setting in the user's words ("Voice").
String settingsSaveFailureMessage(String what) =>
    "Couldn't save $what. Please try again.";

void showSettingsSaveFailure(
  BuildContext context,
  String what, {
  Object? error,
}) {
  Logger.debug('[settings] save failed for "$what": $error');
  final messenger = ScaffoldMessenger.maybeOf(context);
  if (messenger == null) return;
  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(settingsSaveFailureMessage(what)),
        behavior: SnackBarBehavior.floating,
      ),
    );
}
