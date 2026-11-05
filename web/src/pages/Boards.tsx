import { Link } from 'react-router';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { boardGlyph, useBoards } from '../lib/boards';
import styles from './Boards.module.css';

export function BoardsPage() {
  const boards = useBoards();
  return (
    <Screen title="Boards">
      {boards?.length === 0 && <EmptyState message="No boards yet." />}
      <ul className={styles.list}>
        {boards?.map(({ board }) => (
          <li key={board.id}>
            <Link to={`/board/${board.id}`} className={styles.row}>
              <span aria-hidden="true">{boardGlyph(board)}</span>
              {board.name}
            </Link>
          </li>
        ))}
      </ul>
    </Screen>
  );
}
