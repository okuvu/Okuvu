enum Environment {
  dev(
    label: 'dev',
    apiBaseUrl: 'http://10.0.2.2:8080',
    wsBaseUrl: 'ws://10.0.2.2:8080',
  ),
  beta(
    label: 'beta',
    apiBaseUrl: 'https://backend-971397352159.asia-south1.run.app',
    wsBaseUrl: 'wss://backend-971397352159.asia-south1.run.app',
  ),
  prod(
    label: 'prod',
    apiBaseUrl: 'https://backend-971397352159.asia-south1.run.app',
    wsBaseUrl: 'wss://backend-971397352159.asia-south1.run.app',
  );

  final String label;
  final String apiBaseUrl;
  final String wsBaseUrl;

  const Environment({
    required this.label,
    required this.apiBaseUrl,
    required this.wsBaseUrl,
  });

  static Environment fromString(String value) {
    return Environment.values.firstWhere(
      (e) => e.label == value,
      orElse: () => throw ArgumentError('Unknown environment: $value'),
    );
  }
}
