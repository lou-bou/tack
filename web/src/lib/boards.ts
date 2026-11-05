import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { byPosition, isCardLive, isOverdue, type Board, type Card, type List } from '@tack/shared';
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
  open: number;
  overdue: number;
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
    const open = new Map<string, number>();
    const overdue = new Map<string, number>();
    for (const card of cards) {
      if (card.completed || !isCardLive(card, listById, boardById)) continue;
      open.set(card.boardId, (open.get(card.boardId) ?? 0) + 1);
      if (card.due && isOverdue(card.due, now)) {
        overdue.set(card.boardId, (overdue.get(card.boardId) ?? 0) + 1);
      }
    }
    return boards
      .filter((b) => !b.deletedAt)
      .sort(byPosition)
      .map((board) => ({
        board,
        open: open.get(board.id) ?? 0,
        overdue: overdue.get(board.id) ?? 0,
      }));
  }, [now]);
}

export interface ListWithCards {
  list: List;
  /** Every live card in position order, completed ones included. */
  cards: Card[];
}

export interface BoardView {
  board: Board;
  lists: ListWithCards[];
}

/** One board with its lists and cards. Null once loaded if it's missing or in Trash. */
export function useBoardView(boardId: string): BoardView | null | undefined {
  return useLiveQuery(async () => {
    const board = await db.boards.get(boardId);
    if (!board || board.deletedAt) return null;
    const [lists, cards] = await Promise.all([
      db.lists.where('boardId').equals(boardId).toArray(),
      db.cards.where('boardId').equals(boardId).toArray(),
    ]);
    const byList = new Map<string, Card[]>();
    for (const card of cards) {
      if (card.deletedAt) continue;
      const group = byList.get(card.listId);
      if (group) group.push(card);
      else byList.set(card.listId, [card]);
    }
    return {
      board,
      lists: lists
        .filter((l) => !l.deletedAt)
        .sort(byPosition)
        .map((list) => ({ list, cards: (byList.get(list.id) ?? []).sort(byPosition) })),
    };
  }, [boardId]);
}

/** What stands for a board where there's only room for a glyph: its emoji or first letter. */
export function boardGlyph(board: Pick<Board, 'emoji' | 'name'>): string {
  return board.emoji || (Array.from(board.name)[0]?.toUpperCase() ?? '');
}

export function boardTitle(board: Pick<Board, 'emoji' | 'name'>): string {
  return board.emoji ? `${board.emoji} ${board.name}` : board.name;
}
