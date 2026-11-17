import 'package:flutter/gestures.dart';
import 'package:kit/kit.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import '../theme.dart';

final _heading = RegExp(r'^(#{1,6}) +');
final _task = RegExp(r'^(\s*)([-*+]) \[( |x|X)\] ');
final _bullet = RegExp(r'^(\s*)([-*+]) ');
final _quote = RegExp(r'^> ?');
final _fence = RegExp(r'^\s*```');
final _inline = RegExp(
  r'(\*\*[^*\n]+\*\*)|(~~[^~\n]+~~)|(`[^`\n]+`)|(\[[^\]\n]+\]\([^)\s]+\))|(\*[^*\s\n][^*\n]*\*)|(_[^_\s\n][^_\n]*_)',
);
final _link = RegExp(r'^\[([^\]]+)\]\(([^)\s]+)\)$');

/// Draws a description's Markdown with its formatting: headings, lists, checkbox lists, bold,
/// italic, strikethrough, code and links. The text stays plain Markdown; only how it's drawn
/// changes.
///
/// While editing ([preview] false) every character stays, so the cursor never jumps, and the
/// Markdown marks are drawn faint. In [preview] the marks are hidden, a bullet stands for `-`,
/// and checkboxes and links can be tapped.
class MarkdownStyler {
  MarkdownStyler(this.context, this.base, {required this.preview, this.onToggleTask});

  final BuildContext context;
  final TextStyle base;
  final bool preview;

  /// A checkbox was tapped; the offset is where its `[ ]` starts in the text.
  final void Function(int offset)? onToggleTask;

  final List<GestureRecognizer> recognizers = [];

  TextStyle get _faint =>
      base.copyWith(color: context.kit.textFaint, fontWeight: FontWeight.w400, decoration: TextDecoration.none);

  TextSpan build(String text) {
    final lines = text.split('\n');
    final out = <InlineSpan>[];
    var offset = 0;
    var inFence = false;
    for (var i = 0; i < lines.length; i++) {
      final line = lines[i];
      final last = i == lines.length - 1;
      if (_fence.hasMatch(line)) {
        inFence = !inFence;
        out.add(
          TextSpan(
            text: line,
            style: _code().copyWith(color: context.kit.textFaint),
          ),
        );
      } else if (inFence) {
        out.add(TextSpan(text: line, style: _code()));
      } else {
        out.addAll(_line(line, offset));
      }
      if (!last) out.add(TextSpan(text: '\n', style: base));
      offset += line.length + 1;
    }
    return TextSpan(style: base, children: out);
  }

  TextStyle _code() =>
      base.copyWith(fontFamily: tackMono, fontSize: (base.fontSize ?? 15) - 1, backgroundColor: context.tack.list);

  List<InlineSpan> _line(String line, int offset) {
    final h = _heading.firstMatch(line);
    if (h != null) {
      final level = h.group(1)!.length;
      final size = switch (level) {
        1 => 22.0,
        2 => 19.0,
        3 => 17.0,
        _ => 15.0,
      };
      final style = base.copyWith(fontSize: size, fontWeight: FontWeight.w700, height: 1.35);
      return [
        if (!preview)
          TextSpan(
            text: h.group(0),
            style: _faint.copyWith(fontSize: size),
          ),
        ..._inlineSpans(line.substring(h.end), style),
      ];
    }
    final task = _task.firstMatch(line);
    if (task != null) {
      final done = task.group(3)!.toLowerCase() == 'x';
      final rest = line.substring(task.end);
      final style = done
          ? base.copyWith(
              color: context.tack.ink3,
              decoration: TextDecoration.lineThrough,
              decorationColor: context.tack.ink3,
            )
          : base;
      final boxAt = offset + task.group(1)!.length + 2;
      if (!preview) {
        return [TextSpan(text: task.group(0), style: _faint), ..._inlineSpans(rest, style)];
      }
      return [
        TextSpan(text: task.group(1)),
        WidgetSpan(
          alignment: PlaceholderAlignment.middle,
          child: _TaskBox(done: done, onTap: onToggleTask == null ? null : () => onToggleTask!(boxAt)),
        ),
        const TextSpan(text: ' '),
        ..._inlineSpans(rest, style),
      ];
    }
    final bullet = _bullet.firstMatch(line);
    if (bullet != null) {
      final rest = line.substring(bullet.end);
      return [
        if (preview)
          TextSpan(
            text: '${bullet.group(1)}•  ',
            style: base.copyWith(color: context.kit.textMuted),
          )
        else
          TextSpan(text: bullet.group(0), style: _faint),
        ..._inlineSpans(rest, base),
      ];
    }
    final quote = _quote.firstMatch(line);
    if (quote != null) {
      final style = base.copyWith(color: context.kit.textMuted, fontStyle: FontStyle.italic);
      return [
        if (preview)
          TextSpan(
            text: '▍ ',
            style: base.copyWith(color: context.kit.borderStrong),
          )
        else
          TextSpan(text: quote.group(0), style: _faint),
        ..._inlineSpans(line.substring(quote.end), style),
      ];
    }
    return _inlineSpans(line, base);
  }

