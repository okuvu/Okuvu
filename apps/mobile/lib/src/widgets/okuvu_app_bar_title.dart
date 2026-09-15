import 'package:flutter/material.dart';

/// App wireframes — "the OKUVU mark... now sits in the app header of every
/// screen." Drop-in replacement for a plain `Text` AppBar title: renders
/// the dark-surface mark (this app's AppBar background is royal-purple,
/// per AppTheme) followed by the screen's own title, preserving existing
/// per-screen navigational context rather than replacing it with just the
/// wordmark.
class OkuvuAppBarTitle extends StatelessWidget {
  const OkuvuAppBarTitle(this.title, {super.key, this.style});

  final String title;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Image.asset('assets/brand/okuvu-mark-dark.png', width: 22, height: 22),
        const SizedBox(width: 10),
        Flexible(
          child: Text(title, style: style, overflow: TextOverflow.ellipsis),
        ),
      ],
    );
  }
}
