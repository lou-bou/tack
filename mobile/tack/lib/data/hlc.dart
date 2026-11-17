/// Hybrid logical clock, ported from shared/src/hlc.ts. Values follow the time of the edit,
/// always move forward on one device even if its clock jumps back, and compare correctly as
/// plain strings: `<13-digit ms>:<4-digit counter>:<node>`.
library;

/// No real timestamp sorts below this, so it marks a field that has never been written.
const hlcZero = '0000000000000:0000:';

String formatHlc(int ms, int counter, String node) =>
    '${ms.toString().padLeft(13, '0')}:${counter.toString().padLeft(4, '0')}:$node';

int hlcMs(String hlc) => int.parse(hlc.substring(0, 13));

int hlcCounter(String hlc) => int.parse(hlc.substring(14, 18));

class HlcClock {
  HlcClock(this.node, {int Function()? wall, int ms = 0, int counter = 0})
    : _wall = wall ?? (() => DateTime.now().millisecondsSinceEpoch),
      // ignore: prefer_initializing_formals
      _ms = ms,
      // ignore: prefer_initializing_formals
      _counter = counter;

  final String node;
  final int Function() _wall;
  int _ms;
  int _counter;
  int _offset = 0;

  /// What to save so the clock never goes back after a restart.
  ({int ms, int counter}) get snapshot => (ms: _ms, counter: _counter);

  /// Stamps a new edit.
  String now() {
    final wall = _wall() + _offset;
    if (wall > _ms) {
      _ms = wall;
      _counter = 0;
    } else {
      _counter += 1;
    }
    return formatHlc(_ms, _counter, node);
  }

  /// Moves past a clock seen from elsewhere, so the next edit here beats what this device saw.
  void observe(String hlc) {
    final ms = hlcMs(hlc);
    final counter = hlcCounter(hlc);
    if (ms > _ms || (ms == _ms && counter > _counter)) {
      _ms = ms;
      _counter = counter;
    }
  }

  /// Corrects for a wrong device clock, using the server's time from its latest response.
  void syncWall(int serverMs) {
    _offset = serverMs - _wall();
  }
}

const _maxFutureMs = 5 * 60000;

/// Limits how far ahead a clock can be, so a phone with a wrong clock can't win every conflict.
String clampHlc(String hlc, int serverNow) {
  final limit = serverNow + _maxFutureMs;
  if (hlcMs(hlc) <= limit) return hlc;
  final node = hlc.substring(19);
  return formatHlc(limit, hlcCounter(hlc), node);
}
