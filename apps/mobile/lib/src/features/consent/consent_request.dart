class ConsentRequest {
  final bool safetyMonitoring;
  final bool moodInference;

  const ConsentRequest({
    required this.safetyMonitoring,
    required this.moodInference,
  });

  Map<String, dynamic> toJson() => {
    'safety_monitoring': safetyMonitoring,
    'mood_inference': moodInference,
  };
}
