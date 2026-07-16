import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/providers.dart';

class UserCarePlan {
  final String carePlanId;
  final String focusAreaName;
  final String? assignmentState;

  const UserCarePlan({
    required this.carePlanId,
    required this.focusAreaName,
    this.assignmentState,
  });
}

String _focusAreaNameForId(String id) {
  switch (id) {
    case 'CP1':
      return 'Anxiety & Worry';
    case 'CP2':
      return 'Low Mood';
    case 'CP3':
      return 'Stress & Burnout';
    default:
      return 'General Support';
  }
}

final userCarePlanProvider = FutureProvider.autoDispose<UserCarePlan?>((ref) async {
  try {
    final dio = ref.read(dioClientProvider);
    final response = await dio.get(
      '/users/me/context',
      options: Options(
        connectTimeout: const Duration(seconds: 3),
        receiveTimeout: const Duration(seconds: 3),
      ),
    );
    final data = response.data as Map<String, dynamic>;
    final carePlan = data['care_plan'] as Map<String, dynamic>?;
    if (carePlan == null) return null;
    final carePlanId = carePlan['care_plan_id'] as String;
    return UserCarePlan(
      carePlanId: carePlanId,
      focusAreaName: _focusAreaNameForId(carePlanId),
      assignmentState: carePlan['assignment_state'] as String?,
    );
  } on DioException {
    return null;
  }
});
