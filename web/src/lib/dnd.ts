import {
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DroppableContainer,
} from '@dnd-kit/core';

export interface DragData {
  type: 'card' | 'list' | 'strip';
  /** For cards, the list it's showing in right now. For the strip, the list it stands for. */
  listId?: string;
}

const dataOf = (container: DroppableContainer) => container.data.current as DragData | undefined;

/** Mouse drags after a small move. Touch needs the long press, so scrolling still works (SPEC). */
export function useDragSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );
}

/**
 * Cards: the strip wins, then the list under the finger, then the nearest card in that list. Only
 * ever comparing one list's cards also keeps this cheap on a 200-card board.
 */
export function boardCollision(lastOver: { current: string | null }): CollisionDetection {
  return (args) => {
    const containers = args.droppableContainers;
    if ((args.active.data.current as DragData | undefined)?.type === 'list') {
      return closestCenter({
        ...args,
        droppableContainers: containers.filter((c) => dataOf(c)?.type === 'list'),
      });
    }
    const strip = pointerWithin({
      ...args,
      droppableContainers: containers.filter((c) => dataOf(c)?.type === 'strip'),
    });
    if (strip.length > 0) return strip;

    const lists = pointerWithin({
      ...args,
      droppableContainers: containers.filter((c) => dataOf(c)?.type === 'list'),
    });
    const list = lists[0];
    if (!list) return lastOver.current ? [{ id: lastOver.current }] : [];
    const cards = containers.filter(
      (c) => dataOf(c)?.type === 'card' && dataOf(c)?.listId === list.id,
    );
    if (cards.length === 0) return [list];
    return closestCenter({ ...args, droppableContainers: cards });
  };
}

/**
 * Call when a drag ends. dnd-kit stops the click that follows from reaching React, but a link's
 * own navigation still happens, so dropping on a board's name would reload the page.
 */
export function blockClickAfterDrag(): void {
  const block = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  window.addEventListener('click', block, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', block, { capture: true }), 50);
}
