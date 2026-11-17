/// Fractional position strings, ported from shared/src/positions.ts and the
/// `fractional-indexing` package it uses (base 62 digits, base 52 integer heads), so positions
/// made on the phone sort the same way as positions made on the web.
library;

import 'dart:math';

const _digits = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const _intDigits = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

int _idx(String digits, String ch) => digits.indexOf(ch);

int _cmp(String a, String b) => a.compareTo(b);

String _midpoint(String a, String? b) {
  final zero = _digits[0];
  if (b != null && _cmp(a, b) >= 0) throw StateError('$a >= $b');
  if ((a.isNotEmpty && a[a.length - 1] == zero) || (b != null && b.isNotEmpty && b[b.length - 1] == zero)) {
    throw StateError('trailing zero');
  }
  if (b != null) {
    var n = 0;
    while ((n < a.length ? a[n] : zero) == (n < b.length ? b[n] : null)) {
      n++;
    }
    if (n > 0) {
      return b.substring(0, n) + _midpoint(a.length > n ? a.substring(n) : '', b.substring(n));
    }
  }
  final digitA = a.isNotEmpty ? _idx(_digits, a[0]) : 0;
  final digitB = b != null && b.isNotEmpty ? _idx(_digits, b[0]) : _digits.length;
  if (digitB - digitA > 1) {
    final mid = (0.5 * (digitA + digitB)).round();
    return _digits[mid];
  }
  if (b != null && b.length > 1) return b.substring(0, 1);
  return _digits[digitA] + _midpoint(a.length > 1 ? a.substring(1) : '', null);
}

int _intLength(String head) {
  final i = _idx(_intDigits, head);
  if (i < 0) throw StateError('invalid order key head: $head');
  final half = _intDigits.length ~/ 2;
  return i < half ? half - i + 1 : i - half + 2;
}

String _intPart(String key) {
  final len = _intLength(key[0]);
  if (len > key.length) throw StateError('invalid order key: $key');
  return key.substring(0, len);
}

bool _isSmallest(String key) => key == _intDigits[0] + _digits[0] * (_intDigits.length ~/ 2);

void _validate(String key) {
  if (_isSmallest(key)) throw StateError('invalid order key: $key');
  final i = _intPart(key);
  final f = key.substring(i.length);
  if (f.isNotEmpty && f[f.length - 1] == _digits[0]) throw StateError('invalid order key: $key');
}

String? _increment(String x) {
  final head = x[0];
  final zero = _digits[0];
  var trailing = '';
  for (var i = x.length - 1; i >= 1; i--) {
    final d = _idx(_digits, x[i]) + 1;
    if (d == _digits.length) {
      trailing = zero + trailing;
    } else {
      return head + x.substring(1, i) + _digits[d] + trailing;
    }
  }
  final hi = _idx(_intDigits, head);
  if (hi == _intDigits.length - 1) return null;
  final h = _intDigits[hi + 1];
  final delta = _intLength(h) - _intLength(head);
  return h +
      (delta > 0
          ? trailing + zero
          : delta < 0
          ? trailing.substring(1)
          : trailing);
}

String? _decrement(String x) {
  final head = x[0];
  final last = _digits[_digits.length - 1];
  var trailing = '';
  for (var i = x.length - 1; i >= 1; i--) {
    final d = _idx(_digits, x[i]) - 1;
    if (d == -1) {
      trailing = last + trailing;
    } else {
      return head + x.substring(1, i) + _digits[d] + trailing;
    }
  }
  final hi = _idx(_intDigits, head);
  if (hi == 0) return null;
  final h = _intDigits[hi - 1];
  final delta = _intLength(h) - _intLength(head);
  return h +
      (delta > 0
          ? trailing + last
          : delta < 0
          ? trailing.substring(1)
          : trailing);
}

/// A key strictly between [a] and [b] (either may be null for "no bound").
String generateKeyBetween(String? a, String? b) {
  if (a != null) _validate(a);
  if (b != null) _validate(b);
  if (a != null && b != null && _cmp(a, b) > 0) {
    final t = a;
    a = b;
    b = t;
  }
  if (a == null) {
    if (b == null) return _intDigits[_intDigits.length ~/ 2] + _digits[0];
    final ib = _intPart(b);
    final fb = b.substring(ib.length);
    if (_isSmallest(ib)) return ib + _midpoint('', fb);
    if (_cmp(ib, b) < 0) return ib;
    final res = _decrement(ib);
    if (res == null) throw StateError('cannot decrement any more');
    return res;
  }
  if (b == null) {
    final ia = _intPart(a);
    final fa = a.substring(ia.length);
    final i = _increment(ia);
    return i ?? ia + _midpoint(fa, null);
  }
  final ia = _intPart(a);
  final fa = a.substring(ia.length);
  final ib = _intPart(b);
  final fb = b.substring(ib.length);
  if (ia == ib) return ia + _midpoint(fa, fb);
  final i = _increment(ia);
  if (i == null) throw StateError('cannot increment any more');
  if (_cmp(i, b) < 0) return i;
  return ia + _midpoint(fa, null);
}

final _random = Random();

/// A random walk over nearby keys means two devices inserting at the same spot offline almost
/// never pick the same key, and if they do, `id` breaks the tie.
String positionBetween(String? before, String? after, [double Function()? random]) {
  final rnd = random ?? _random.nextDouble;
  var lo = before;
  var hi = after;
  var key = generateKeyBetween(lo, hi);
  for (var i = 0; i < 4; i++) {
    if (rnd() < 0.5) {
      lo = key;
      key = generateKeyBetween(key, hi);
    } else {
      hi = key;
      key = generateKeyBetween(lo, key);
    }
  }
  return key;
}

/// Anything that has a place in an order.
abstract interface class Ordered {
  String get id;
  String get position;
}

int byPosition(Ordered a, Ordered b) {
  if (a.position != b.position) return a.position.compareTo(b.position) < 0 ? -1 : 1;
  return a.id.compareTo(b.id).sign;
}

/// The position for an item placed at [index] in [sorted], which must not include the item
/// itself. Two neighbours with equal positions (a rare offline collision) have nothing between
/// them, so the item goes after all of the equal ones.
String positionAt(List<Ordered> sorted, int index, [double Function()? random]) {
  final before = index - 1 >= 0 && index - 1 < sorted.length ? sorted[index - 1].position : null;
  var next = index;
  while (before != null && next < sorted.length && sorted[next].position.compareTo(before) <= 0) {
    next += 1;
  }
  return positionBetween(before, next >= 0 && next < sorted.length ? sorted[next].position : null, random);
}

String positionAtEnd(List<Ordered> sorted, [double Function()? random]) => positionAt(sorted, sorted.length, random);

/// The position for an item dropped into a list where only some items are on screen
/// ([visibleOrder], after the drop, ids only). It lands next to its visible neighbour, and hidden
/// items keep their own positions, so a completed card comes back where it was when unticked.
/// [siblings] is every item in the list, sorted, without the moved one.
String dropPosition(List<Ordered> siblings, List<String> visibleOrder, String movedId, [double Function()? random]) {
  final at = visibleOrder.indexOf(movedId);
  int indexOf(int i) => i >= 0 && i < visibleOrder.length ? siblings.indexWhere((s) => s.id == visibleOrder[i]) : -1;
  // JS reads visibleOrder[at + 1] with at = -1 as the first item, so keep that.
  final next = indexOf(at + 1);
  if (next >= 0) return positionAt(siblings, next, random);
  final previous = indexOf(at - 1);
  if (previous >= 0) return positionAt(siblings, previous + 1, random);
  return positionAtEnd(siblings, random);
}
