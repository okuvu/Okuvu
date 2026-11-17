import 'package:flutter_test/flutter_test.dart';
import 'package:okuvu/src/core/push_service.dart';

/// The tap-target mapping is the one part of push that is pure, and the part
/// that is easiest to get wrong silently: a wrong route opens a screen that has
/// nothing to do with the notification, which reads to the client as the tap not
/// working at all.
void main() {
  group('PushService.routeFor', () {
    test('an appointment id opens that session, ahead of the inbox', () {
      expect(
        PushService.routeFor({'kind': 'appointment_booked', 'appointmentId': 'apt-1'}),
        '/appointments/apt-1',
      );
      expect(
        PushService.routeFor({
          'kind': 'appointment_rescheduled',
          'appointmentId': 'apt-2',
        }),
        '/appointments/apt-2',
      );
    });

    test('homework kinds open the homework list', () {
      expect(PushService.routeFor({'kind': 'homework_assigned'}), '/homework');
      expect(PushService.routeFor({'kind': 'homework_due_today'}), '/homework');
    });

    test('a reminder or treasure note opens the inbox', () {
      expect(PushService.routeFor({'kind': 'reminder_set'}), '/notifications');
      expect(PushService.routeFor({'kind': 'treasure_note_waiting'}), '/notifications');
    });

    test('a broadcast opens the inbox', () {
      expect(PushService.routeFor({'kind': 'service_update'}), '/notifications');
    });

    test('no kind means no navigation rather than a guessed screen', () {
      expect(PushService.routeFor({}), isNull);
      expect(PushService.routeFor({'kind': ''}), isNull);
    });

    test('an empty appointment id falls back instead of routing to a blank detail', () {
      expect(
        PushService.routeFor({'kind': 'appointment_booked', 'appointmentId': ''}),
        '/notifications',
      );
    });
  });
}
