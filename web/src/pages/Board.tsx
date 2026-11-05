import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Plus } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '../components/Button';
import { BoardMenu } from '../components/BoardSheets';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { ListColumn } from '../components/board/ListColumn';
import { ListStrip } from '../components/board/ListStrip';
import { createList, updateBoard } from '../data/actions';
import { boardTitle, useBoardView, useNow } from '../lib/boards';
import { useCompletion } from '../lib/completion';
import fieldStyles from '../components/Field.module.css';
import styles from './Board.module.css';

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

  // Which list a phone is showing, for the underline in the strip.
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const onScroll = () => {
      const center = element.scrollLeft + element.clientWidth / 2;
      const columns = Array.from(element.querySelectorAll<HTMLElement>('[data-list-column]'));
      let best = 0;
      columns.forEach((column, index) => {
        const middle = column.offsetLeft + column.offsetWidth / 2;
        const bestColumn = columns[best];
        if (
          bestColumn &&
          Math.abs(middle - center) <
            Math.abs(bestColumn.offsetLeft + bestColumn.offsetWidth / 2 - center)
        ) {
          best = index;
        }
      });
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

  const { board, lists } = view;
  const jumpTo = (index: number) => {
    const columns = scroller.current?.querySelectorAll('[data-list-column]');
    columns?.[index]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  };

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
      <ListStrip lists={lists.map((l) => l.list)} current={current} onJump={jumpTo} />
      <div ref={scroller} className={styles.lists}>
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
        <div className={styles.addListSlot} data-list-column>
          <AddList boardId={board.id} />
        </div>
      </div>
    </Screen>
  );
}
