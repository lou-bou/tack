import 'dart:async';

import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:material_ui/material_ui.dart';

import '../data/positions.dart';
import '../data/store.dart';
import 'boards_page.dart';
import 'card_page.dart';
import 'settings_page.dart';
import 'state.dart';
import 'theme.dart';
import 'widgets/card_face.dart';
import 'widgets/common.dart';
import 'widgets/drag.dart';

/// Holding a card this close to the screen edge pages to the next list (SPEC §3.3).
const _edgePx = 40.0;
const _pageDelay = Duration(milliseconds: 350);
const _pageRepeat = Duration(milliseconds: 700);

/// The cards on screen: completed ones only when the board shows them, or while they play their
/// done animation.
List<TaskCard> visibleCards(List<TaskCard> cards, bool showCompleted, Set<String> lingering) => [
  for (final c in cards)
    if (showCompleted || !c.completed || lingering.contains(c.id)) c,
];

/// One board (SPEC §3.3): one list at a time, each about 88% of the screen wide so the next one
/// peeks in, swiped with snap, under a strip of list names that jumps between them. Long-press a
/// card to drag it within its list or to another; hold it at the screen edge to page; drop it on
/// a name in the strip to send it to the end of that list. Long-press a name in the strip to
/// reorder the lists.
class BoardPage extends ConsumerStatefulWidget {
  const BoardPage({super.key, required this.boardId});
  final String boardId;

  @override
  ConsumerState<BoardPage> createState() => _BoardPageState();
}

class _BoardPageState extends ConsumerState<BoardPage> with Completion<BoardPage> {
  final _pages = PageController(viewportFraction: 0.88);
  final _stripScroll = ScrollController();
  int _current = 0;

  bool _selecting = false;
  final Set<String> _selected = {};

  // Dragging a card.
  final _cardKeys = <String, GlobalKey>{};
  final _listKeys = <String, GlobalKey>{};
  final _viewportKeys = <String, GlobalKey>{};
  final _scrolls = <String, ScrollController>{};
  final _stripKeys = <String, GlobalKey>{};
  final _proxy = DragProxy();
  final _edge = EdgeScroller();
  Map<String, List<String>>? _order;
  String? _dragId;
  String? _overStrip;
  Offset _grab = Offset.zero;
  Offset _pointer = Offset.zero;
  Timer? _pageTimer;
  int _pageDir = 0;

  GlobalKey _key(Map<String, GlobalKey> keys, String id) => keys.putIfAbsent(id, GlobalKey.new);
  ScrollController _scroll(String listId) => _scrolls.putIfAbsent(listId, ScrollController.new);

  @override
  void initState() {
    super.initState();
    _pages.addListener(() {
      final page = (_pages.page ?? 0).round();
      if (page != _current) {
        setState(() => _current = page);
        _revealTab();
      }
    });
  }

  @override
  void dispose() {
    _pageTimer?.cancel();
    _edge.stop();
    _proxy.hide();
    _pages.dispose();
    _stripScroll.dispose();
    for (final s in _scrolls.values) {
      s.dispose();
    }
    super.dispose();
  }

  BoardView? get _view => ref.read(boardViewProvider(widget.boardId));

  /// Keeps the current list's name in view in the strip.
  void _revealTab() {
    final view = _view;
    if (view == null || _current >= view.lists.length) return;
    final ctx = _stripKeys[view.lists[_current].list.id]?.currentContext;
    if (ctx != null) Scrollable.ensureVisible(ctx, alignment: 0.5, duration: Motion.base, curve: Motion.easeOut);
  }

  void _jumpTo(int index) {
    if (!_pages.hasClients) return;
    final still = MediaQuery.disableAnimationsOf(context);
    if (still) {
      _pages.jumpToPage(index);
    } else {
      _pages.animateToPage(index, duration: const Duration(milliseconds: 280), curve: Motion.easeOut);
    }
  }

  // ---------- selecting ----------

  void _startSelecting() => setState(() {
    _selecting = true;
    _selected.clear();
  });

  void _stopSelecting() => setState(() {
    _selecting = false;
    _selected.clear();
  });

