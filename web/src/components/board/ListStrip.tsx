import type { List } from '@tack/shared';
import styles from './ListStrip.module.css';

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
        <button
          key={list.id}
          type="button"
          data-strip-list={list.id}
          className={`${styles.tab} ${index === current ? styles.current : ''}`}
          aria-current={index === current ? 'true' : undefined}
          onClick={() => onJump(index)}
        >
          {list.name}
        </button>
      ))}
    </nav>
  );
}
