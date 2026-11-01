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

  // The API validates all four as strict booleans and rejects the whole
  // payload if any is missing (POST /users/me/consent → 400 INVALID_CONSENT).
  // Sending a partial body silently breaks onboarding, so every field is
  // required here — the constructor is what stops a caller from omitting one.
  Map<String, dynamic> toJson() => {
        'safety_monitoring': safetyMonitoring,
        'mood_inference': moodInference,
        'assessment': assessment,
        'emergency_contact': emergencyContact,
      };
}