  void _toggleSelected(String id) => setState(() => _selected.contains(id) ? _selected.remove(id) : _selected.add(id));

  // ---------- dragging a card ----------

  List<String> _visibleIds(ListWithCards l, bool showCompleted) => [
    for (final c in visibleCards(l.cards, showCompleted, lingering)) c.id,
  ];

  void _liftCard(TaskCard card, Offset global) {
    final view = _view;
    final rect = rectOf(_key(_cardKeys, card.id));
    if (view == null || rect == null) return;
    HapticFeedback.mediumImpact();
    _grab = global - rect.topLeft;
    _pointer = global;
    final now = ref.read(nowProvider);
    _proxy.show(
      context,
      from: rect,
      child: CardFace(card: card, now: now, lifted: true, onToggle: (_, _) {}, onOpen: (_) {}),
    );
    setState(() {
      _dragId = card.id;
      _order = {for (final l in view.lists) l.list.id: _visibleIds(l, view.board.showCompleted)};
    });
  }

  void _moveCard(Offset global) {
    if (_dragId == null) return;
    _pointer = global;
    _proxy.moveTo(global - _grab);
    _retarget();
    _edgePaging();
  }

  /// Works out where the card would land under the finger, and makes room there.
  void _retarget() {
    final id = _dragId;
    final order = _order;
    final view = _view;
    if (id == null || order == null || view == null) return;

    String? strip;
    for (final e in _stripKeys.entries) {
      if (rectOf(e.value)?.contains(_pointer) ?? false) strip = e.key;
    }
    if (strip != _overStrip) {
      if (strip != null) HapticFeedback.selectionClick();
      setState(() => _overStrip = strip);
    }
    if (strip != null) {
      _edge.stop();
      return;
    }

    String? target;
    for (final l in view.lists) {
      final r = rectOf(_key(_listKeys, l.list.id));
      if (r != null && _pointer.dx >= r.left && _pointer.dx < r.right) target = l.list.id;
    }
    if (target == null) return;
    _edge.update(_scroll(target), rectOf(_key(_viewportKeys, target)), _pointer, _retarget);

    final others = [
      for (final c in order[target] ?? const <String>[])
        if (c != id) c,
    ];
    var index = 0;
    for (final c in others) {
      final r = rectOf(_key(_cardKeys, c));
      if (r != null && r.center.dy < _pointer.dy) index++;
    }
    final from = order.entries.firstWhere((e) => e.value.contains(id)).key;
    if (from == target && order[from]!.indexOf(id) == index) return;
    if (from != target) HapticFeedback.selectionClick();
    setState(() {
      order[from]!.remove(id);
      order[target]!.insert(index, id);
    });
  }

  /// Holding the card at a screen edge pages to the next list, then keeps paging while held.
  void _edgePaging() {
    final width = MediaQuery.sizeOf(context).width;
    final dir = _pointer.dx < _edgePx ? -1 : (_pointer.dx > width - _edgePx ? 1 : 0);
    if (dir == _pageDir) return;
    _pageDir = dir;
    _pageTimer?.cancel();
    if (dir == 0) return;
    _pageTimer = Timer(_pageDelay, () {
      _page(dir);
      _pageTimer = Timer.periodic(_pageRepeat, (_) => _page(dir));
    });
  }

  void _page(int dir) {
    final view = _view;
    if (view == null || !_pages.hasClients) return;
    // Stops at the last list: a card can't be dropped on the "Add list" slot.
    final next = _current + dir;
    if (next < 0 || next >= view.lists.length) return;
    HapticFeedback.selectionClick();
    _pages
        .animateToPage(next, duration: const Duration(milliseconds: 280), curve: Motion.easeOut)
        .then((_) => _retarget());
  }

