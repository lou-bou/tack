import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:material_ui/material_ui.dart';

import '../data/dates.dart';
import '../data/positions.dart';
import '../data/selection.dart';
import '../data/store.dart';
import 'bell.dart';
import 'card_page.dart';
import 'settings_page.dart';
import 'state.dart';
import 'theme.dart';
import 'widgets/card_face.dart';
import 'widgets/common.dart';
import 'widgets/drag.dart';

/// The last view chosen, Month or Week, kept on this phone.
const calendarViewPref = 'calendarView';

/// Cards on their due dates, a card with a start date on every day from start to due (SPEC
/// §3.7). Month shows dots per day with the chosen day's cards below; Week lists each day.
/// Long-press a card and drop it on another day to move its due date (keeping the time, and
/// shifting the start by as many days). Tap an empty day, or +, to add a card due that day.
class CalendarPage extends ConsumerStatefulWidget {
  const CalendarPage({super.key});

  @override
  ConsumerState<CalendarPage> createState() => _CalendarPageState();
}

class _CalendarPageState extends ConsumerState<CalendarPage> with Completion<CalendarPage> {
  late String _anchor = todayString(ref.read(nowProvider));
  late String _selectedDay = _anchor;
  final Set<String> _filter = {};
  final _scroll = ScrollController();

  final _dayKeys = <String, GlobalKey>{};
  final _proxy = DragProxy();
  final _edge = EdgeScroller();
  CalendarEntry? _dragging;
  String? _overDay;
  Offset _grab = Offset.zero;
  Offset _pointer = Offset.zero;

  bool get _week => ref.read(prefProvider(calendarViewPref)) == 'week';

  @override
  void dispose() {
    _edge.stop();
    _proxy.hide();
    _scroll.dispose();
    super.dispose();
  }

  void _step(int direction) {
    HapticFeedback.selectionClick();
    setState(() {
      if (_week) {
        _anchor = addDays(_anchor, 7 * direction);
      } else {
        _anchor = monthStart(_anchor, direction);
        _selectedDay = _anchor;
      }
    });
  }

  void _goToday() {
    final today = todayString(ref.read(nowProvider));
    setState(() {
      _anchor = today;
      _selectedDay = today;
    });
  }

  void _add(String date, List<Board> boards) => showKitSheet<void>(
    context,
    builder: (context) => _QuickAdd(date: date, boards: boards),
  );

  // ---------- dragging to another day ----------

  void _lift(CalendarEntry entry, GlobalKey rowKey, Offset global) {
    final rect = rectOf(rowKey);
    if (rect == null) return;
    HapticFeedback.mediumImpact();
    _grab = global - rect.topLeft;
    _pointer = global;
    _proxy.show(
      context,
      from: rect,
      child: CardFace(
        card: entry.card,
        now: ref.read(nowProvider),
        listName: entry.listName,
        lifted: true,
        onToggle: (_, _) {},
        onOpen: (_) {},
      ),
    );
    setState(() => _dragging = entry);
  }

  void _move(Offset global) {
    if (_dragging == null) return;
    _pointer = global;
    _proxy.moveTo(global - _grab);
    _retarget();
    final box = _scroll.position.context.storageContext.findRenderObject() as RenderBox?;
    _edge.update(_scroll, box == null ? null : box.localToGlobal(Offset.zero) & box.size, global, _retarget);
  }

  void _retarget() {
    String? over;
    for (final e in _dayKeys.entries) {
      if (rectOf(e.value)?.contains(_pointer) ?? false) over = e.key;
    }
    if (over != _overDay) {
      if (over != null) HapticFeedback.selectionClick();
      setState(() => _overDay = over);
    }
  }

