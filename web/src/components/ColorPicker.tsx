import { Check } from 'lucide-react';
import { BOARD_COLORS, type BoardColor } from '@tack/shared';
import styles from './ColorPicker.module.css';

export function ColorPicker({
  value,
  onChange,
}: {
  value: BoardColor;
  onChange: (color: BoardColor) => void;
}) {
  return (
    <div className={styles.grid} role="radiogroup" aria-label="Board colour">
      {BOARD_COLORS.map((color) => (
        <label key={color} className={styles.swatch} title={color}>
          <input
            className={styles.input}
            type="radio"
            name="board-color"
            aria-label={color}
            checked={color === value}
            onChange={() => onChange(color)}
          />
          <span className={styles.chip} style={{ background: `var(--board-${color})` }}>
            {color === value && <Check />}
          </span>
        </label>
      ))}
    </div>
  );
}
