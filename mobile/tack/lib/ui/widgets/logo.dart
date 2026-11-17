import 'dart:math' as math;

import 'package:kit/kit.dart';
import 'package:material_ui/material_ui.dart';

import '../theme.dart';

/// How the logo is drawn at one moment of the splash. At rest everything is in place.
class LogoPose {
  const LogoPose({
    this.cardDy = 0,
    this.cardOpacity = 1,
    this.tackDy = 0,
    this.tackOpacity = 1,
    this.tackScaleX = 1,
    this.tackScaleY = 1,
  });
  final double cardDy;
  final double cardOpacity;
  final double tackDy;
  final double tackOpacity;
  final double tackScaleX;
  final double tackScaleY;

  static const rest = LogoPose();
}

/// The mark from brand/tack-logo.svg: a dark index card tilted −6°, one ticked line and two
/// open ones, pinned at the top by a round blue tack.
class LogoPainter extends CustomPainter {
  LogoPainter(this.colors, [this.pose = LogoPose.rest]);
  final TackColors colors;
  final LogoPose pose;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width / 512, size.height / 512);

    if (pose.cardOpacity > 0) {
      final a = pose.cardOpacity.clamp(0.0, 1.0);
      canvas.save();
      canvas.translate(0, pose.cardDy);
      canvas.translate(256, 290);
      canvas.rotate(-6 * math.pi / 180);
      canvas.translate(-256, -290);
      Paint fill(Color c) => Paint()..color = c.withValues(alpha: c.a * a);
      canvas.drawRRect(
        RRect.fromRectAndRadius(const Rect.fromLTWH(124, 140, 264, 300), const Radius.circular(36)),
        fill(colors.logoCard),
      );
      canvas.drawPath(
        Path()
          ..moveTo(168, 238)
          ..relativeLineTo(18, 18)
          ..relativeLineTo(34, -38),
        Paint()
          ..color = TackColors.logoTack.withValues(alpha: a)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 16
          ..strokeCap = StrokeCap.round
          ..strokeJoin = StrokeJoin.round,
      );
      RRect line(double x, double y, double w) =>
          RRect.fromRectAndRadius(Rect.fromLTWH(x, y, w, 18), const Radius.circular(9));
      canvas.drawRRect(line(240, 232, 104), fill(colors.logoLineDone));
      canvas.drawRRect(line(168, 296, 176), fill(TackColors.logoLine));
      canvas.drawRRect(line(168, 352, 120), fill(TackColors.logoLine));
      canvas.restore();
    }

    if (pose.tackOpacity > 0) {
      final a = pose.tackOpacity.clamp(0.0, 1.0);
      canvas.save();
      canvas.translate(0, pose.tackDy);
      // Squashes from the bottom of the head, like a tack pressed in.
      canvas.translate(256, 178);
      canvas.scale(pose.tackScaleX, pose.tackScaleY);
      canvas.translate(-256, -178);
      canvas.drawCircle(const Offset(256, 128), 50, Paint()..color = TackColors.logoTack.withValues(alpha: a));
      canvas.drawCircle(const Offset(240, 110), 14, Paint()..color = TackColors.logoShine.withValues(alpha: a));
      canvas.restore();
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(LogoPainter old) => old.pose != pose || old.colors != colors;
}

class LogoMark extends StatelessWidget {
  const LogoMark({super.key, this.size = 32});
  final double size;

  @override
  Widget build(BuildContext context) => CustomPaint(size: Size.square(size), painter: LogoPainter(context.tack));
}

/// The mark with the wordmark, for the first-run screen.
class LogoLockup extends StatelessWidget {
  const LogoLockup({super.key});

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      const LogoMark(size: 56),
      const SizedBox(width: Space.s2),
      Text('Tack', style: context.text.displayMedium!.copyWith(letterSpacing: -0.6)),
    ],
  );
}

