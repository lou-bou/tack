import 'dart:async';

import 'package:flutter/gestures.dart';
import 'package:flutter/services.dart';
import 'package:kit/kit.dart';
import 'package:material_ui/material_ui.dart';

import 'common.dart';

/// A long press (~250ms) lifts things on a phone (SPEC §3.3).
const liftDelay = Duration(milliseconds: 250);

/// Reports a long press and the finger's travel after it. Before the press is recognised the
/// touch still scrolls and swipes as usual.
class LiftDetector extends StatelessWidget {
  const LiftDetector({
    super.key,
    required this.child,
    required this.onStart,
    required this.onMove,
    required this.onEnd,
    this.enabled = true,
  });

  final Widget child;
  final bool enabled;
  final void Function(Offset global) onStart;
  final void Function(Offset global) onMove;

  /// [cancelled] when the system took the touch away.
  final void Function(bool cancelled) onEnd;

  @override
  Widget build(BuildContext context) {
    if (!enabled) return child;
    return RawGestureDetector(
      behavior: HitTestBehavior.opaque,
      gestures: {
        LongPressGestureRecognizer: GestureRecognizerFactoryWithHandlers<LongPressGestureRecognizer>(
          () => LongPressGestureRecognizer(duration: liftDelay),
          (r) {
            r
              ..onLongPressStart = ((d) => onStart(d.globalPosition))
              ..onLongPressMoveUpdate = ((d) => onMove(d.globalPosition))
              ..onLongPressEnd = ((_) => onEnd(false))
              ..onLongPressCancel = (() => onEnd(true));
          },
        ),
      },
      child: child,
    );
  }
}

/// What follows the finger: the lifted thing, scaled to 1.03 and tilted 2° with its floating
/// shadow (DESIGN.md "Motion"). With reduced motion it has no tilt or scale.
class DragProxy {
  OverlayEntry? _entry;
  final _topLeft = ValueNotifier(Offset.zero);

  bool get showing => _entry != null;

  void show(BuildContext context, {required Rect from, required Widget child, double radius = 10}) {
    hide();
    _topLeft.value = from.topLeft;
    final still = MediaQuery.disableAnimationsOf(context);
    final entry = OverlayEntry(
      builder: (context) => ValueListenableBuilder<Offset>(
        valueListenable: _topLeft,
        builder: (context, at, inner) => Positioned(left: at.dx, top: at.dy, width: from.width, child: inner!),
        child: IgnorePointer(
          child: TweenAnimationBuilder<double>(
            tween: Tween(begin: 0, end: 1),
            duration: still ? Duration.zero : Motion.fast,
            curve: Motion.easeOut,
            builder: (context, v, inner) => Transform.rotate(
              angle: still ? 0 : 0.035 * v,
              child: Transform.scale(scale: still ? 1 : 1 + 0.03 * v, child: inner),
            ),
            child: DecoratedBox(
              decoration: floatingDecoration(context, radius: radius),
              child: Material(type: MaterialType.transparency, child: child),
            ),
          ),
        ),
      ),
    );
    _entry = entry;
    Overlay.of(context, rootOverlay: true).insert(entry);
  }

  void moveTo(Offset topLeft) => _topLeft.value = topLeft;

  void hide() {
    _entry?.remove();
    _entry = null;
  }
}

/// Where children of one group are measured from, so their positions don't change with scrolling.
class FlipScope extends InheritedWidget {
  const FlipScope({super.key, required this.origin, required this.animate, required super.child});

  /// A box that scrolls along with the children (the list's own column).
  final GlobalKey origin;

  /// Only slide while something is being dragged: other layout changes should just happen.
  final bool animate;

  @override
  bool updateShouldNotify(FlipScope old) => old.animate != animate || old.origin != origin;
}

/// Slides its child from where it was to where it is now, so cards and tiles move aside
/// smoothly while something is dragged past them.
class Flip extends StatefulWidget {
  const Flip({super.key, required this.child});
  final Widget child;

  @override
  State<Flip> createState() => _FlipState();
}

class _FlipState extends State<Flip> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 180), value: 1);
  Offset? _last;
  Offset _from = Offset.zero;

  Offset get _shift => _from * (1 - Motion.easeOut.transform(_c.value));

  void _measure() {
    if (!mounted) return;
    final scope = context.dependOnInheritedWidgetOfExactType<FlipScope>();
    final box = context.findRenderObject() as RenderBox?;
    final origin = scope?.origin.currentContext?.findRenderObject() as RenderBox?;
    if (scope == null || box == null || origin == null || !box.attached || !origin.attached || !box.hasSize) return;
    final at = box.localToGlobal(Offset.zero, ancestor: origin);
    final last = _last;
    _last = at;
    if (last == null || last == at) return;
    if (!scope.animate || MediaQuery.disableAnimationsOf(context)) {
      _from = Offset.zero;
      return;
    }
    // Start from where it is drawn right now, which may be mid-slide.
    _from = last + _shift - at;
    _c.forward(from: 0);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    WidgetsBinding.instance.addPostFrameCallback((_) => _measure());
    return AnimatedBuilder(
      animation: _c,
      // Always a Transform, so the child's state (a drag in progress) survives the slide ending.
      builder: (context, child) => Transform.translate(offset: _c.value == 1 ? Offset.zero : _shift, child: child),
      child: widget.child,
    );
  }
}

/// The box of a keyed widget, in screen coordinates.
Rect? rectOf(GlobalKey key) {
  final box = key.currentContext?.findRenderObject() as RenderBox?;
  if (box == null || !box.attached || !box.hasSize) return null;
  return box.localToGlobal(Offset.zero) & box.size;
}

/// Scrolls a list while a finger holds something near its top or bottom edge.
class EdgeScroller {
  Timer? _timer;

