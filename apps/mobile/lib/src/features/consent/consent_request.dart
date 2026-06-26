class ConsentRequest {
  final bool safetyMonitoring;
  final bool moodInference;
  final bool assessment;
  final bool emergencyContact;

  const ConsentRequest({
    required this.safetyMonitoring,
    required this.moodInference,
    required this.assessment,
    required this.emergencyContact,
  });

  Map<String, dynamic> toJson() => {
    'safety_monitoring': safetyMonitoring,
    'mood_inference': moodInference,
    'assessment': assessment,
    'emergency_contact': emergencyContact,
  };
}