  List<InlineSpan> _inlineSpans(String text, TextStyle style) {
    final out = <InlineSpan>[];
    var at = 0;
    for (final m in _inline.allMatches(text)) {
      if (m.start > at) out.add(TextSpan(text: text.substring(at, m.start), style: style));
      final token = m.group(0)!;
      if (m.group(1) != null) {
        out.addAll(_wrapped(token, 2, style.copyWith(fontWeight: FontWeight.w700)));
      } else if (m.group(2) != null) {
        out.addAll(_wrapped(token, 2, style.copyWith(decoration: TextDecoration.lineThrough)));
      } else if (m.group(3) != null) {
        out.addAll(_wrapped(token, 1, _code().copyWith(color: style.color)));
      } else if (m.group(4) != null) {
        out.addAll(_linkSpans(token, style));
      } else {
        out.addAll(_wrapped(token, 1, style.copyWith(fontStyle: FontStyle.italic)));
      }
      at = m.end;
    }
    if (at < text.length) out.add(TextSpan(text: text.substring(at), style: style));
    return out;
  }

  List<InlineSpan> _wrapped(String token, int mark, TextStyle inner) {
    final body = token.substring(mark, token.length - mark);
    if (preview) return [TextSpan(text: body, style: inner)];
    final m = token.substring(0, mark);
    return [TextSpan(text: m, style: _faint), TextSpan(text: body, style: inner), TextSpan(text: m, style: _faint)];
  }

  List<InlineSpan> _linkSpans(String token, TextStyle style) {
    final m = _link.firstMatch(token)!;
    final label = m.group(1)!;
    final url = m.group(2)!;
    final linkStyle = style.copyWith(
      color: context.kit.accentText,
      decoration: TextDecoration.underline,
      decorationColor: context.kit.accentText,
    );
    if (!preview) {
      return [
        TextSpan(text: '[', style: _faint),
        TextSpan(text: label, style: linkStyle),
        TextSpan(text: ']($url)', style: _faint),
      ];
    }
    final safe = RegExp(r'^(https?:|mailto:)', caseSensitive: false).hasMatch(url);
    final tap = safe
        ? (TapGestureRecognizer()..onTap = () => launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication))
        : null;
    if (tap != null) recognizers.add(tap);
    return [TextSpan(text: label, style: linkStyle, recognizer: tap)];
  }

  void dispose() {
    for (final r in recognizers) {
      r.dispose();
    }
  }
}

class _TaskBox extends StatelessWidget {
  const _TaskBox({required this.done, this.onTap});
  final bool done;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    return Semantics(
      checked: done,
      label: done ? 'Done' : 'Not done',
      button: true,
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(0, 2, 4, 2),
          child: Container(
            width: 16,
            height: 16,
            decoration: BoxDecoration(
              color: done ? t.accent : null,
              border: Border.all(color: done ? t.accent : context.tack.ink3, width: 1.5),
              borderRadius: BorderRadius.circular(4),
            ),
            child: done ? Icon(LucideIcons.check, size: 12, color: t.onAccent) : null,
          ),
        ),
      ),
    );
  }
}

/// The description field's controller: styles the Markdown as it is typed, and carries a list
/// on when Enter is pressed at the end of an item (an empty item ends the list).
class MarkdownController extends TextEditingController {
  MarkdownController({super.text});

  @override
  set value(TextEditingValue next) {
    final prev = value;
    // One newline typed at the cursor.
    if (next.text.length == prev.text.length + 1 &&
        next.selection.isCollapsed &&
        next.selection.baseOffset > 0 &&
        next.text[next.selection.baseOffset - 1] == '\n' &&
        next.text.substring(0, next.selection.baseOffset - 1) ==
            prev.text.substring(0, next.selection.baseOffset - 1)) {
      final at = next.selection.baseOffset - 1;
      final lineStart = at == 0 ? 0 : next.text.lastIndexOf('\n', at - 1) + 1;
      final line = next.text.substring(lineStart, at);
      final task = _task.firstMatch(line);
      final bullet = task == null ? _bullet.firstMatch(line) : null;
      final marker = task != null ? '${task.group(1)}${task.group(2)} [ ] ' : bullet?.group(0);
      if (marker != null) {
        final matched = (task ?? bullet)!.group(0)!;
        if (line.trim() == matched.trim()) {
          // Enter on an empty item: drop its marker and end the list.
          final text = next.text.substring(0, lineStart) + next.text.substring(at);
          super.value = TextEditingValue(
            text: text,
            selection: TextSelection.collapsed(offset: lineStart),
          );
          return;
        }
        final text = next.text.substring(0, at + 1) + marker + next.text.substring(at + 1);
        super.value = TextEditingValue(
          text: text,
          selection: TextSelection.collapsed(offset: at + 1 + marker.length),
        );
        return;
      }
    }
    super.value = next;
  }

  @override
  TextSpan buildTextSpan({required BuildContext context, TextStyle? style, required bool withComposing}) {
    final base = style ?? DefaultTextStyle.of(context).style;
    if (withComposing && value.isComposingRangeValid) {
      // Keep the keyboard's underline on the word being composed: style around it plainly.
      return super.buildTextSpan(context: context, style: base, withComposing: withComposing);
    }
    return MarkdownStyler(context, base, preview: false).build(text);
  }
}

/// Flips the `[ ]` or `[x]` that starts at [offset].
String toggleTaskAt(String text, int offset) {
  if (offset < 0 || offset + 3 > text.length) return text;
  final box = text.substring(offset, offset + 3);
  final next = box.toLowerCase() == '[x]' ? '[ ]' : (box == '[ ]' ? '[x]' : null);
  return next == null ? text : text.replaceRange(offset, offset + 3, next);
}
