enum Environment {
  dev(
    label: 'dev',
    baseUrl: 'http://localhost:8080',
  ),
  beta(
    label: 'beta',
    baseUrl: 'https://evia-500215-xxxxx-uc.a.run.app',
  ),
  prod(
    label: 'prod',
    baseUrl: 'https://evia-500215-xxxxx-uc.a.run.app',
  );

  final String label;
  final String baseUrl;

  const Environment({
    required this.label,
    required this.baseUrl,
  });

  static Environment fromString(String value) {
    return Environment.values.firstWhere(
      (e) => e.label == value,
      orElse: () => throw ArgumentError('Unknown environment: $value'),
    );
  }
}
