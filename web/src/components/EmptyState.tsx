import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

/** One short line and at most one action (DESIGN). */
export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className={styles.empty}>
      <p>{message}</p>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
