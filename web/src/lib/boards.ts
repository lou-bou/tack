import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { byPosition, isCardLive, isOverdue, type Board } from '@tack/shared';
import { db } from '../data';

const MINUTE = 60_000;

/** The current time, refreshed each minute so overdue states change without an edit. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), MINUTE);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export interface BoardSummary {
  board: Board;
  hasOverdue: boolean;
}

/** Live boards in order. Undefined while loading, so screens don't flash an empty state. */
export function useBoards(): BoardSummary[] | undefined {
  const now = useNow();
  return useLiveQuery(async () => {
    const [boards, lists, cards] = await Promise.all([
      db.boards.toArray(),
      db.lists.toArray(),
      db.cards.toArray(),
    ]);
    const boardById = new Map(boards.map((b) => [b.id, b]));
    const listById = new Map(lists.map((l) => [l.id, l]));
    const overdueBoards = new Set(
      cards
        .filter(
          (c) =>
            c.due && !c.completed && isOverdue(c.due, now) && isCardLive(c, listById, boardById),
        )
        .map((c) => c.boardId),
    );
    return boards
      .filter((b) => !b.deletedAt)
      .sort(byPosition)
      .map((board) => ({ board, hasOverdue: overdueBoards.has(board.id) }));
  }, [now]);
}

/** What stands for a board where there's only room for a glyph: its emoji or first letter. */
export function boardGlyph(board: Pick<Board, 'emoji' | 'name'>): string {
  return board.emoji || (Array.from(board.name)[0]?.toUpperCase() ?? '');
}
