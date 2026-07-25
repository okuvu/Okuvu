class GroundingResult {
  final List<String> see;
  final List<String> touch;
  final List<String> hear;
  final List<String> smell;
  final List<String> taste;

  const GroundingResult({
    required this.see,
    required this.touch,
    required this.hear,
    required this.smell,
    required this.taste,
  });

  Map<String, dynamic> toJson() => {
    'see': see,
    'touch': touch,
    'hear': hear,
    'smell': smell,
    'taste': taste,
  };
}
