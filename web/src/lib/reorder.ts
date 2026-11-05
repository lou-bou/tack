import { useMemo, useState } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import type { DragEndEvent } from '@dnd-kit/core';
import { positionAt, type Positioned } from '@tack/shared';
import { blockClickAfterDrag } from './dnd';

/**
 * Reorders a simple row of items. Keeps the dropped order on screen until the saved order comes
 * back from the database, so the item doesn't jump back for a frame.
 */
export function useReorder<T extends Positioned>(
  items: readonly T[] | undefined,
  save: (id: string, position: string) => void,
) {
  const [held, setHeld] = useState<{ ids: string[]; base: readonly T[] } | null>(null);

  const ordered = useMemo(() => {
    if (!items) return undefined;
    if (held?.base !== items) return items;
    const byId = new Map(items.map((item) => [item.id, item]));
    return held.ids.flatMap((id) => byId.get(id) ?? []);
  }, [items, held]);

  const onDragEnd = (event: DragEndEvent) => {
    blockClickAfterDrag();
    const { active, over } = event;
    if (!items || !over || active.id === over.id) return;
    const ids = items.map((item) => item.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const others = items.filter((item) => item.id !== active.id);
    setHeld({ ids: arrayMove(ids, from, to), base: items });
    save(String(active.id), positionAt(others, to));
  };

  return { ordered, onDragEnd };
}
