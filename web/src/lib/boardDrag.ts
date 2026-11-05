import { useCallback, useMemo, useRef, useState } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import type {
  Announcements,
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import { dropPosition, positionAt, type Card, type List } from '@tack/shared';
import { updateCard, updateList } from '../data/actions';
import type { BoardView } from './boards';
import type { DragData } from './dnd';

const EDGE_PX = 40;
const PAGE_DELAY_MS = 350;
const PAGE_REPEAT_MS = 700;

export interface DisplayList {
  list: List;
  /** The cards on screen, in order. */
  cards: Card[];
}

interface Order {
  lists: string[];
  cards: Map<string, string[]>;
  /** The view this order was made from. Once a newer one arrives, the saved data takes over. */
  base: BoardView;
  dragging: boolean;
}

function visibleCards(
  cards: readonly Card[],
  showCompleted: boolean,
  lingering: ReadonlySet<string>,
): Card[] {
  return cards.filter((c) => showCompleted || !c.completed || lingering.has(c.id));
}

function clientXOf(event: DragMoveEvent): number | null {
  const start = event.activatorEvent;
  if (window.TouchEvent && start instanceof TouchEvent) {
    const touch = start.touches[0] ?? start.changedTouches[0];
    return touch ? touch.clientX + event.delta.x : null;
  }
  return start instanceof MouseEvent ? start.clientX + event.delta.x : null;
}

/**
 * The order on screen while dragging lives here, not in the database, and only the drop writes.
 * A card crossing lists moves in this state, so the target list makes room as it would for a card
 * of its own.
 */
export function useBoardDrag(
  view: BoardView | null | undefined,
  lingering: ReadonlySet<string>,
  onPage: (direction: 1 | -1) => void,
) {
  const [order, setOrder] = useState<Order | null>(null);
  const [active, setActive] = useState<{ type: 'card' | 'list'; id: string } | null>(null);
  const lastOver = useRef<string | null>(null);
  const paging = useRef<{ direction: 1 | -1; since: number } | null>(null);

  const showCompleted = view?.board.showCompleted ?? false;

  const lists: DisplayList[] = useMemo(() => {
    if (!view) return [];
    const useOrder = order && (order.dragging || order.base === view);
    if (!useOrder) {
      return view.lists.map(({ list, cards }) => ({
        list,
        cards: visibleCards(cards, showCompleted, lingering),
      }));
    }
    const listById = new Map(view.lists.map((l) => [l.list.id, l.list]));
    const cardById = new Map(view.lists.flatMap((l) => l.cards).map((c) => [c.id, c]));
    return order.lists.flatMap((id) => {
      const list = listById.get(id);
      if (!list) return [];
      const ids = order.cards.get(id) ?? [];
      return [{ list, cards: ids.flatMap((cardId) => cardById.get(cardId) ?? []) }];
    });
  }, [view, order, showCompleted, lingering]);

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      if (!view) return;
      const data = event.active.data.current as DragData;
      setActive({ type: data.type as 'card' | 'list', id: String(event.active.id) });
      lastOver.current = null;
      paging.current = null;
      navigator.vibrate?.(10);
      setOrder({
        lists: view.lists.map((l) => l.list.id),
        cards: new Map(
          view.lists.map((l) => [
            l.list.id,
            visibleCards(l.cards, showCompleted, lingering).map((c) => c.id),
          ]),
        ),
        base: view,
        dragging: true,
      });
    },
    [view, showCompleted, lingering],
  );

  const onDragOver = useCallback((event: DragOverEvent) => {
    const { active: dragged, over } = event;
    if (!over) return;
    lastOver.current = String(over.id);
    const data = dragged.data.current as DragData;
    const overData = over.data.current as DragData | undefined;
    if (data.type !== 'card' || overData?.type === 'strip') return;

    const cardId = String(dragged.id);
    const toList = overData?.type === 'list' ? String(over.id) : overData?.listId;
    if (!toList) return;
    setOrder((current) => {
      if (!current) return current;
      const fromList = [...current.cards].find(([, ids]) => ids.includes(cardId))?.[0];
      if (!fromList || fromList === toList) return current;
      const cards = new Map(current.cards);
      cards.set(
        fromList,
        (cards.get(fromList) ?? []).filter((id) => id !== cardId),
      );
      const target = [...(cards.get(toList) ?? [])];
      const at = overData?.type === 'card' ? target.indexOf(String(over.id)) : -1;
      target.splice(at >= 0 ? at : target.length, 0, cardId);
      cards.set(toList, target);
      return { ...current, cards };
    });
  }, []);

  const finish = useCallback(() => {
    setActive(null);
    paging.current = null;
  }, []);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      finish();
      const { active: dragged, over } = event;
      const data = dragged.data.current as DragData;
      if (!order || !view) return setOrder(null);
      const id = String(dragged.id);

      if (data.type === 'list') {
        const from = order.lists.indexOf(id);
        const to = over ? order.lists.indexOf(String(over.id)) : from;
        if (to < 0 || from === to) return setOrder(null);
        const next = arrayMove(order.lists, from, to);
        const others = view.lists.map((l) => l.list).filter((l) => l.id !== id);
        const after = next.slice(0, next.indexOf(id)).length;
        void updateList(id, { position: positionAt(others, after) });
        return setOrder({ ...order, lists: next, dragging: false });
      }

      const overData = over?.data.current as DragData | undefined;
      const cards = new Map(order.cards);
      const fromList = [...cards].find(([, ids]) => ids.includes(id))?.[0];
      if (!fromList) return setOrder(null);
      let toList = fromList;
      if (overData?.type === 'strip' && overData.listId) {
        // Dropping on a name in the strip puts the card at the end of that list.
        toList = overData.listId;
        cards.set(
          fromList,
          (cards.get(fromList) ?? []).filter((c) => c !== id),
        );
        cards.set(toList, [...(cards.get(toList) ?? []).filter((c) => c !== id), id]);
      } else if (overData?.type === 'card') {
        const ids = cards.get(fromList) ?? [];
        const to = ids.indexOf(String(over?.id));
        if (to >= 0) cards.set(fromList, arrayMove(ids, ids.indexOf(id), to));
      }

      const original = view.lists.find((l) => l.cards.some((c) => c.id === id));
      const visibleBefore = original
        ? visibleCards(original.cards, showCompleted, lingering).map((c) => c.id)
        : [];
      const visibleAfter = cards.get(toList) ?? [];
      const unchanged =
        original?.list.id === toList && visibleBefore.join() === visibleAfter.join();
      if (unchanged) return setOrder(null);

      const siblings =
        view.lists.find((l) => l.list.id === toList)?.cards.filter((c) => c.id !== id) ?? [];
      void updateCard(id, {
        listId: toList,
        position: dropPosition(siblings, visibleAfter, id),
      });
      return setOrder({ ...order, cards, dragging: false });
    },
    [order, view, showCompleted, lingering, finish],
  );

  const onDragCancel = useCallback(() => {
    finish();
    setOrder(null);
  }, [finish]);

  // Phone: holding a card at the screen edge pages to the next list (SPEC §3.3).
  const onDragMove = useCallback(
    (event: DragMoveEvent) => {
      if (!matchMedia('(width < 900px)').matches) return;
      if ((event.active.data.current as DragData).type !== 'card') return;
      const x = clientXOf(event);
      if (x === null) return;
      let direction: 1 | -1 | 0 = 0;
      if (x < EDGE_PX) direction = -1;
      else if (x > innerWidth - EDGE_PX) direction = 1;
      if (direction === 0) {
        paging.current = null;
        return;
      }
      const now = performance.now();
      if (paging.current?.direction !== direction) {
        paging.current = { direction, since: now };
      } else if (now - paging.current.since >= PAGE_DELAY_MS) {
        onPage(direction);
        paging.current = { direction, since: now + PAGE_REPEAT_MS - PAGE_DELAY_MS };
      }
    },
    [onPage],
  );

  const announcements: Announcements = useMemo(() => {
    const listName = (id: unknown) => view?.lists.find((l) => l.list.id === id)?.list.name;
    return {
      onDragStart: () => undefined,
      onDragOver: () => undefined,
      onDragEnd: ({ active: dragged, over }) => {
        const data = over?.data.current as DragData | undefined;
        const name = listName(data?.type === 'list' ? over?.id : data?.listId);
        if ((dragged.data.current as DragData).type === 'list') return 'List moved';
        return name ? `Moved to ${name}` : undefined;
      },
      onDragCancel: () => 'Move cancelled',
    };
  }, [view]);

  return {
    lists,
    active,
    lastOver,
    announcements,
    handlers: { onDragStart, onDragOver, onDragMove, onDragEnd, onDragCancel },
  };
}