/// Opening the app (once per launch): the card drops in and settles at its tilt, the tack
/// presses down with a small squash, then the logo flies to its place in the top bar. Nothing
/// behind it waits, and it never takes a tap. With reduced motion the logo just shows, still.
class Splash extends StatefulWidget {
  const Splash({super.key, required this.target, required this.onDone});

  /// The top bar's logo, where the mark lands.
  final GlobalKey target;
  final VoidCallback onDone;

  @override
  State<Splash> createState() => _SplashState();
}

class _SplashState extends State<Splash> with SingleTickerProviderStateMixin {
  static const _settled = 1050;
  static const _fly = 400;
  static const _size = 144.0;

  late final _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: _settled + _fly),
  );
  bool _still = false;
  Offset? _to;
  double _toScale = 32 / _size;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_c.isAnimating || _c.isCompleted) return;
    _still = MediaQuery.disableAnimationsOf(context);
    if (_still) {
      _c.duration = const Duration(milliseconds: 400);
    }
    _c.forward().whenComplete(() {
      if (mounted) widget.onDone();
    });
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  /// Where the top bar's logo is, measured once the flight starts.
  void _measure(Size screen) {
    if (_to != null) return;
    final box = widget.target.currentContext?.findRenderObject() as RenderBox?;
    final own = context.findRenderObject() as RenderBox?;
    if (box == null || own == null || !box.hasSize) {
      _to = Offset.zero;
      return;
    }
    final centre = box.localToGlobal(box.size.center(Offset.zero), ancestor: own);
    _to = centre - screen.center(Offset.zero);
    _toScale = box.size.width / _size;
  }

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    final colors = context.tack;
    return IgnorePointer(
      child: ExcludeSemantics(
        child: LayoutBuilder(
          builder: (context, box) => AnimatedBuilder(
            animation: _c,
            builder: (context, _) {
              if (_still) {
                return ColoredBox(
                  color: t.bg,
                  child: Center(
                    child: CustomPaint(size: const Size.square(_size), painter: LogoPainter(colors)),
                  ),
                );
              }
              final ms = _c.value * (_settled + _fly);
              double span(double from, double to) => ((ms - from) / (to - from)).clamp(0.0, 1.0);
              const unit = 512 / _size; // CSS pixels of the web splash, in logo units

              final card = Motion.easeOut.transform(span(0, 450));
              final tack = span(400, 900);
              double tackDy;
              double sx = 1, sy = 1;
              if (tack < 0.55) {
                final k = Motion.easeOut.transform(tack / 0.55);
                tackDy = -50 * unit * (1 - k);
                sx = 1 + 0.08 * k;
                sy = 1 - 0.18 * k;
              } else {
                final k = Motion.easeOut.transform((tack - 0.55) / 0.45);
                tackDy = 0;
                sx = 1.08 - 0.08 * k;
                sy = 0.82 + 0.18 * k;
              }
              final pose = LogoPose(
                cardDy: -60 * unit * (1 - card),
                cardOpacity: card,
                tackDy: tackDy,
                tackOpacity: tack <= 0 ? 0 : (tack / 0.55).clamp(0.0, 1.0),
                tackScaleX: sx,
                tackScaleY: sy,
              );

              final fly = span(_settled.toDouble(), (_settled + _fly).toDouble());
              var offset = Offset.zero;
              var scale = 1.0;
              if (fly > 0) {
                _measure(box.biggest);
                final k = Motion.easeOut.transform(fly);
                offset = _to! * k;
                scale = 1 + (_toScale - 1) * k;
              }
              return Stack(
                fit: StackFit.expand,
                children: [
                  ColoredBox(color: t.bg.withValues(alpha: 1 - Curves.easeOut.transform(fly))),
                  Center(
                    child: Transform.translate(
                      offset: offset,
                      child: Transform.scale(
                        scale: scale,
                        child: CustomPaint(size: const Size.square(_size), painter: LogoPainter(colors, pose)),
                      ),
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}
