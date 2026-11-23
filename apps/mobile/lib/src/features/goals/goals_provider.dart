import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

/// One goal, as `GET /users/me/goals` returns it.
///
/// The text is the therapist's own wording. The server never sends a `dropped`
/// goal — that is a clinical decision, not a message to the client — so the app
/// has exactly two states to render.
class ClientGoal {
  final String id;
  final String text;
  final String status;
  final bool isFocus;

  const ClientGoal({
    required this.id,
    required this.text,
    required this.status,
    required this.isFocus,
  });

  bool get isAchieved => status == 'achieved';

  factory ClientGoal.fromJson(Map<String, dynamic> json) {
    return ClientGoal(
      id: json['id'] as String,
      text: json['text'] as String,
      status: json['status'] as String,
      isFocus: json['isFocus'] as bool? ?? false,
    );
  }
}

class GoalsData {
  final List<ClientGoal> goals;
  final int activeCount;

  const GoalsData({required this.goals, required this.activeCount});

  bool get isEmpty => goals.isEmpty;

  /// The goal the pair is working on now, when the server named one.
  ClientGoal? get focus {
    for (final goal in goals) {
      if (goal.isFocus) return goal;
    }
    return null;
  }

  List<ClientGoal> get waiting => goals.where((goal) => !goal.isAchieved && !goal.isFocus).toList();

  List<ClientGoal> get achieved => goals.where((goal) => goal.isAchieved).toList();

  factory GoalsData.fromJson(Map<String, dynamic> json) {
    final list = (json['goals'] as List<dynamic>? ?? const [])
        .map((entry) => ClientGoal.fromJson(entry as Map<String, dynamic>))
        .toList();
    return GoalsData(
      goals: list,
      activeCount: json['activeCount'] as int? ?? list.where((goal) => !goal.isAchieved).length,
    );
  }
}

/// GET /users/me/goals — the goals the therapist wrote, in their order.
final goalsProvider = FutureProvider.autoDispose<GoalsData>((ref) async {
  final dio = ref.read(dioClientProvider);
  final response = await dio.get('/users/me/goals');
  return GoalsData.fromJson(response.data as Map<String, dynamic>);
});