  void _drop(bool cancelled) {
    final entry = _dragging;
    final date = _overDay;
    _edge.stop();
    _proxy.hide();
    setState(() {
      _dragging = null;
      _overDay = null;
    });
    final due = entry?.card.due;
    if (cancelled || entry == null || date == null || due == null || due.date == date) return;
    final moved = moveDue(start: entry.card.start, due: due, to: date);
    ref.read(storeProvider.notifier).updateCard(entry.card.id, {
      'due': moved.due.toJson(),
      'start': moved.start?.toJson(),
    });
    HapticFeedback.lightImpact();
    SemanticsService.sendAnnouncement(View.of(context), 'Due date moved to ${formatDate(date)}', TextDirection.ltr);
  }

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    final lib = ref.watch(storeProvider);
    final now = ref.watch(nowProvider);
    final week = ref.watch(prefProvider(calendarViewPref)) == 'week';
    final today = todayString(now);
    final boards = lib.boards.values.where((b) => b.deletedAt == null).toList()..sort(byPosition);
    _filter.removeWhere((id) => !boards.any((b) => b.id == id));
    // A card playing its done animation still shows, as it was before the tick.
    final cards = [
      for (final c in lib.cards.values) lingering.contains(c.id) ? c.withFields({'completed': false}) : c,
    ];
    final entries = [
      for (final e in selectCalendar(lib.boards, lib.lists, cards, _filter))
        CalendarEntry(card: lib.cards[e.card.id]!, board: e.board, listName: e.listName, from: e.from, to: e.to),
    ];
    // A filter's boards come first when adding, since that's probably what you're looking at.
    final addBoards = [...boards]..sort((a, b) => (_filter.contains(b.id) ? 1 : 0) - (_filter.contains(a.id) ? 1 : 0));
    final days = weekOf(_anchor);
    final label = week ? '${formatDate(days.first)} – ${formatDate(days.last)}' : formatMonth(_anchor);

    Widget dayCards(String date) => _DayCards(
      entries: entriesOnDay(entries, date),
      now: now,
      lingering: lingering,
      dragging: _dragging?.card.id,
      onToggle: toggleCard,
      onLift: _lift,
      onMove: _move,
      onDrop: _drop,
    );

    final body = <Widget>[
      if (!week) ...[
        _WeekdayHeader(),
        GestureDetector(
          // Swipe the month sideways to change it.
          onHorizontalDragEnd: (d) {
            final v = d.primaryVelocity ?? 0;
            if (v.abs() > 300) _step(v < 0 ? 1 : -1);
          },
          child: Column(
            children: [
              for (final w in monthWeeks(_anchor))
                Row(
                  children: [
                    for (final date in w)
                      Expanded(
                        child: KeyedSubtree(
                          key: _dayKeys.putIfAbsent(date, GlobalKey.new),
                          child: _MonthDay(
                            date: date,
                            count: entries.where((e) => e.covers(date)).length,
                            outside: !date.startsWith(_anchor.substring(0, 7)),
                            today: date == today,
                            selected: date == _selectedDay,
                            over: date == _overDay,
                            onTap: () {
                              setState(() => _selectedDay = date);
                              if (!entries.any((e) => e.covers(date))) _add(date, addBoards);
                            },
                          ),
                        ),
                      ),
                  ],
                ),
            ],
          ),
        ),
        const SizedBox(height: Space.s3),
        _DayHeading(date: _selectedDay, today: _selectedDay == today, onAdd: () => _add(_selectedDay, addBoards)),
        dayCards(_selectedDay),
      ] else
        for (final date in days)
          KeyedSubtree(
            key: _dayKeys.putIfAbsent(date, GlobalKey.new),
            child: AnimatedContainer(
              duration: Motion.fast,
              margin: const EdgeInsets.only(bottom: Space.s2),
              padding: const EdgeInsets.symmetric(horizontal: Space.s2),
              decoration: BoxDecoration(
                color: date == _overDay ? t.accentSoft : null,
                borderRadius: BorderRadius.circular(TackRadii.list),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _DayHeading(date: date, today: date == today, weekday: true, onAdd: () => _add(date, addBoards)),
                  dayCards(date),
                ],
              ),
            ),
          ),
    ];

    return ColoredBox(
      color: t.bg,
      child: Column(
        children: [
          TopBar(title: 'Calendar', onFix: () => openConnection(context), actions: const [BellButton()]),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: Space.s2),
            child: Row(
              children: [
                IconBtn(
                  icon: LucideIcons.chevronLeft,
                  label: week ? 'Previous week' : 'Previous month',
                  onTap: () => _step(-1),
                  color: t.text,
                ),
                IconBtn(
                  icon: LucideIcons.chevronRight,
                  label: week ? 'Next week' : 'Next month',
                  onTap: () => _step(1),
                  color: t.text,
                ),
                const SizedBox(width: Space.s1),
                Expanded(
                  child: Semantics(
                    liveRegion: true,
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: week ? context.mono(14, color: t.text, weight: FontWeight.w600) : context.text.titleMedium,
                    ),
                  ),
                ),
                KitButton(label: 'Today', small: true, onPressed: _goToday),
                const SizedBox(width: Space.s2),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.s4, Space.s1, Space.s4, Space.s2),
            child: KitSegmented<String>(
              value: week ? 'week' : 'month',
              dense: true,
              options: const [SegOption('month', 'Month'), SegOption('week', 'Week')],
              onChanged: (v) => ref.read(prefsProvider.notifier).set(calendarViewPref, v),
            ),
          ),
          if (boards.isNotEmpty)
            SizedBox(
              height: 44,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: Space.s4, vertical: 4),
                children: [
                  FilterPill(label: 'All boards', on: _filter.isEmpty, onTap: () => setState(_filter.clear)),
                  for (final b in boards) ...[
                    const SizedBox(width: Space.s2),
                    FilterPill(
                      label: b.title,
                      on: _filter.contains(b.id),
                      onTap: () => setState(() => _filter.contains(b.id) ? _filter.remove(b.id) : _filter.add(b.id)),
                    ),
                  ],
                ],
              ),
            ),
          Expanded(
            child: ListView(
              controller: _scroll,
              padding: const EdgeInsets.fromLTRB(Space.s3, Space.s2, Space.s3, Space.s8),
              children: body,
            ),
          ),
        ],
      ),
    );
  }
}

