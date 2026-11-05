import { useMemo, useState } from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Flag, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { BoardMenu, NewBoardSheet } from '../components/BoardSheets';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { updateBoard } from '../data/actions';
import { boardGlyph, useBoards, type BoardSummary } from '../lib/boards';
import { useDragSensors } from '../lib/dnd';
import { useReorder } from '../lib/reorder';
import styles from './Boards.module.css';

type Row = BoardSummary & { id: string; position: string };

function Tile({ summary }: { summary: Row }) {
  const { board, open, overdue } = summary;
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id: board.id,
  });
  return (
    <li
      ref={setNodeRef}
      className={`${styles.tile} ${isDragging ? styles.lifted : ''}`}
      style={{
        background: `var(--board-${board.color})`,
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      {...listeners}
    >
      <Link to={`/board/${board.id}`} className={styles.link} draggable={false}>
        <span className={styles.glyph} aria-hidden="true">
          {boardGlyph(board)}
        </span>
        <span className={styles.name}>{board.name}</span>
      </Link>
      <div className={styles.counts}>
        <span>{open} open</span>
        {overdue > 0 && (
          <span className={styles.overdue}>
            <Flag />
            {overdue} overdue
          </span>
        )}
      </div>
      <div className={styles.menu}>
        <BoardMenu board={board} />
      </div>
    </li>
  );
}

export function BoardsPage() {
  const boards = useBoards();
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const rows = useMemo(
    () =>
      boards?.map((summary) => ({
        ...summary,
        id: summary.board.id,
        position: summary.board.position,
      })),
    [boards],
  );
  const { ordered, onDragEnd } = useReorder(
    rows,
    (id, position) => void updateBoard(id, { position }),
  );
  const sensors = useDragSensors();

  return (
    <Screen
      title="Boards"
      actions={
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus />
          New board
        </Button>
      }
    >
      {boards?.length === 0 && <EmptyState message="No boards yet." />}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ordered?.map((b) => b.id) ?? []} strategy={rectSortingStrategy}>
          <ul className={styles.grid}>
            {ordered?.map((summary) => (
              <Tile key={summary.id} summary={summary} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <NewBoardSheet
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false);
          void navigate(`/board/${id}`);
        }}
      />
    </Screen>
  );
}
