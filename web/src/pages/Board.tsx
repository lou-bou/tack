import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, DragOverlay, MeasuringStrategy } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { Eye, EyeOff, Plus } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '../components/Button';
import { BoardMenu } from '../components/BoardSheets';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { CardFace } from '../components/board/CardFace';
import { ListColumn, ListPreview } from '../components/board/ListColumn';
import { ListStrip } from '../components/board/ListStrip';
import { createList, updateBoard } from '../data/actions';
import { boardTitle, useBoardView, useNow } from '../lib/boards';
import { useBoardDrag } from '../lib/boardDrag';
import { useCompletion } from '../lib/completion';
import { boardCollision, useDragSensors } from '../lib/dnd';
import fieldStyles from '../components/Field.module.css';
import columnStyles from '../components/board/ListColumn.module.css';
import styles from './Board.module.css';

// Cards crossing lists change the layout mid-drag, so drop targets have to stay freshly measured.
const MEASURING = { droppable: { strategy: MeasuringStrategy.Always } };

function AddList({ boardId }: { boardId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const close = () => {
    setOpen(false);
    setName('');
  };

  if (!open) {
    return (
      <Button className={styles.addList} onClick={() => setOpen(true)}>
        <Plus />
        Add list
      </Button>
    );
  }
  return (
    <form
      className={styles.addListForm}
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = name.trim();
        if (trimmed) void createList(boardId, trimmed);
        setName('');
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') close();
      }}
    >
      <input
        className={fieldStyles.input}
        aria-label="List name"
        placeholder="List name"
        value={name}
        autoFocus
        enterKeyHint="done"
        onChange={(event) => setName(event.target.value)}
        onBlur={close}
      />
    </form>
  );
}

export function BoardPage() {
  const { boardId = '' } = useParams();
  const view = useBoardView(boardId);
  const now = useNow();
  const navigate = useNavigate();
  const { lingering, toggle } = useCompletion();
  const scroller = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const currentRef = useRef(0);
  const sensors = useDragSensors();

  const jumpTo = useCallback((index: number) => {
    const columns = scroller.current?.querySelectorAll('[data-list-column]');
    columns?.[index]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, []);
  const page = useCallback(
    (direction: 1 | -1) => {
      // Stops at the last list: a card can't be dropped on the "Add list" slot.
      const count = scroller.current?.querySelectorAll('section[data-list-column]').length ?? 0;
      const next = currentRef.current + direction;
      if (next >= 0 && next < count) jumpTo(next);
    },
    [jumpTo],
  );
  const { lists, active, lastOver, announcements, handlers } = useBoardDrag(view, lingering, page);
  const collision = useMemo(() => boardCollision(lastOver), [lastOver]);

  // Which list a phone is showing, for the underline in the strip.
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const onScroll = () => {
      const center = element.scrollLeft + element.clientWidth / 2;
      const columns = Array.from(element.querySelectorAll<HTMLElement>('[data-list-column]'));
      const distance = (column: HTMLElement) =>
        Math.abs(column.offsetLeft + column.offsetWidth / 2 - center);
      let best = 0;
      columns.forEach((column, index) => {
        const bestColumn = columns[best];
        if (bestColumn && distance(column) < distance(bestColumn)) best = index;
      });
      currentRef.current = best;
      setCurrent(best);
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => element.removeEventListener('scroll', onScroll);
  });

  if (view === undefined) return <Screen title="" />;
  if (view === null) {
    return (
      <Screen title="Board not found">
        <EmptyState
          message="This board doesn't exist or is in Trash."
          action={<Link to="/">Back to boards</Link>}
        />
      </Screen>
    );
  }

  const { board } = view;
  const activeCard =
    active?.type === 'card'
      ? lists.flatMap((l) => l.cards).find((card) => card.id === active.id)
      : undefined;
  const activeList =
    active?.type === 'list' ? lists.find((l) => l.list.id === active.id) : undefined;

  return (
    <Screen
      title={boardTitle(board)}
      background={`var(--board-${board.color})`}
      flush
      actions={
        <>
          <button
            type="button"
            className={styles.toggle}
            aria-pressed={board.showCompleted}
            title="Show completed"
            onClick={() => void updateBoard(board.id, { showCompleted: !board.showCompleted })}
          >
            {board.showCompleted ? <Eye /> : <EyeOff />}
            <span className={styles.toggleLabel}>Show completed</span>
          </button>
          <BoardMenu board={board} onDeleted={() => void navigate('/')} />
        </>
      }
    >
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        measuring={MEASURING}
        accessibility={{ announcements }}
        autoScroll={{
          // Phones page a whole list at a time from the screen edge instead.
          canScroll: (element) =>
            !(element === scroller.current && matchMedia('(width < 900px)').matches),
        }}
        {...handlers}
      >
        <ListStrip lists={lists.map((l) => l.list)} current={current} onJump={jumpTo} />
        <div ref={scroller} className={`${styles.lists} ${active ? styles.dragging : ''}`}>
          <SortableContext
            items={lists.map((l) => l.list.id)}
            strategy={horizontalListSortingStrategy}
          >
            {lists.map(({ list, cards }) => (
              <ListColumn
                key={list.id}
                list={list}
                cards={cards}
                boardId={board.id}
                showCompleted={board.showCompleted}
                lingering={lingering}
                now={now}
                onToggle={toggle}
              />
            ))}
          </SortableContext>
          <div className={styles.addListSlot} data-list-column>
            <AddList boardId={board.id} />
          </div>
        </div>
        <DragOverlay>
          {activeCard && (
            <div className={columnStyles.liftedCard}>
              <CardFace
                card={activeCard}
                now={now}
                showCompleted={board.showCompleted}
                onToggle={toggle}
              />
            </div>
          )}
          {activeList && <ListPreview list={activeList.list} cards={activeList.cards} now={now} />}
        </DragOverlay>
      </DndContext>
    </Screen>
  );
}
