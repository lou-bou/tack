import type { ReactNode } from 'react';
import { Button } from './Button';
import styles from './SelectionBar.module.css';

/** The bar along the bottom while picking cards: how many, what to do with them, and Cancel. */
export function SelectionBar({
  count,
  onCancel,
  children,
}: {
  count: number;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <div className={styles.bar} role="region" aria-label="Selected cards">
      <span className={styles.count} aria-live="polite">
        {count === 0 ? 'Tap cards to select them' : `${count} selected`}
      </span>
      <div className={styles.actions}>
        {children}
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
