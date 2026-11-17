import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:material_ui/material_ui.dart';

import '../data/positions.dart';
import '../data/store.dart';
import 'bell.dart';
import 'board_page.dart';
import 'settings_page.dart';
import 'state.dart';
import 'theme.dart';
import 'widgets/common.dart';
import 'widgets/drag.dart';
import 'widgets/pickers.dart';

/// The Boards tab keeps its own stack, so a board opens over the grid with the tab bar still
/// there (the card panel is the only thing that covers it).
final boardsNavKey = GlobalKey<NavigatorState>();

void openBoard(WidgetRef ref, String boardId) {
  ref.read(tabProvider.notifier).go(0);
  final nav = boardsNavKey.currentState;
  if (nav == null) return;
  nav.popUntil((r) => r.isFirst);
  nav.push(MaterialPageRoute<void>(builder: (_) => BoardPage(boardId: boardId)));
}

/// Grid of board tiles: emoji, name, the board's colour as the tile's tint, and small counts of
/// open and overdue cards. Long-press and drag to reorder (SPEC §3.2).
class BoardsPage extends ConsumerStatefulWidget {
  const BoardsPage({super.key});

  @override
  ConsumerState<BoardsPage> createState() => _BoardsPageState();
}

class _BoardsPageState extends ConsumerState<BoardsPage> {
  final _scroll = ScrollController();

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final summaries = ref.watch(boardSummariesProvider);
    final synced = ref.watch(storeProvider.select((l) => l.synced));
    final byId = {for (final s in summaries) s.board.id: s};
    return ColoredBox(
      color: context.kit.bg,
      child: Column(
        children: [
          TopBar(
            title: 'Boards',
            splashTarget: true,
            onFix: () => openConnection(context),
            actions: [
              const BellButton(),
              Padding(
                padding: const EdgeInsets.only(left: Space.s1, right: Space.s2),
                child: KitButton(
                  label: 'New board',
                  icon: LucideIcons.plus,
                  small: true,
                  variant: ButtonVariant.primary,
                  onPressed: () async {
                    final id = await showNewBoardSheet(context, ref);
                    if (id != null) openBoard(ref, id);
                  },
                ),
              ),
            ],
          ),
          Expanded(
            child: summaries.isEmpty
                ? (synced ? const EmptyLine('No boards yet.') : const SizedBox.shrink())
                : LayoutBuilder(
                    builder: (context, box) {
                      const gap = Space.s3;
                      final width = (box.maxWidth - 2 * Space.s4 - gap) / 2;
                      return SingleChildScrollView(
                        controller: _scroll,
                        padding: const EdgeInsets.fromLTRB(Space.s4, Space.s2, Space.s4, Space.s6),
                        child: Reorderable(
                          ids: [for (final s in summaries) s.board.id],
                          scroll: _scroll,
                          radius: TackRadii.list,
                          layout: (children) => SizedBox(
                            width: double.infinity,
                            child: Wrap(spacing: gap, runSpacing: gap, children: children),
                          ),
                          itemBuilder: (context, id, _) => SizedBox(width: width, height: 112, child: _Tile(byId[id]!)),
                          onMove: (id, index) {
                            final others = [
                              for (final s in summaries)
                                if (s.board.id != id) s.board,
                            ];
                            ref.read(storeProvider.notifier).updateBoard(id, {'position': positionAt(others, index)});
                          },
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class _Tile extends ConsumerWidget {
  const _Tile(this.summary);
  final BoardSummary summary;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.kit;
    final board = summary.board;
    return Semantics(
      button: true,
      label: '${board.name}, ${summary.open} open${summary.overdue > 0 ? ', ${summary.overdue} overdue' : ''}',
      child: Pressable(
        scale: 0.98,
        onTap: () => openBoard(ref, board.id),
        child: Container(
          decoration: BoxDecoration(
            color: context.tack.board(board.color),
            borderRadius: BorderRadius.circular(TackRadii.list),
            border: Border.all(color: t.border),
          ),
          child: Stack(
            children: [
              Padding(
                padding: const EdgeInsets.all(Space.s3),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(board.glyph, style: context.text.titleLarge!.copyWith(fontSize: 22, height: 1.2)),
                    const SizedBox(height: 2),
                    Expanded(
                      child: Text(
                        board.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: context.text.titleSmall!.copyWith(fontSize: 15),
                      ),
                    ),
                    Row(
                      children: [
                        Text('${summary.open} open', style: context.mono(12)),
                        if (summary.overdue > 0) ...[
                          const SizedBox(width: Space.s2),
                          Icon(LucideIcons.flag, size: 12, color: t.negative),
                          const SizedBox(width: 3),
                          Flexible(
                            child: Text(
                              '${summary.overdue} overdue',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: context.mono(12, color: t.negative),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
              Positioned(
                top: 0,
                right: 0,
                child: IconBtn(
                  icon: LucideIcons.ellipsis,
                  label: 'Menu for ${board.name}',
                  onTap: () => showBoardMenu(context, ref, board),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// New board: name, emoji, colour. Returns the new board's id.
Future<String?> showNewBoardSheet(BuildContext context, WidgetRef ref) =>
    showKitSheet<String>(context, builder: (context) => const _NewBoardSheet());

class _NewBoardSheet extends ConsumerStatefulWidget {
  const _NewBoardSheet();

  @override
  ConsumerState<_NewBoardSheet> createState() => _NewBoardSheetState();
}

class _NewBoardSheetState extends ConsumerState<_NewBoardSheet> {
  final _name = TextEditingController();
  String? _emoji;
  String _color = 'neutral';
  bool _picking = false;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  void _submit() {
    final name = _name.text.trim();
    if (name.isEmpty) return;
    final id = ref.read(storeProvider.notifier).createBoard(name: name, emoji: _emoji, color: _color);
    Navigator.of(context).pop(id);
  }

  @override
  Widget build(BuildContext context) {
    return KitSheet(
      title: 'New board',
      footer: ListenableBuilder(
        listenable: _name,
        builder: (context, _) => KitButton(
          label: 'Create board',
          variant: ButtonVariant.primary,
          block: true,
          onPressed: _name.text.trim().isEmpty ? null : _submit,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          KitField(
            label: 'Name',
            child: TextField(
              controller: _name,
              autofocus: true,
              textCapitalization: TextCapitalization.sentences,
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _submit(),
            ),
          ),
          const SizedBox(height: Space.s4),
          const SectionLabel('Emoji'),
          Row(
            children: [
              Pressable(
                semanticLabel: 'Choose emoji',
                onTap: () => setState(() => _picking = !_picking),
                child: Container(
                  width: 48,
                  height: 48,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: context.kit.surface,
                    borderRadius: BorderRadius.circular(TackRadii.control),
                    border: Border.all(color: context.kit.borderStrong),
                  ),
                  child: _emoji != null
                      ? Text(_emoji!, style: const TextStyle(fontSize: 24))
                      : Icon(LucideIcons.smile, color: context.kit.textMuted),
                ),
              ),
              if (_emoji != null) ...[
                const SizedBox(width: Space.s2),
                KitButton(label: 'Remove', small: true, onPressed: () => setState(() => _emoji = null)),
              ],
            ],
          ),
          if (_picking) ...[
            const SizedBox(height: Space.s2),
            EmojiPicker(
              onPick: (e) => setState(() {
                _emoji = e;
                _picking = false;
              }),
            ),
          ],
          const SizedBox(height: Space.s4),
          const SectionLabel('Colour'),
          ColorPicker(value: _color, onChanged: (c) => setState(() => _color = c)),
        ],
      ),
    );
  }
}

/// A sheet with one text field, for renaming a board or a list.
Future<String?> showNameSheet(
  BuildContext context, {
  required String title,
  required String initial,
  String action = 'Save',
}) {
  return showKitSheet<String>(
    context,
    builder: (context) => _NameSheet(title: title, initial: initial, action: action),
  );
}

class _NameSheet extends StatefulWidget {
  const _NameSheet({required this.title, required this.initial, required this.action});
  final String title;
  final String initial;
  final String action;

  @override
  State<_NameSheet> createState() => _NameSheetState();
}

class _NameSheetState extends State<_NameSheet> {
  late final _name = TextEditingController(text: widget.initial)
    ..selection = TextSelection(baseOffset: 0, extentOffset: widget.initial.length);

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  void _submit() {
    final name = _name.text.trim();
    Navigator.of(context).pop(name.isEmpty ? null : name);
  }

  @override
  Widget build(BuildContext context) {
    return KitSheet(
      title: widget.title,
      footer: ListenableBuilder(
        listenable: _name,
        builder: (context, _) => KitButton(
          label: widget.action,
          variant: ButtonVariant.primary,
          block: true,
          onPressed: _name.text.trim().isEmpty ? null : _submit,
        ),
      ),
      child: KitField(
        label: 'Name',
        child: TextField(
          controller: _name,
          autofocus: true,
          textCapitalization: TextCapitalization.sentences,
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _submit(),
        ),
      ),
    );
  }
}

/// The board menu, on the tile and inside the board: Rename, Change emoji, Change colour, Delete.
Future<void> showBoardMenu(BuildContext context, WidgetRef ref, Board board, {VoidCallback? onDeleted}) {
  final store = ref.read(storeProvider.notifier);
  return showMenuSheet(
    context,
    title: board.title,
    items: [
      MenuItem('Rename', LucideIcons.pencil, () async {
        final name = await showNameSheet(context, title: 'Rename board', initial: board.name);
        if (name != null && name != board.name) store.updateBoard(board.id, {'name': name});
      }),
      MenuItem('Change emoji', LucideIcons.smile, () {
        showKitSheet<void>(
          context,
          builder: (context) => KitSheet(
            title: 'Change emoji',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                EmojiPicker(
                  onPick: (e) {
                    store.updateBoard(board.id, {'emoji': e});
                    Navigator.of(context).pop();
                  },
                ),
                if (board.emoji != null) ...[
                  const SizedBox(height: Space.s3),
                  KitButton(
                    label: 'Remove emoji',
                    block: true,
                    onPressed: () {
                      store.updateBoard(board.id, {'emoji': null});
                      Navigator.of(context).pop();
                    },
                  ),
                ],
              ],
            ),
          ),
        );
      }),
      MenuItem('Change colour', LucideIcons.palette, () {
        showKitSheet<void>(
          context,
          builder: (context) => Consumer(
            builder: (context, ref, _) => KitSheet(
              title: 'Change colour',
              child: ColorPicker(
                value: ref.watch(storeProvider.select((l) => l.boards[board.id]?.color)) ?? board.color,
                onChanged: (c) => store.updateBoard(board.id, {'color': c}),
              ),
            ),
          ),
        );
      }),
      MenuItem('Delete', LucideIcons.trash2, danger: true, () {
        store.trashBoard(board.id);
        onDeleted?.call();
        Toasts.show(
          'Board moved to Trash',
          duration: undoDuration,
          actionLabel: 'Undo',
          onAction: () => store.restoreBoard(board.id),
        );
      }),
    ],
  );
}
