import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:material_ui/material_ui.dart';

import '../data/dates.dart';
import '../data/positions.dart';
import '../data/selection.dart';
import '../data/store.dart';
import 'state.dart';
import 'theme.dart';
import 'widgets/card_face.dart';
import 'widgets/common.dart';
import 'widgets/markdown.dart';
import 'widgets/pickers.dart';

/// Opens a card as a full-screen sheet over everything, the tab bar included (SPEC §3.5). Swipe
/// down on its top bar or press Back to close it.
Future<void> openCard(BuildContext context, String cardId) => showModalBottomSheet<void>(
  context: context,
  useRootNavigator: true,
  isScrollControlled: true,
  useSafeArea: true,
  enableDrag: true,
  showDragHandle: false,
  backgroundColor: context.kit.bg,
  builder: (context) => CardSheet(cardId: cardId),
);

/// The card panel. Every change saves immediately; there is no Save button.
class CardSheet extends ConsumerWidget {
  const CardSheet({super.key, required this.cardId});
  final String cardId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final card = ref.watch(storeProvider.select((l) => l.cards[cardId]));
    final synced = ref.watch(storeProvider.select((l) => l.synced));
    final t = context.kit;
    final missing = (card == null && synced) || card?.deletedAt != null;
    // A Scaffold of its own, so toasts (Undo) show above the sheet.
    return SizedBox(
      height: MediaQuery.sizeOf(context).height,
      child: Scaffold(
        backgroundColor: const Color(0x00000000),
        resizeToAvoidBottomInset: true,
        body: Column(
          children: [
            // The grab bar: dragging here closes the sheet.
            SizedBox(
              height: 52,
              width: double.infinity,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Container(
                    width: 36,
                    height: 4,
                    decoration: BoxDecoration(color: t.borderStrong, borderRadius: BorderRadius.circular(Radii.pill)),
                  ),
                  Positioned(
                    right: Space.s1,
                    child: IconBtn(
                      icon: LucideIcons.x,
                      label: 'Close card',
                      onTap: () => Navigator.of(context).maybePop(),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: missing
                  ? const EmptyLine("This card doesn't exist or is in Trash.")
                  : card == null
                  ? const SizedBox.shrink()
                  : _Details(key: ValueKey(card.id), card: card),
            ),
          ],
        ),
      ),
    );
  }
}

class _Details extends ConsumerStatefulWidget {
  const _Details({super.key, required this.card});
  final TaskCard card;

  @override
  ConsumerState<_Details> createState() => _DetailsState();
}

class _DetailsState extends ConsumerState<_Details> {
  TackStore get _store => ref.read(storeProvider.notifier);
  TaskCard get card => widget.card;

  void _pickDate({required bool due}) {
    final now = ref.read(nowProvider);
    showDatePickerSheet(
      context,
      label: due ? 'Due date' : 'Start date',
      value: due ? card.due : card.start,
      defaultTime: due ? defaultDueTime : defaultStartTime,
      now: now,
      // Reads the card fresh: the other date may change while this is open.
      isValid: (candidate) {
        final c = ref.read(storeProvider).cards[card.id] ?? card;
        return due ? !startAfterDue(c.start, candidate) : !startAfterDue(candidate, c.due);
      },
      onChange: (v) => _store.updateCard(card.id, {due ? 'due' : 'start': v?.toJson()}),
    );
  }