  void _dropCard(bool cancelled) {
    final id = _dragId;
    final order = _order;
    final view = _view;
    final strip = _overStrip;
    _pageTimer?.cancel();
    _pageDir = 0;
    _edge.stop();
    _proxy.hide();
    setState(() {
      _dragId = null;
      _order = null;
      _overStrip = null;
    });
    if (cancelled || id == null || order == null || view == null) return;
    final card = ref.read(storeProvider).cards[id];
    if (card == null) return;

    String toList;
    List<String> visibleAfter;
    if (strip != null) {
      // Dropping on a name in the strip puts the card at the end of that list.
      toList = strip;
      final shown = view.lists.firstWhere(
        (l) => l.list.id == strip,
        orElse: () => ListWithCards(view.lists.first.list, const []),
      );
      visibleAfter = [..._visibleIds(shown, view.board.showCompleted).where((c) => c != id), id];
    } else {
      toList = order.entries.firstWhere((e) => e.value.contains(id)).key;
      visibleAfter = order[toList]!;
    }
    final original = view.lists.where((l) => l.list.id == card.listId).firstOrNull;
    final before = original == null ? const <String>[] : _visibleIds(original, view.board.showCompleted);
    if (card.listId == toList && before.join(',') == visibleAfter.join(',')) return;

    final target = view.lists.firstWhere((l) => l.list.id == toList);
    final siblings = [
      for (final c in target.cards)
        if (c.id != id) c,
    ];
    ref.read(storeProvider.notifier).updateCard(id, {
      'listId': toList,
      'position': dropPosition(siblings, visibleAfter, id),
    });
    HapticFeedback.lightImpact();
    SemanticsService.sendAnnouncement(View.of(context), 'Moved to ${target.list.name}', TextDirection.ltr);
  }

  // ---------- lists ----------

