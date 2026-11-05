import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { selectToday, todayBadgeCount, type Card, type TodayGroup } from '@tack/shared';
import { useToast } from '../components/Toast';
import { db } from '../data';
import { setCardCompleted } from '../data/actions';
import { useNow } from './boards';

const UNDO_MS = 5000;
const COLLAPSE_MS = 250;

export interface TodayRow {
  card: Card;
  listName: string;
  /** In its collapse animation, on the way out. */
  leaving: boolean;
}

export interface TodayRowGroup extends Omit<TodayGroup, 'cards'> {
  rows: TodayRow[];
}

/**
 * Cards on Today, with ticking in place (PLAN §5): a ticked card stays struck through for as long
 * as its Undo toast runs, then collapses out. The tick itself is saved straight away.
 */
export function useToday() {
  const now = useNow();
  const toast = useToast();
  const [held, setHeld] = useState<ReadonlyMap<string, 'held' | 'leaving'>>(new Map());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>[]>());

  const data = useLiveQuery(async () => {
    const [boards, lists, cards] = await Promise.all([
      db.boards.toArray(),
      db.lists.toArray(),
      db.cards.toArray(),
    ]);
    return { boards, lists, cards };
  }, []);

  const groups = useMemo<TodayRowGroup[] | undefined>(() => {
    if (!data) return undefined;
    const listName = new Map(data.lists.map((l) => [l.id, l.name]));
    const actual = new Map(data.cards.map((c) => [c.id, c]));
    // A held card still counts as open for choosing what's on the screen.
    const forSelection = data.cards.map((c) => (held.has(c.id) ? { ...c, completed: false } : c));
    return selectToday(data.boards, data.lists, forSelection, now).map(({ board, cards }) => ({
      board,
      rows: cards.map((card) => ({
        card: actual.get(card.id) ?? card,
        listName: listName.get(card.listId) ?? '',
        leaving: held.get(card.id) === 'leaving',
      })),
    }));
  }, [data, held, now]);

  const release = useCallback((id: string) => {
    for (const timer of timers.current.get(id) ?? []) clearTimeout(timer);
    timers.current.delete(id);
    setHeld((current) => {
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const list of pending.values()) for (const timer of list) clearTimeout(timer);
    };
  }, []);

  const toggle = useCallback(
    (card: { id: string; completed: boolean }) => {
      if (card.completed) {
        // Unticking within the Undo window keeps it on the screen, now open again.
        void setCardCompleted(card.id, false);
        release(card.id);
        return;
      }
      void setCardCompleted(card.id, true);
      setHeld((current) => new Map(current).set(card.id, 'held'));
      timers.current.set(card.id, [
        setTimeout(() => {
          setHeld((current) => new Map(current).set(card.id, 'leaving'));
        }, UNDO_MS),
        setTimeout(() => release(card.id), UNDO_MS + COLLAPSE_MS),
      ]);
      toast.show('Card completed', {
        label: 'Undo',
        onAction: () => {
          void setCardCompleted(card.id, false);
          release(card.id);
        },
      });
    },
    [release, toast],
  );

  return { groups, now, toggle };
}

/** Overdue plus due today, for the badge on the Today tab and sidebar item. */
export function useTodayCount(): number {
  const now = useNow();
  return (
    useLiveQuery(async () => {
      const [boards, lists, cards] = await Promise.all([
        db.boards.toArray(),
        db.lists.toArray(),
        db.cards.toArray(),
      ]);
      return todayBadgeCount(boards, lists, cards, now);
    }, [now]) ?? 0
  );
}
