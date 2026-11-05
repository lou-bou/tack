import { useDroppable } from '@dnd-kit/core';
import type { List } from '@tack/shared';
import styles from './ListStrip.module.css';

function StripTab({ list, current, onJump }: { list: List; current: boolean; onJump: () => void }) {
  // Also a drop target: dropping a card here sends it to the end of this list.
  const { setNodeRef, isOver } = useDroppable({
    id: `strip:${list.id}`,
    data: { type: 'strip', listId: list.id },
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`${styles.tab} ${current ? styles.current : ''} ${isOver ? styles.over : ''}`}
      aria-current={current ? 'true' : undefined}
      onClick={onJump}
    >
      {list.name}
    </button>
  );
}

/** Phone only: jumps between lists, and marks the one on screen. */
export function ListStrip({
  lists,
  current,
  onJump,
}: {
  lists: readonly List[];
  current: number;
  onJump: (index: number) => void;
}) {
  if (lists.length === 0) return null;
  return (
    <nav className={styles.strip} aria-label="Lists">
      {lists.map((list, index) => (
        <StripTab
          key={list.id}
          list={list}
          current={index === current}
          onJump={() => onJump(index)}
        />
      ))}
    </nav>
  );
}