  /// [viewport] is the scrolling area on screen; [pointer] the finger. [onScrolled] lets the
  /// caller work out again what is under the finger.
  void update(
    ScrollController? controller,
    Rect? viewport,
    Offset pointer,
    VoidCallback onScrolled, {
    Axis axis = Axis.vertical,
  }) {
    stop();
    if (controller == null || viewport == null || !controller.hasClients) return;
    const edge = 56.0;
    final p = axis == Axis.vertical ? pointer.dy : pointer.dx;
    final start = axis == Axis.vertical ? viewport.top : viewport.left;
    final end = axis == Axis.vertical ? viewport.bottom : viewport.right;
    double speed = 0;
    if (p < start + edge) speed = -((start + edge - p) / edge).clamp(0.0, 1.0);
    if (p > end - edge) speed = ((p - (end - edge)) / edge).clamp(0.0, 1.0);
    if (speed == 0) return;
    _timer = Timer.periodic(const Duration(milliseconds: 16), (_) {
      if (!controller.hasClients) return stop();
      final pos = controller.position;
      final next = (pos.pixels + speed * 12).clamp(pos.minScrollExtent, pos.maxScrollExtent);
      if (next == pos.pixels) return stop();
      controller.jumpTo(next);
      onScrolled();
    });
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
  }
}

/// A group of things that can be put in another order by a long press and a drag: the board
/// tiles (a grid) and the list names in a board's strip (a row).
class Reorderable extends StatefulWidget {
  const Reorderable({
    super.key,
    required this.ids,
    required this.itemBuilder,
    required this.layout,
    required this.onMove,
    this.axis,
    this.enabled = true,
    this.scroll,
    this.radius = 10,
  });

  final List<String> ids;

  /// [lifted] is true for the copy under the finger, which must not reuse keys.
  final Widget Function(BuildContext context, String id, bool lifted) itemBuilder;
  final Widget Function(List<Widget> children) layout;

  /// The item was dropped at [index] among the others (the list without it).
  final void Function(String id, int index) onMove;

  /// A row or column swaps when the finger passes the middle of a neighbour; a grid (null) when
  /// it is over one.
  final Axis? axis;
  final bool enabled;
  final ScrollController? scroll;
  final double radius;

  @override
  State<Reorderable> createState() => _ReorderableState();
}

class _ReorderableState extends State<Reorderable> {
  final _keys = <String, GlobalKey>{};
  final _origin = GlobalKey();
  final _proxy = DragProxy();
  final _edge = EdgeScroller();
  List<String>? _order;
  String? _dragging;
  Offset _grab = Offset.zero;
  Offset _pointer = Offset.zero;

  GlobalKey _key(String id) => _keys.putIfAbsent(id, () => GlobalKey());

  void _start(String id, Offset global) {
    final rect = rectOf(_key(id));
    if (rect == null) return;
    HapticFeedback.mediumImpact();
    _grab = global - rect.topLeft;
    _pointer = global;
    _proxy.show(context, from: rect, radius: widget.radius, child: widget.itemBuilder(context, id, true));
    setState(() {
      _order = [...widget.ids];
      _dragging = id;
    });
  }

  void _move(Offset global) {
    if (_dragging == null) return;
    _pointer = global;
    _proxy.moveTo(global - _grab);
    _retarget();
    final scroll = widget.scroll;
    if (scroll != null && scroll.hasClients) {
      final box = scroll.position.context.storageContext.findRenderObject() as RenderBox?;
      final viewport = box == null ? null : box.localToGlobal(Offset.zero) & box.size;
      _edge.update(scroll, viewport, global, _retarget, axis: scroll.position.axis);
    }
  }

  void _retarget() {
    final order = _order;
    final id = _dragging;
    if (order == null || id == null) return;
    final from = order.indexOf(id);
    for (var i = 0; i < order.length; i++) {
      if (i == from) continue;
      final rect = rectOf(_key(order[i]));
      if (rect == null || !rect.contains(_pointer)) continue;
      final axis = widget.axis;
      if (axis != null) {
        final p = axis == Axis.horizontal ? _pointer.dx : _pointer.dy;
        final mid = axis == Axis.horizontal ? rect.center.dx : rect.center.dy;
        if (i > from ? p < mid : p > mid) return;
      }
      HapticFeedback.selectionClick();
      setState(() {
        order
          ..removeAt(from)
          ..insert(i, id);
      });
      return;
    }
  }

  void _end(bool cancelled) {
    final order = _order;
    final id = _dragging;
    _edge.stop();
    _proxy.hide();
    if (order == null || id == null) return;
    final to = order.indexOf(id);
    final moved = !cancelled && to != widget.ids.indexOf(id);
    setState(() {
      _order = null;
      _dragging = null;
    });
    if (moved) widget.onMove(id, to);
  }

  @override
  void dispose() {
    _edge.stop();
    _proxy.hide();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Anything that arrived or left mid-drag (a sync) is simply shown where the data puts it.
    final order = _order != null && _order!.toSet().containsAll(widget.ids) && _order!.length == widget.ids.length
        ? _order!
        : widget.ids;
    _keys.removeWhere((id, _) => !widget.ids.contains(id));
    return FlipScope(
      origin: _origin,
      animate: _dragging != null,
      child: KeyedSubtree(
        key: _origin,
        child: widget.layout([
          for (final id in order)
            KeyedSubtree(
              key: _key(id),
              child: Flip(
                child: LiftDetector(
                  enabled: widget.enabled,
                  onStart: (g) => _start(id, g),
                  onMove: _move,
                  onEnd: _end,
                  child: Opacity(opacity: id == _dragging ? 0.4 : 1, child: widget.itemBuilder(context, id, false)),
                ),
              ),
            ),
        ]),
      ),
    );
  }
}
