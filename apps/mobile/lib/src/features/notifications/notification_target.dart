import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../homework/homework_provider.dart';
import '../library/library_launcher.dart';
import 'notifications_provider.dart';

/// Where a tapped update leads.
///
/// One answer for the three surfaces that can deliver a tap — the inbox row,
/// the in-app banner, and a system notification's own data payload — because a
/// client who taps the same update twice from two places must not land in two
/// different ones. The row carries ids only; the exercise itself is resolved
/// through the homework list, which is where the client's assignments and their
/// tools already live.
///
/// Null means "no destination this app can name": the tap still marks the row
/// read, and nothing pretends to navigate.
Future<String?> notificationTarget(
  WidgetRef ref,
  ClientNotification notification,
) async {
  if (notification.appointmentId != null) {
    return '/appointments/${notification.appointmentId}';
  }

  if (notification.homeworkId != null) {
    final path = await exercisePathForAssignment(ref, notification.homeworkId!);
    // Straight into the exercise when the app has a player for it; the list
    // otherwise, which is where an assignment with no player is read.
    return path ?? '/homework';
  }

  switch (notification.kind) {
    case 'homework_assigned':
    case 'homework_due_today':
    case 'reminder_set':
      return '/homework';
  }

  return null;
}

/// The route of the exercise behind one assignment, or null when the catalogue
/// item has no screen this app can open.
Future<String?> exercisePathForAssignment(WidgetRef ref, String homeworkId) async {
  String? toolId;
  try {
    final page = await ref.read(homeworkListProvider.future);
    for (final item in page.homework) {
      if (item.id == homeworkId) {
        toolId = item.toolId;
        break;
      }
    }
  } catch (_) {
    // The list is a convenience here, never a gate: a client with no network
    // still reaches the homework screen, which retries on its own.
  }
  return toolId == null ? null : libraryRoutePath(toolId);
}

/// Resolve a system notification's tap target.
///
/// The push payload is ids only, so a homework tap arrives as
/// `/homework?assignment=<id>` and becomes the exercise once the list is read.
/// Anything else is already a route and passes through untouched.
Future<String> resolvePushTarget(WidgetRef ref, String target) async {
  final uri = Uri.tryParse(target);
  if (uri == null || uri.path != '/homework') return target;

  final assignment = uri.queryParameters['assignment'];
  if (assignment == null || assignment.isEmpty) return target;

  return await exercisePathForAssignment(ref, assignment) ?? '/homework';
}
