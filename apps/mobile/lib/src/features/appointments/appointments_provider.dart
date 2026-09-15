import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

class AppointmentView {
  final String id;
  final DateTime scheduledAt;
  final int durationMinutes;
  final String mode;
  final String? location;
  final String? noteToClient;
  final bool remind24h;
  final bool remind1h;
  final String? rescheduledFrom;
  final DateTime? cancelledAt;
  final String therapistId;
  final String? therapistName;

  const AppointmentView({
    required this.id,
    required this.scheduledAt,
    required this.durationMinutes,
    required this.mode,
    this.location,
    this.noteToClient,
    required this.remind24h,
    required this.remind1h,
    this.rescheduledFrom,
    this.cancelledAt,
    required this.therapistId,
    this.therapistName,
  });

  factory AppointmentView.fromJson(Map<String, dynamic> json) {
    return AppointmentView(
      id: json['id'] as String,
      scheduledAt: DateTime.parse(json['scheduledAt'] as String),
      durationMinutes: json['durationMinutes'] as int,
      mode: json['mode'] as String,
      location: json['location'] as String?,
      noteToClient: json['noteToClient'] as String?,
      remind24h: json['remind24h'] as bool,
      remind1h: json['remind1h'] as bool,
      rescheduledFrom: json['rescheduledFrom'] as String?,
      cancelledAt: json['cancelledAt'] != null
          ? DateTime.parse(json['cancelledAt'] as String)
          : null,
      therapistId: json['therapistId'] as String,
      therapistName: json['therapistName'] as String?,
    );
  }
}

class AppointmentsData {
  final List<AppointmentView> upcoming;
  final List<AppointmentView> past;

  const AppointmentsData({required this.upcoming, required this.past});

  factory AppointmentsData.fromJson(Map<String, dynamic> json) {
    final upcoming = json['upcoming'] as List<dynamic>? ?? [];
    final past = json['past'] as List<dynamic>? ?? [];
    return AppointmentsData(
      upcoming: upcoming.map((a) => AppointmentView.fromJson(a as Map<String, dynamic>)).toList(),
      past: past.map((a) => AppointmentView.fromJson(a as Map<String, dynamic>)).toList(),
    );
  }
}

/// GET /users/me/appointments — app wireframes A2. Read-only: the client
/// can never create/move/cancel from the app (I10/I11) — all writes stay
/// on the therapist portal.
final appointmentsProvider = FutureProvider.autoDispose<AppointmentsData>((ref) async {
  final dio = ref.read(dioClientProvider);
  final response = await dio.get('/users/me/appointments');
  return AppointmentsData.fromJson(response.data as Map<String, dynamic>);
});

/// Looks up a single appointment by id from the already-fetched list
/// (upcoming or past) — the detail screen (A3) doesn't need its own GET,
/// the list response already carries every field the detail view shows.
final appointmentByIdProvider = Provider.family<AppointmentView?, String>((ref, id) {
  final data = ref.watch(appointmentsProvider).value;
  if (data == null) return null;
  for (final a in [...data.upcoming, ...data.past]) {
    if (a.id == id) return a;
  }
  return null;
});
