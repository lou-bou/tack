import { useTodayCount } from '../lib/today';
import styles from './TodayBadge.module.css';

export function TodayBadge({ className = '' }: { className?: string }) {
  const count = useTodayCount();
  if (count === 0) return null;
  return (
    <span className={`${styles.badge} ${className}`}>
      <span className="sr-only">, </span>
      {count}
      <span className="sr-only"> due</span>
    </span>
  );
}
