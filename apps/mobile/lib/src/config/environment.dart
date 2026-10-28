enum Environment {
  dev(
    label: 'dev',
    apiBaseUrl: 'http://10.0.2.2:8080',
    wsBaseUrl: 'ws://10.0.2.2:8080',
  ),
  // AWS ap-south-1. These hostnames are Route53 records aliased to the public
  // ALB built by infrastructure/aws/evia-beta (dns.tf). They replaced the Cloud
  // Run host `backend-971397352159.asia-south1.run.app`, which was a GCP
  // endpoint and answered HTTP 404 on every path after the AWS cutover.
  beta(
    label: 'beta',
    apiBaseUrl: 'https://beta.api.okuvu.in',
    wsBaseUrl: 'wss://beta.api.okuvu.in',
  ),
  prod(
    label: 'prod',
    apiBaseUrl: 'https://api.okuvu.in',
    wsBaseUrl: 'wss://api.okuvu.in',
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
