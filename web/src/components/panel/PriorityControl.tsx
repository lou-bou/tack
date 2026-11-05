import { ChevronDown, ChevronUp, ChevronsUp, Equal, Minus } from 'lucide-react';
import type { Priority } from '@tack/shared';
import styles from './PriorityControl.module.css';

const LEVELS: { value: Priority; label: string; Icon: typeof Minus }[] = [
  { value: 'none', label: 'None', Icon: Minus },
  { value: 'low', label: 'Low', Icon: ChevronDown },
  { value: 'medium', label: 'Medium', Icon: Equal },
  { value: 'high', label: 'High', Icon: ChevronUp },
  { value: 'urgent', label: 'Urgent', Icon: ChevronsUp },
];

/** Five segments, each an icon and a label, and one tap sets it (SPEC §3.5). */
export function PriorityControl({
  value,
  onChange,
}: {
  value: Priority;
  onChange: (priority: Priority) => void;
}) {
  return (
    <div className={styles.group} role="radiogroup" aria-label="Priority">
      {LEVELS.map(({ value: level, label, Icon }) => (
        <label key={level} className={styles.segment}>
          <input
            className={styles.input}
            type="radio"
            name="card-priority"
            checked={level === value}
            onChange={() => onChange(level)}
          />
          <span className={styles.face}>
            <span
              className={styles.icon}
              style={level === 'none' ? undefined : { color: `var(--priority-${level})` }}
            >
              <Icon />
            </span>
            {label}
          </span>
        </label>
      ))}
    </div>
  );
}