  Future<void> _addList(BoardView view) async {
    final name = await showNameSheet(context, title: 'New list', initial: '', action: 'Add list');
    if (name == null || !mounted) return;
    ref.read(storeProvider.notifier).createList(view.board.id, name);
    // The new list is the last one, just before the "Add list" slot.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _jumpTo(view.lists.length);
    });
  }

  void _moveList(BoardView view, String id, int index) {
    final others = [
      for (final l in view.lists)
        if (l.list.id != id) l.list,
    ];
    ref.read(storeProvider.notifier).updateList(id, {'position': positionAt(others, index)});
    SemanticsService.sendAnnouncement(View.of(context), 'List moved', TextDirection.ltr);
  }

  @override
  Widget build(BuildContext context) {
    final view = ref.watch(boardViewProvider(widget.boardId));
    final synced = ref.watch(storeProvider.select((l) => l.synced));
    final t = context.kit;
    if (view == null) {
      return ColoredBox(
        color: t.bg,
        child: Column(
          children: [
            TopBar(title: synced ? 'Board not found' : '', small: true, onBack: () => Navigator.of(context).maybePop()),
            if (synced)
              EmptyLine(
                "This board doesn't exist or is in Trash.",
                action: KitButton(label: 'Back to boards', onPressed: () => Navigator.of(context).maybePop()),
              ),
          ],
        ),
      );
    }
    final board = view.board;
    final now = ref.watch(nowProvider);
    final anyPlanned = view.lists.any((l) => l.cards.any((c) => _selected.contains(c.id) && c.plannedFor != null));
    final cardsById = {
      for (final l in view.lists)
        for (final c in l.cards) c.id: c,
    };
    final current = _current.clamp(0, view.lists.length);

    return PopScope(
      canPop: !_selecting,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _selecting) _stopSelecting();
      },
      child: ColoredBox(
        color: context.tack.board(board.color),
        child: Stack(
          children: [
            Column(
              children: [
                TopBar(
                  title: board.title,
                  small: true,
                  onBack: () => Navigator.of(context).maybePop(),
                  onFix: () => openConnection(context),
                  actions: [
                    IconBtn(
                      icon: LucideIcons.listChecks,
                      label: _selecting ? 'Stop selecting' : 'Select cards',
                      active: _selecting,
                      onTap: _selecting ? _stopSelecting : _startSelecting,
                    ),
                    IconBtn(
                      icon: board.showCompleted ? LucideIcons.eye : LucideIcons.eyeOff,
                      label: board.showCompleted ? 'Hide completed' : 'Show completed',
                      active: board.showCompleted,
                      onTap: () => ref.read(storeProvider.notifier).updateBoard(board.id, {
                        'showCompleted': !board.showCompleted,
                      }),
                    ),
                    IconBtn(
                      icon: LucideIcons.ellipsis,
                      label: 'Menu for ${board.name}',
                      onTap: () =>
                          showBoardMenu(context, ref, board, onDeleted: () => Navigator.of(context).maybePop()),
                    ),
                  ],
                ),
                if (view.lists.isNotEmpty) _strip(view, current),
                Expanded(
                  child: PageView.builder(
                    controller: _pages,
                    padEnds: false,
                    itemCount: view.lists.length + 1,
                    itemBuilder: (context, i) {
                      if (i == view.lists.length) {
                        return Padding(
                          padding: const EdgeInsets.fromLTRB(Space.s2, Space.s3, Space.s4, Space.s3),
                          child: Align(
                            alignment: Alignment.topCenter,
                            child: KitButton(
                              label: 'Add list',
                              icon: LucideIcons.plus,
                              block: true,
                              onPressed: () => _addList(view),
                            ),
                          ),
                        );
                      }
                      final l = view.lists[i];
                      final ids = _order?[l.list.id] ?? _visibleIds(l, board.showCompleted);
                      return Padding(
                        padding: EdgeInsets.fromLTRB(i == 0 ? Space.s4 : Space.s1, Space.s3, Space.s1, Space.s3),
                        child: KeyedSubtree(
                          key: _key(_listKeys, l.list.id),
                          child: _ListColumn(
                            list: l.list,
                            board: board,
                            cards: [for (final id in ids) ?cardsById[id]],
                            now: now,
                            dragging: _dragId,
                            lingering: lingering,
                            selection: _selecting ? CardSelection(selected: _selected, toggle: _toggleSelected) : null,
                            cardKey: (id) => _key(_cardKeys, id),
                            viewportKey: _key(_viewportKeys, l.list.id),
                            scroll: _scroll(l.list.id),
                            onToggle: toggleCard,
                            onLift: _liftCard,
                            onMove: _moveCard,
                            onDrop: _dropCard,
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
            if (_selecting)
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: SelectionBar(
                  count: _selected.length,
                  onCancel: _stopSelecting,
                  actions: [
                    if (anyPlanned)
                      KitButton(
                        label: 'Remove from today',
                        small: true,
                        onPressed: () {
                          planCards(ref, _selected, plan: false);
                          _stopSelecting();
                        },
                      ),
                    KitButton(
                      label: 'Plan for today',
                      icon: LucideIcons.sun,
                      small: true,
                      variant: ButtonVariant.primary,
                      onPressed: _selected.isEmpty
                          ? null
                          : () {
                              planCards(ref, _selected, plan: true);
                              _stopSelecting();
                            },
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  /// The names of the lists, to jump between them. A name is also a drop target for a card, and
  /// a long press on it drags the list to a new place.
  Widget _strip(BoardView view, int current) {
    final t = context.kit;
    final byId = {for (final l in view.lists) l.list.id: l.list};
    return Container(
      height: controlHeight,
      width: double.infinity,
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: t.border)),
      ),
      child: SingleChildScrollView(
        controller: _stripScroll,
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: Space.s3),
        child: Reorderable(
          ids: [for (final l in view.lists) l.list.id],
          axis: Axis.horizontal,
          scroll: _stripScroll,
          enabled: _dragId == null && !_selecting,
          layout: (children) => Row(children: children),
          onMove: (id, index) => _moveList(view, id, index),
          itemBuilder: (context, id, lifted) {
            final list = byId[id]!;
            final index = view.lists.indexWhere((l) => l.list.id == id);
            final isCurrent = index == current;
            final over = _overStrip == id;
            final tab = Semantics(
              selected: isCurrent,
              button: true,
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => _jumpTo(index),
                child: AnimatedContainer(
                  duration: Motion.fast,
                  height: controlHeight,
                  constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.6),
                  padding: const EdgeInsets.symmetric(horizontal: Space.s3),
                  decoration: BoxDecoration(
                    color: over ? t.accentSoft : (lifted ? context.tack.floating : null),
                    borderRadius: lifted ? BorderRadius.circular(TackRadii.control) : null,
                    border: Border(
                      bottom: BorderSide(color: isCurrent && !lifted ? t.accent : const Color(0x00000000), width: 2),
                    ),
                  ),
                  child: Center(
                    widthFactor: 1,
                    child: Text(
                      list.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: context.text.bodyMedium!.copyWith(
                        color: isCurrent || over ? t.text : t.textMuted,
                        fontWeight: isCurrent ? FontWeight.w600 : FontWeight.w400,
                      ),
                    ),
                  ),
                ),
              ),
            );
            return lifted ? tab : KeyedSubtree(key: _key(_stripKeys, id), child: tab);
          },
        ),
      ),
    );
  }
}

/// One list: its name and count, its cards, and the "Add card" composer at the bottom.
class _ListColumn extends ConsumerStatefulWidget {
  const _ListColumn({
    required this.list,
    required this.board,
    required this.cards,
    required this.now,
    required this.dragging,
    required this.lingering,
    required this.selection,
    required this.cardKey,
    required this.viewportKey,
    required this.scroll,
    required this.onToggle,
    required this.onLift,
    required this.onMove,
    required this.onDrop,
  });

  final BoardList list;
  final Board board;
  final List<TaskCard> cards;
  final int now;
  final String? dragging;
  final Set<String> lingering;
  final CardSelection? selection;
  final GlobalKey Function(String id) cardKey;
  final GlobalKey viewportKey;
  final ScrollController scroll;
  final void Function(TaskCard card, bool willHide) onToggle;
  final void Function(TaskCard card, Offset global) onLift;
  final void Function(Offset global) onMove;
  final void Function(bool cancelled) onDrop;

  @override
  ConsumerState<_ListColumn> createState() => _ListColumnState();
}

class _ListColumnState extends ConsumerState<_ListColumn> {
  final _origin = GlobalKey();

  void _rename() async {
    final name = await showNameSheet(context, title: 'Rename list', initial: widget.list.name);
    if (name != null && name != widget.list.name) {
      ref.read(storeProvider.notifier).updateList(widget.list.id, {'name': name});
    }
  }

  void _menu() {
    final store = ref.read(storeProvider.notifier);
    final id = widget.list.id;
    showMenuSheet(
      context,
      title: widget.list.name,
      items: [
        MenuItem('Rename', LucideIcons.pencil, _rename),
        MenuItem('Delete', LucideIcons.trash2, danger: true, () {
          store.trashList(id);
          Toasts.show(
            'List moved to Trash',
            duration: undoDuration,
            actionLabel: 'Undo',
            onAction: () => store.restoreList(id),
          );
        }),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(densityProvider);
    final showCompleted = widget.board.showCompleted;
    // A card on its way out no longer counts.
    final count = widget.cards.where((c) => !widget.lingering.contains(c.id)).length;
    return Container(
      decoration: BoxDecoration(color: context.tack.list, borderRadius: BorderRadius.circular(TackRadii.list)),
      padding: const EdgeInsets.fromLTRB(Space.s2, Space.s1, Space.s2, Space.s2),
      child: Column(
        children: [
          SizedBox(
            height: controlHeight,
            child: Row(
              children: [
                Expanded(
                  child: Semantics(
                    button: true,
                    label: 'Rename ${widget.list.name}',
                    excludeSemantics: true,
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: _rename,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: Space.s1),
                        child: Text(
                          widget.list.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: context.text.titleSmall,
                        ),
                      ),
                    ),
                  ),
                ),
                Text('$count', style: context.mono(12)),
                IconBtn(icon: LucideIcons.ellipsis, label: 'Menu for ${widget.list.name}', onTap: _menu),
              ],
            ),
          ),
          Expanded(
            child: KeyedSubtree(
              key: widget.viewportKey,
              child: SingleChildScrollView(
                controller: widget.scroll,
                child: FlipScope(
                  origin: _origin,
                  animate: widget.dragging != null,
                  child: Column(
                    key: _origin,
                    children: [
                      for (final card in widget.cards)
                        KeyedSubtree(
                          key: widget.cardKey(card.id),
                          child: Flip(
                            child: CardSlot(
                              leaving: widget.lingering.contains(card.id) && card.completed && !showCompleted,
                              afterTick: true,
                              gap: d.gap,
                              child: LiftDetector(
                                enabled: widget.selection == null && !widget.lingering.contains(card.id),
                                onStart: (g) => widget.onLift(card, g),
                                onMove: widget.onMove,
                                onEnd: widget.onDrop,
                                child: Opacity(
                                  opacity: card.id == widget.dragging ? 0.4 : 1,
                                  child: CardFace(
                                    card: card,
                                    now: widget.now,
                                    showCompleted: showCompleted,
                                    selection: widget.selection,
                                    onToggle: widget.onToggle,
                                    onOpen: (c) => openCard(context, c.id),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      if (widget.cards.isEmpty) const SizedBox(height: Space.s8, width: double.infinity),
                    ],
                  ),
                ),
              ),
            ),
          ),
          if (widget.selection == null)
            _Composer(
              boardId: widget.board.id,
              listId: widget.list.id,
              onAdded: () => WidgetsBinding.instance.addPostFrameCallback((_) {
                if (widget.scroll.hasClients) {
                  widget.scroll.animateTo(
                    widget.scroll.position.maxScrollExtent,
                    duration: Motion.base,
                    curve: Motion.easeOut,
                  );
                }
              }),
            ),
        ],
      ),
    );
  }
}

/// "Add card": Enter adds it and keeps the composer open for the next one; tapping outside or ×
/// closes it. Empty titles are ignored (SPEC §3.3).
class _Composer extends ConsumerStatefulWidget {
  const _Composer({required this.boardId, required this.listId, required this.onAdded});
  final String boardId;
  final String listId;
  final VoidCallback onAdded;

  @override
  ConsumerState<_Composer> createState() => _ComposerState();
}

class _ComposerState extends ConsumerState<_Composer> {
  final _text = TextEditingController();
  final _focus = FocusNode();
  bool _open = false;

  @override
  void dispose() {
    _text.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _add() {
    final title = _text.text.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (title.isNotEmpty) {
      ref.read(storeProvider.notifier).createCard(widget.boardId, widget.listId, title);
      _text.clear();
      widget.onAdded();
    }
    _focus.requestFocus();
  }

  void _close() {
    _text.clear();
    setState(() => _open = false);
  }

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    if (!_open) {
      return Pressable(
        scale: 0.99,
        onTap: () {
          setState(() => _open = true);
          _focus.requestFocus();
        },
        child: SizedBox(
          height: controlHeight,
          child: Row(
            children: [
              const SizedBox(width: Space.s2),
              Icon(LucideIcons.plus, size: 18, color: t.textMuted),
              const SizedBox(width: Space.s2),
              Text('Add card', style: context.text.bodyMedium!.copyWith(color: t.textMuted)),
            ],
          ),
        ),
      );
    }
    return TapRegion(
      onTapOutside: (_) => _close(),
      child: Padding(
        padding: const EdgeInsets.only(top: Space.s1),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _text,
              focusNode: _focus,
              autofocus: true,
              minLines: 2,
              maxLines: 4,
              textCapitalization: TextCapitalization.sentences,
              textInputAction: TextInputAction.done,
              decoration: InputDecoration(
                hintText: 'Card title',
                fillColor: context.tack.card,
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(TackRadii.card),
                  borderSide: BorderSide(color: t.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(TackRadii.card),
                  borderSide: BorderSide(color: t.accent, width: 2),
                ),
              ),
              // Keeps the keyboard up for the next card.
              onEditingComplete: _add,
            ),
            const SizedBox(height: Space.s2),
            Row(
              children: [
                KitButton(label: 'Add', small: true, variant: ButtonVariant.primary, onPressed: _add),
                IconBtn(icon: LucideIcons.x, label: 'Close', onTap: _close),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
