import 'dart:math';

final _rng = Random.secure();

/// UUIDv7 (shared/src/ids.ts): time-ordered, and safe to generate with no connection.
String newId([int? nowMs]) {
  final now = nowMs ?? DateTime.now().millisecondsSinceEpoch;
  final b = List<int>.generate(16, (_) => _rng.nextInt(256));
  for (var i = 0; i < 6; i++) {
    b[i] = (now ~/ pow(2, 8 * (5 - i))) % 256;
  }
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
  return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
}

/// The node part of this phone's clock: 8 random characters, made once and kept.
String newNodeId() {
  const alphabet = '0123456789abcdef';
  return List.generate(8, (_) => alphabet[_rng.nextInt(16)]).join();
}