  void _pickList(List<BoardList> lists) {
    showKitSheet<void>(
      context,
      builder: (context) => KitSheet(
        title: 'Move to list',
        child: Column(
          children: [
            for (final l in lists)
              Pressable(
                scale: 0.99,
                onTap: () {
                  Navigator.of(context).pop();
                  if (l.id != card.listId) {
                    _store.moveCardToList(card.id, l.id);
                    Toasts.show('Moved to ${l.name}');
                  }
                },
                child: SizedBox(
                  height: 48,
                  child: Row(
                    children: [
                      Expanded(child: Text(l.name, style: context.text.bodyLarge)),
                      if (l.id == card.listId) Icon(LucideIcons.check, size: 20, color: context.kit.accent),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    final lib = ref.watch(storeProvider);
    final now = ref.watch(nowProvider);
    final board = lib.boards[card.boardId];
    final lists = lib.lists.values.where((l) => l.boardId == card.boardId && l.deletedAt == null).toList()
      ..sort(byPosition);
    final list = lib.lists[card.listId];
    final siblings = lib.cards.values.where((c) => c.listId == card.listId && c.deletedAt == null).toList()
      ..sort(byPosition);
    final showCompleted = board?.showCompleted ?? false;
    final visible = [
      for (final c in siblings)
        if (c.id == card.id || showCompleted || !c.completed) c,
    ];
    final at = visible.indexWhere((c) => c.id == card.id);
    final others = [
      for (final c in siblings)
        if (c.id != card.id) c,
    ];
    final planned = isPlanned(card, now);

    // Steps past visible neighbours, so a hidden card never makes a press look like it did nothing.
    void move(int direction) {
      final ids = [for (final c in visible) c.id]..removeAt(at);
      ids.insert(at + direction, card.id);
      _store.updateCard(card.id, {'position': dropPosition(others, ids, card.id)});
    }

    return ListView(
      padding: EdgeInsets.fromLTRB(Space.s4, 0, Space.s4, Space.s8 + MediaQuery.paddingOf(context).bottom),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 9),
              child: TackCheckbox(
                checked: card.completed,
                label: 'Complete ${card.title}',
                onTap: () {
                  HapticFeedback.lightImpact();
                  _store.setCardCompleted(card.id, !card.completed);
                },
              ),
            ),
            Expanded(child: _TitleField(card: card)),
          ],
        ),
        const SizedBox(height: Space.s1),
        Row(
          children: [
            Flexible(
              child: Text(
                board?.title ?? '',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: context.text.bodyMedium!.copyWith(color: t.textMuted),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: Space.s2),
              child: Text('/', style: context.text.bodyMedium!.copyWith(color: t.textFaint)),
            ),
            Flexible(
              child: Semantics(
                button: true,
                label: 'List: ${list?.name ?? ''}. Move to another list',
                excludeSemantics: true,
                child: Pressable(
                  onTap: () => _pickList(lists),
                  child: Container(
                    height: 36,
                    padding: const EdgeInsets.symmetric(horizontal: Space.s3),
                    decoration: BoxDecoration(
                      color: t.surface,
                      borderRadius: BorderRadius.circular(TackRadii.control),
                      border: Border.all(color: t.border),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Flexible(
                          child: Text(
                            list?.name ?? '',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: context.text.labelLarge,
                          ),
                        ),
                        const SizedBox(width: Space.s1),
                        Icon(LucideIcons.chevronDown, size: 16, color: t.textMuted),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: Space.s5),
        const SectionLabel('Priority'),
        _PriorityControl(value: card.priority, onChanged: (p) => _store.updateCard(card.id, {'priority': p})),
        const SizedBox(height: Space.s5),
        const SectionLabel('Dates'),
        Row(
          children: [
            Expanded(
              child: _DateButton(
                label: 'Start',
                value: card.start,
                card: card,
                isDue: false,
                now: now,
                onTap: () => _pickDate(due: false),
              ),
            ),
            const SizedBox(width: Space.s2),
            Expanded(
              child: _DateButton(
                label: 'Due',
                value: card.due,
                card: card,
                isDue: true,
                now: now,
                onTap: () => _pickDate(due: true),
              ),
            ),
          ],
        ),
        const SizedBox(height: Space.s2),
        Align(
          alignment: Alignment.centerLeft,
          child: KitButton(
            label: planned ? 'Remove from today' : 'Plan for today',
            icon: LucideIcons.sun,
            small: true,
            variant: planned ? ButtonVariant.secondary : ButtonVariant.secondary,
            onPressed: () => planCards(ref, [card.id], plan: !planned),
          ),
        ),
        const SizedBox(height: Space.s5),
        const SectionLabel('Description'),
        _Description(card: card),
        const SizedBox(height: Space.s6),
        Divider(color: t.border),
        const SizedBox(height: Space.s3),
        if (card.createdAt.isNotEmpty) Text('Created ${formatTimestamp(card.createdAt)}', style: context.mono(12)),
        if (card.updatedAt.isNotEmpty) Text('Updated ${formatTimestamp(card.updatedAt)}', style: context.mono(12)),
        const SizedBox(height: Space.s3),
        Wrap(
          spacing: Space.s2,
          runSpacing: Space.s2,
          children: [
            KitButton(
              label: 'Move up',
              icon: LucideIcons.arrowUp,
              small: true,
              onPressed: at <= 0 ? null : () => move(-1),
            ),
            KitButton(
              label: 'Move down',
              icon: LucideIcons.arrowDown,
              small: true,
              onPressed: at < 0 || at >= visible.length - 1 ? null : () => move(1),
            ),
            KitButton(
              label: 'Delete',
              icon: LucideIcons.trash2,
              small: true,
              variant: ButtonVariant.negative,
              onPressed: () {
                _store.trashCard(card.id);
                Navigator.of(context).maybePop();
                Toasts.show(
                  'Card moved to Trash',
                  duration: undoDuration,
                  actionLabel: 'Undo',
                  onAction: () => _store.restoreCard(card.id),
                );
              },
            ),
          ],
        ),
      ],
    );
  }
}

/// Saves as you type, keeps its own text while focused, and restores the old title if left
/// empty. Enter finishes.
class _TitleField extends ConsumerStatefulWidget {
  const _TitleField({required this.card});
  final TaskCard card;

  @override
  ConsumerState<_TitleField> createState() => _TitleFieldState();
}

class _TitleFieldState extends ConsumerState<_TitleField> {
  late final _text = TextEditingController(text: widget.card.title);
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _focus.addListener(() {
      if (!_focus.hasFocus && _text.text.trim().isEmpty) _text.text = widget.card.title;
    });
  }

  @override
  void didUpdateWidget(_TitleField old) {
    super.didUpdateWidget(old);
    if (!_focus.hasFocus && _text.text != widget.card.title) _text.text = widget.card.title;
  }

  @override
  void dispose() {
    _text.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    return TextField(
      controller: _text,
      focusNode: _focus,
      maxLines: null,
      textCapitalization: TextCapitalization.sentences,
      textInputAction: TextInputAction.done,
      style: context.text.titleLarge!.copyWith(
        fontSize: 20,
        fontWeight: FontWeight.w700,
        color: widget.card.completed ? context.tack.ink3 : t.text,
        decoration: widget.card.completed ? TextDecoration.lineThrough : null,
      ),
      decoration: const InputDecoration(
        filled: false,
        border: InputBorder.none,
        enabledBorder: InputBorder.none,
        focusedBorder: InputBorder.none,
        contentPadding: EdgeInsets.symmetric(vertical: Space.s2),
        hintText: 'Card title',
      ),
      onChanged: (text) {
        final clean = text.replaceAll(RegExp(r'\s*\n\s*'), ' ');
        if (clean != text) {
          _text.value = TextEditingValue(
            text: clean,
            selection: TextSelection.collapsed(offset: clean.length),
          );
        }
        final title = clean.trim();
        if (title.isNotEmpty && title != widget.card.title) {
          ref.read(storeProvider.notifier).updateCard(widget.card.id, {'title': title});
        }
      },
      onSubmitted: (_) => _focus.unfocus(),
    );
  }
}

const _levels = [
  ('none', 'None', LucideIcons.minus),
  ('low', 'Low', LucideIcons.chevronDown),
  ('medium', 'Medium', LucideIcons.equal),
  ('high', 'High', LucideIcons.chevronUp),
  ('urgent', 'Urgent', LucideIcons.chevronsUp),
];

/// Five segments, each an icon and a label, and one tap sets it (SPEC §3.5).
class _PriorityControl extends StatelessWidget {
  const _PriorityControl({required this.value, required this.onChanged});
  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(color: context.tack.list, borderRadius: BorderRadius.circular(TackRadii.control + 2)),
      child: Row(
        children: [
          for (final (level, label, icon) in _levels)
            Expanded(
              child: Semantics(
                selected: level == value,
                button: true,
                label: '$label priority',
                excludeSemantics: true,
                child: Pressable(
                  onTap: () => onChanged(level),
                  child: AnimatedContainer(
                    duration: Motion.fast,
                    height: 52,
                    decoration: BoxDecoration(
                      color: level == value ? t.surface : null,
                      borderRadius: BorderRadius.circular(TackRadii.control - 2),
                      border: Border.all(color: level == value ? t.border : const Color(0x00000000)),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(icon, size: 18, color: level == 'none' ? t.textMuted : context.tack.priority[level]),
                        const SizedBox(height: 2),
                        Text(
                          label,
                          style: context.text.labelMedium!.copyWith(
                            color: level == value ? t.text : t.textMuted,
                            fontWeight: level == value ? FontWeight.w600 : FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _DateButton extends StatelessWidget {
  const _DateButton({
    required this.label,
    required this.value,
    required this.card,
    required this.isDue,
    required this.now,
    required this.onTap,
  });
  final String label;
  final DateValue? value;
  final TaskCard card;
  final bool isDue;
  final int now;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    final state = isDue ? dueState(due: card.due, completed: card.completed, now: now) : DueState.none;
    final s = dueStyle(context, state);
    return Semantics(
      button: true,
      label:
          '$label: ${value == null ? 'not set' : formatDateValue(value!)}${state == DueState.overdue ? ', overdue' : ''}',
      excludeSemantics: true,
      child: Pressable(
        scale: 0.98,
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: Space.s3, vertical: Space.s2),
          decoration: BoxDecoration(
            color: s.bg ?? t.surface,
            borderRadius: BorderRadius.circular(TackRadii.control),
            border: Border.all(color: s.bg != null ? s.fg.withValues(alpha: 0.4) : t.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: context.text.labelMedium),
              const SizedBox(height: 2),
              Row(
                children: [
                  if (s.icon != null) ...[Icon(s.icon, size: 14, color: s.fg), const SizedBox(width: 4)],
                  Flexible(
                    child: Text(
                      value == null ? 'Not set' : formatDateValue(value!),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: value == null
                          ? context.text.bodyMedium!.copyWith(color: t.textFaint)
                          : context.mono(
                              13,
                              color: state == DueState.none || state == DueState.neutral ? t.text : s.fg,
                              weight: FontWeight.w500,
                            ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Markdown description: drawn formatted until tapped, then edited with its formatting shown as
/// you type. Typing is saved after a pause, and always when leaving the field, the card or the
/// app. A change from another device shows up, unless you're mid-edit here.
class _Description extends ConsumerStatefulWidget {
  const _Description({required this.card});
  final TaskCard card;

  @override
  ConsumerState<_Description> createState() => _DescriptionState();
}

class _DescriptionState extends ConsumerState<_Description> with WidgetsBindingObserver {
  late final _text = MarkdownController(text: widget.card.description);
  final _focus = FocusNode();
  Timer? _timer;
  String? _unsaved;
  bool _editing = false;
  MarkdownStyler? _styler;
  late final TackStore _store = ref.read(storeProvider.notifier);

  static const _saveDelay = Duration(milliseconds: 500);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _focus.addListener(() {
      if (!_focus.hasFocus) {
        _flush();
        setState(() => _editing = false);
      }
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Leaving the app may not close the card, so save as it goes to the background.
    if (state != AppLifecycleState.resumed) _flush();
  }

  @override
  void didUpdateWidget(_Description old) {
    super.didUpdateWidget(old);
    if (!_focus.hasFocus && _unsaved == null && _text.text != widget.card.description) {
      _text.text = widget.card.description;
    }
  }

  void _flush() {
    _timer?.cancel();
    _timer = null;
    final text = _unsaved;
    _unsaved = null;
    if (text != null) _store.updateCard(widget.card.id, {'description': text});
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _flush();
    _styler?.dispose();
    _text.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _edit() {
    setState(() => _editing = true);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _focus.requestFocus();
      _text.selection = TextSelection.collapsed(offset: _text.text.length);
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    final base = context.text.bodyLarge!.copyWith(fontSize: 15, height: 1.5, color: t.text);
    final box = BoxDecoration(
      color: t.surface,
      borderRadius: BorderRadius.circular(TackRadii.control),
      border: Border.all(color: _editing ? t.accent : t.border, width: _editing ? 2 : 1),
    );
    if (!_editing) {
      _styler?.dispose();
      final text = widget.card.description;
      _styler = MarkdownStyler(
        context,
        base,
        preview: true,
        onToggleTask: (offset) {
          HapticFeedback.selectionClick();
          final next = toggleTaskAt(widget.card.description, offset);
          _text.text = next;
          _store.updateCard(widget.card.id, {'description': next});
        },
      );
      return Semantics(
        button: true,
        hint: 'Edit description',
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: _edit,
          child: Container(
            width: double.infinity,
            constraints: const BoxConstraints(minHeight: 96),
            padding: const EdgeInsets.all(Space.s3),
            decoration: box,
            child: text.isEmpty
                ? Text('Add notes, links or a checklist…', style: base.copyWith(color: t.textFaint))
                : Text.rich(_styler!.build(text)),
          ),
        ),
      );
    }
    return Container(
      decoration: box,
      padding: const EdgeInsets.symmetric(horizontal: Space.s3 - 1, vertical: 1),
      child: TextField(
        controller: _text,
        focusNode: _focus,
        maxLines: null,
        minLines: 4,
        keyboardType: TextInputType.multiline,
        textCapitalization: TextCapitalization.sentences,
        style: base,
        decoration: const InputDecoration(
          filled: false,
          border: InputBorder.none,
          enabledBorder: InputBorder.none,
          focusedBorder: InputBorder.none,
          contentPadding: EdgeInsets.symmetric(vertical: Space.s2 + 3),
          hintText: 'Add notes, links or a checklist…',
        ),
        onChanged: (text) {
          _unsaved = text;
          _timer?.cancel();
          _timer = Timer(_saveDelay, _flush);
        },
      ),
    );
  }
}
