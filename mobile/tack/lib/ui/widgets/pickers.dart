import 'package:flutter/services.dart';
import 'package:kit/kit.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:material_ui/material_ui.dart';

import '../../data/dates.dart';
import '../../data/model.dart';
import '../theme.dart';
import 'common.dart';

/// A few dozen emoji that suit a board. Anything else can be typed from the keyboard.
const _emoji = [
  '📚',
  '🎓',
  '✏️',
  '📝',
  '🧪',
  '🔬',
  '📐',
  '🧮',
  '💻',
  '🖥️',
  '⌨️',
  '🧠',
  '💼',
  '📈',
  '💰',
  '🧾',
  '📦',
  '🛠️',
  '⚙️',
  '📞',
  '✉️',
  '🗂️',
  '📅',
  '⏰',
  '🏠',
  '🧹',
  '🛒',
  '🍳',
  '🌱',
  '🚗',
  '✈️',
  '🧳',
  '🏋️',
  '🏃',
  '⚽',
  '🎮',
  '🎵',
  '🎬',
  '📷',
  '🎨',
  '🗣️',
  '🌍',
  '🇩🇿',
  '🇫🇷',
  '🇬🇧',
  '🇩🇪',
  '🇪🇸',
  '🇯🇵',
  '❤️',
  '⭐',
  '🔥',
  '✅',
  '🎯',
  '💡',
  '🚀',
  '🧩',
  '🔒',
  '🎁',
  '☕',
  '🌙',
];

/// A grid of emoji plus a field for the keyboard's own emoji. One emoji only.
class EmojiPicker extends StatefulWidget {
  const EmojiPicker({super.key, required this.onPick});
  final ValueChanged<String> onPick;

  @override
  State<EmojiPicker> createState() => _EmojiPickerState();
}

class _EmojiPickerState extends State<EmojiPicker> {
  final _field = TextEditingController();

  @override
  void dispose() {
    _field.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        GridView.count(
          crossAxisCount: 8,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          children: [
            for (final e in _emoji)
              Pressable(
                semanticLabel: e,
                onTap: () => widget.onPick(e),
                child: Center(child: Text(e, style: const TextStyle(fontSize: 24))),
              ),
          ],
        ),
        const SizedBox(height: Space.s3),
        TextField(
          controller: _field,
          decoration: const InputDecoration(hintText: 'Or type one from your keyboard'),
          textInputAction: TextInputAction.done,
          onChanged: (text) {
            final typed = text.trim().characters;
            if (typed.isEmpty) return;
            // Letters and digits are not emoji.
            final first = typed.first;
            if (RegExp(r'^[\x00-\x7F]+$').hasMatch(first)) return;
            widget.onPick(first);
          },
        ),
      ],
    );
  }
}