class _WeekdayHeader extends StatelessWidget {
  @override
  Widget build(BuildContext context) => ExcludeSemantics(
    child: Padding(
      padding: const EdgeInsets.only(bottom: Space.s1),
      child: Row(
        children: [
          for (final d in weekdayNames)
            Expanded(
              child: Text(d, textAlign: TextAlign.center, style: context.text.labelMedium),
            ),
        ],
      ),
    ),
  );
}

/// One day of the phone's month grid: its number and up to three dots for its cards.
class _MonthDay extends StatelessWidget {
  const _MonthDay({
    required this.date,
    required this.count,
    required this.outside,
    required this.today,
    required this.selected,
    required this.over,
    required this.onTap,
  });
  final String date;
  final int count;
  final bool outside;
  final bool today;
  final bool selected;
  final bool over;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    final day = int.parse(date.substring(8));
    return Semantics(
      button: true,
      selected: selected,
      label: '$day, ${formatDate(date)}, ${cardCount(count)}',
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () {
          HapticFeedback.selectionClick();
          onTap();
        },
        child: AnimatedContainer(
          duration: Motion.fast,
          height: 52,
          margin: const EdgeInsets.all(1.5),
          decoration: BoxDecoration(
            color: over ? t.accentSoft : (selected ? t.surface : null),
            borderRadius: BorderRadius.circular(TackRadii.control),
            border: Border.all(color: selected || over ? t.accent : const Color(0x00000000), width: selected ? 1.5 : 1),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 28,
                height: 28,
                alignment: Alignment.center,
                decoration: today ? BoxDecoration(color: t.accent, shape: BoxShape.circle) : null,
                child: Text(
                  '$day',
                  style: context.mono(
                    14,
                    color: today ? t.onAccent : (outside ? context.tack.ink3 : t.text),
                    weight: today || selected ? FontWeight.w600 : FontWeight.w400,
                  ),
                ),
              ),
              const SizedBox(height: 3),
              SizedBox(
                height: 5,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    for (var i = 0; i < (count > 3 ? 3 : count); i++)
                      Container(
                        width: 5,
                        height: 5,
                        margin: const EdgeInsets.symmetric(horizontal: 1.5),
                        decoration: BoxDecoration(
                          color: outside ? context.tack.ink3 : t.textMuted,
                          shape: BoxShape.circle,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DayHeading extends StatelessWidget {
  const _DayHeading({required this.date, required this.today, required this.onAdd, this.weekday = false});
  final String date;
  final bool today;
  final bool weekday;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    final text = weekday ? '${weekdayNames[dayOfWeek(date)]} ${formatDate(date)}' : formatDate(date);
    return Row(
      children: [
        Expanded(
          child: Semantics(
            header: true,
            child: Text(
              text,
              style: context.mono(14, color: today ? t.accentText : t.text, weight: FontWeight.w600),
            ),
          ),
        ),
        IconBtn(icon: LucideIcons.plus, label: 'Add a card due ${formatDate(date)}', onTap: onAdd),
      ],
    );
  }
}

/// A day's cards as full rows, each with its list name.
class _DayCards extends ConsumerWidget {
  const _DayCards({
    required this.entries,
    required this.now,
    required this.lingering,
    required this.dragging,
    required this.onToggle,
    required this.onLift,
    required this.onMove,
    required this.onDrop,
  });

  final List<CalendarEntry> entries;
  final int now;
  final Set<String> lingering;
  final String? dragging;
  final void Function(TaskCard card, bool willHide) onToggle;
  final void Function(CalendarEntry entry, GlobalKey rowKey, Offset global) onLift;
  final void Function(Offset global) onMove;
  final void Function(bool cancelled) onDrop;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final d = ref.watch(densityProvider);
    return Column(
      children: [for (final e in entries) _Row(entry: e, parent: this, gap: d.gap)],
    );
  }
}

class _Row extends StatefulWidget {
  const _Row({required this.entry, required this.parent, required this.gap});
  final CalendarEntry entry;
  final _DayCards parent;
  final double gap;

  @override
  State<_Row> createState() => _RowState();
}

class _RowState extends State<_Row> {
  final _key = GlobalKey();

  @override
  Widget build(BuildContext context) {
    final e = widget.entry;
    final p = widget.parent;
    return CardSlot(
      leaving: p.lingering.contains(e.card.id) && e.card.completed && !e.board.showCompleted,
      afterTick: true,
      gap: widget.gap,
      child: LiftDetector(
        enabled: !p.lingering.contains(e.card.id),
        onStart: (g) => p.onLift(e, _key, g),
        onMove: p.onMove,
        onEnd: p.onDrop,
        child: KeyedSubtree(
          key: _key,
          child: Opacity(
            opacity: p.dragging == e.card.id ? 0.4 : 1,
            child: CardFace(
              card: e.card,
              now: p.now,
              showCompleted: e.board.showCompleted,
              listName: e.listName,
              onToggle: p.onToggle,
              onOpen: (c) => openCard(context, c.id),
            ),
          ),
        ),
      ),
    );
  }
}

/// Adds a card due on a tapped day: title, board and list (SPEC §3.7).
class _QuickAdd extends ConsumerStatefulWidget {
  const _QuickAdd({required this.date, required this.boards});
  final String date;
  final List<Board> boards;

  @override
  ConsumerState<_QuickAdd> createState() => _QuickAddState();
}

class _QuickAddState extends ConsumerState<_QuickAdd> {
  final _title = TextEditingController();
  late String? _boardId = widget.boards.firstOrNull?.id;
  String? _listId;

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final lib = ref.watch(storeProvider);
    final lists = lib.lists.values.where((l) => l.boardId == _boardId && l.deletedAt == null).toList()
      ..sort(byPosition);
    final chosen = lists.any((l) => l.id == _listId) ? _listId : lists.firstOrNull?.id;

    void submit() {
      final title = _title.text.trim();
      if (title.isEmpty || chosen == null || _boardId == null) return;
      ref.read(storeProvider.notifier).createCard(_boardId!, chosen, title, due: DateValue(widget.date));
      Navigator.of(context).pop();
      Toasts.show('Card added, due ${formatDate(widget.date)}');
    }

    return KitSheet(
      title: 'Add card, due ${formatDate(widget.date)}',
      footer: widget.boards.isEmpty
          ? null
          : ListenableBuilder(
              listenable: _title,
              builder: (context, _) => KitButton(
                label: 'Add card',
                variant: ButtonVariant.primary,
                block: true,
                onPressed: _title.text.trim().isEmpty || chosen == null ? null : submit,
              ),
            ),
      child: widget.boards.isEmpty
          ? Text(
              'Make a board first, then cards can go on the calendar.',
              style: context.text.bodyLarge!.copyWith(color: context.kit.textMuted),
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                KitField(
                  label: 'Title',
                  child: TextField(
                    controller: _title,
                    autofocus: true,
                    textCapitalization: TextCapitalization.sentences,
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => submit(),
                  ),
                ),
                const SizedBox(height: Space.s4),
                const SectionLabel('Board'),
                KitChips<String>(
                  value: _boardId,
                  options: [for (final b in widget.boards) ChipOption(b.id, b.title)],
                  onChanged: (id) => setState(() {
                    _boardId = id;
                    _listId = null;
                  }),
                ),
                const SizedBox(height: Space.s4),
                const SectionLabel('List'),
                if (lists.isEmpty)
                  Text(
                    'This board has no lists yet.',
                    style: context.text.bodyMedium!.copyWith(color: context.kit.textMuted),
                  )
                else
                  KitChips<String>(
                    value: chosen,
                    options: [for (final l in lists) ChipOption(l.id, l.name)],
                    onChanged: (id) => setState(() => _listId = id),
                  ),
              ],
            ),
    );
  }
}
