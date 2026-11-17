import 'dart:convert';
import 'dart:io';

/// A tiny document store: one JSON file per key in the app's private folder.
///
/// Reads are synchronous on purpose, so cached data is on screen in the first frame. Writes go
/// to a temp file and are renamed into place, so a kill mid-write never leaves half a file.
class JsonStore {
  JsonStore(this.dir) {
    dir.createSync(recursive: true);
  }

  final Directory dir;
  final Map<String, Future<void>> _writes = {};

  File _file(String key) => File('${dir.path}/$key.json');

  Object? read(String key) {
    try {
      final f = _file(key);
      if (!f.existsSync()) return null;
      return jsonDecode(f.readAsStringSync());
    } catch (_) {
      return null;
    }
  }

  /// Writes for the same key run one after another, in call order.
  Future<void> write(String key, Object? value) {
    final previous = _writes[key] ?? Future<void>.value();
    final next = previous.then((_) async {
      try {
        final tmp = File('${dir.path}/$key.json.tmp');
        await tmp.writeAsString(jsonEncode(value), flush: true);
        await tmp.rename(_file(key).path);
      } catch (_) {
        // The cache is best effort; a failed write only means a slower next launch.
      }
    });
    _writes[key] = next;
    return next;
  }

  Future<void> delete(String key) {
    final previous = _writes[key] ?? Future<void>.value();
    final next = previous.then((_) async {
      try {
        final f = _file(key);
        if (await f.exists()) await f.delete();
      } catch (_) {}
    });
    _writes[key] = next;
    return next;
  }
}