/// The ten board colours as swatches (DESIGN.md "Board colours").
class ColorPicker extends StatelessWidget {
  const ColorPicker({super.key, required this.value, required this.onChanged});
  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    return Wrap(
      spacing: Space.s2,
      runSpacing: Space.s2,
      children: [
        for (final color in boardColors)
          Semantics(
            label: color,
            selected: color == value,
            button: true,
            excludeSemantics: true,
            child: Pressable(
              onTap: () => onChanged(color),
              child: Container(
                width: 48,
                height: 48,
                alignment: Alignment.center,
                child: AnimatedContainer(
                  duration: Motion.fast,
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: context.tack.board(color),
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: color == value ? t.accent : t.borderStrong,
                      width: color == value ? 2 : 1,
                    ),
                  ),
                  child: color == value ? Icon(LucideIcons.check, size: 18, color: t.text) : null,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// Types the colon of a 24-hour time for you: "1830" shows as "18:30".
class _TimeFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    var digits = newValue.text.replaceAll(RegExp(r'[^0-9]'), '');
    if (digits.length > 4) digits = digits.substring(0, 4);
    final deleting = newValue.text.length < oldValue.text.length;
    var text = digits;
    if (digits.length > 2 || (digits.length == 2 && !deleting)) {
      text = '${digits.substring(0, 2)}:${digits.substring(2)}';
    }
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}

/// Picks a date and an optional time (SPEC §3.5). Choosing a day saves and closes, so a preset
/// is two taps from the chip. [isValid] keeps start from passing due, including by time on the
/// same day. DD/MM/YYYY, 24-hour, weeks start on Sunday.
Future<void> showDatePickerSheet(
  BuildContext context, {
  required String label,
  required DateValue? value,
  required String defaultTime,
  required bool Function(DateValue candidate) isValid,
  required int now,
  required ValueChanged<DateValue?> onChange,
}) => showKitSheet<void>(
  context,
  builder: (context) =>
      _DatePicker(label: label, value: value, defaultTime: defaultTime, isValid: isValid, now: now, onChange: onChange),
);

class _DatePicker extends StatefulWidget {
  const _DatePicker({
    required this.label,
    required this.value,
    required this.defaultTime,
    required this.isValid,
    required this.now,
    required this.onChange,
  });
  final String label;
  final DateValue? value;
  final String defaultTime;
  final bool Function(DateValue candidate) isValid;
  final int now;
  final ValueChanged<DateValue?> onChange;

  @override
  State<_DatePicker> createState() => _DatePickerState();
}

class _DatePickerState extends State<_DatePicker> {
  late DateValue? _value = widget.value;
  late String _month = monthStart(widget.value?.date ?? todayString(widget.now));
  late bool _withTime = widget.value?.time != null;
  late final _timeText = TextEditingController(text: widget.value?.time ?? widget.defaultTime);

  String? get _time => parseTime(_timeText.text);
  String? get _timeForSave => _withTime ? _time : null;

  @override
  void dispose() {
    _timeText.dispose();
    super.dispose();
  }

  void _save(DateValue? v) {
    setState(() => _value = v);
    widget.onChange(v);
  }

  void _pick(String date) {
    if (_withTime && _time == null) return;
    HapticFeedback.selectionClick();
    widget.onChange(DateValue(date, _timeForSave));
    Navigator.of(context).pop();
  }

  void _toggleTime(bool on) {
    setState(() => _withTime = on);
    // With a date already set, the change applies right away, like every other edit.
    final v = _value;
    if (v == null) return;
    final candidate = DateValue(v.date, on ? _time : null);
    if ((!on || _time != null) && widget.isValid(candidate)) _save(candidate);
  }

  void _editTime(String text) {
    setState(() {});
    final parsed = parseTime(text);
    final v = _value;
    if (v == null || parsed == null) return;
    final candidate = DateValue(v.date, parsed);
    if (widget.isValid(candidate)) _save(candidate);
  }

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    final today = todayString(widget.now);
    final time = _time;
    bool allowed(String date) => widget.isValid(DateValue(date, _timeForSave));
    final conflict = _value != null && _withTime && time != null && !widget.isValid(DateValue(_value!.date, time));
    const presets = [
      (DatePreset.today, 'Today'),
      (DatePreset.tomorrow, 'Tomorrow'),
      (DatePreset.nextWeek, 'Next week'),
    ];

    return KitSheet(
      title: widget.label,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              for (final (i, p) in presets.indexed) ...[
                if (i > 0) const SizedBox(width: Space.s2),
                Expanded(
                  child: Builder(
                    builder: (context) {
                      final date = presetDate(p.$1, widget.now);
                      return KitButton(
                        label: p.$2,
                        small: true,
                        block: true,
                        onPressed: allowed(date) ? () => _pick(date) : null,
                      );
                    },
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: Space.s3),
          Row(
            children: [
              IconBtn(
                icon: LucideIcons.chevronLeft,
                label: 'Previous month',
                onTap: () => setState(() => _month = monthStart(_month, -1)),
              ),
              Expanded(
                child: Semantics(
                  liveRegion: true,
                  child: Text(formatMonth(_month), textAlign: TextAlign.center, style: context.text.titleSmall),
                ),
              ),
              IconBtn(
                icon: LucideIcons.chevronRight,
                label: 'Next month',
                onTap: () => setState(() => _month = monthStart(_month, 1)),
              ),
            ],
          ),
          Row(
            children: [
              for (final d in weekdayNames)
                Expanded(
                  child: ExcludeSemantics(
                    child: Text(d, textAlign: TextAlign.center, style: context.text.labelMedium),
                  ),
                ),
            ],
          ),
          const SizedBox(height: Space.s1),
          for (final week in monthWeeks(_month))
            Row(
              children: [
                for (final date in week)
                  Expanded(
                    child: _DayButton(
                      date: date,
                      outside: !date.startsWith(_month.substring(0, 7)),
                      today: date == today,
                      selected: _value?.date == date,
                      onTap: allowed(date) ? () => _pick(date) : null,
                    ),
                  ),
              ],
            ),
          const SizedBox(height: Space.s2),
          Pressable(
            scale: 1,
            onTap: () => _toggleTime(!_withTime),
            child: SizedBox(
              height: controlHeight,
              child: Row(
                children: [
                  Expanded(child: Text('Add time', style: context.text.bodyLarge)),
                  IgnorePointer(
                    child: Switch(value: _withTime, onChanged: (_) {}, activeTrackColor: t.accent),
                  ),
                ],
              ),
            ),
          ),
          if (_withTime)
            KitField(
              label: 'Time (24-hour)',
              error: time == null ? 'Enter a time like 18:30.' : (conflict ? "Start can't be after due." : null),
              child: TextField(
                controller: _timeText,
                keyboardType: TextInputType.number,
                inputFormatters: [_TimeFormatter()],
                textInputAction: TextInputAction.done,
                style: context.mono(16, color: t.text),
                decoration: const InputDecoration(hintText: 'HH:MM'),
                onChanged: _editTime,
                onSubmitted: (_) {
                  if (_value != null && time != null && !conflict) Navigator.of(context).pop();
                },
              ),
            ),
          if (_value != null) ...[
            const SizedBox(height: Space.s3),
            KitButton(
              label: 'Clear date',
              icon: LucideIcons.x,
              variant: ButtonVariant.negative,
              block: true,
              onPressed: () {
                widget.onChange(null);
                Navigator.of(context).pop();
              },
            ),
          ],
        ],
      ),
    );
  }
}

class _DayButton extends StatelessWidget {
  const _DayButton({
    required this.date,
    required this.outside,
    required this.today,
    required this.selected,
    this.onTap,
  });
  final String date;
  final bool outside;
  final bool today;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    final day = int.parse(date.substring(8));
    return Semantics(
      label: '$day, ${formatDate(date)}',
      selected: selected,
      button: true,
      enabled: onTap != null,
      excludeSemantics: true,
      child: Pressable(
        onTap: onTap,
        haptic: false,
        child: Container(
          height: 42,
          alignment: Alignment.center,
          child: Container(
            width: 36,
            height: 36,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: selected ? t.accent : null,
              shape: BoxShape.circle,
              border: today && !selected ? Border.all(color: t.accent, width: 1.5) : null,
            ),
            child: Text(
              '$day',
              style: context.mono(
                14,
                color: selected ? t.onAccent : (outside ? context.tack.ink3 : t.text),
                weight: today ? FontWeight.w600 : FontWeight.w400,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
