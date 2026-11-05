import { useState } from 'react';
import { Flag, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { BoardMenu, NewBoardSheet } from '../components/BoardSheets';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { boardGlyph, useBoards } from '../lib/boards';
import styles from './Boards.module.css';

export function BoardsPage() {
  const boards = useBoards();
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

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
      <ul className={styles.grid}>
        {boards?.map(({ board, open, overdue }) => (
          <li
            key={board.id}
            className={styles.tile}
            style={{ background: `var(--board-${board.color})` }}
          >
            <Link to={`/board/${board.id}`} className={styles.link}>
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
        ))}
      </ul>
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
