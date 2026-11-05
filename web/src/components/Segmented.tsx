import styles from './Segmented.module.css';

/** Native radios underneath, which bring arrow keys and screen reader support with them. */
export function Segmented<T extends string>({
  name,
  labelledBy,
  value,
  options,
  onChange,
}: {
  name: string;
  labelledBy: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className={styles.group} role="radiogroup" aria-labelledby={labelledBy}>
      {options.map((option) => (
        <label key={option.value} className={styles.segment}>
          <input
            className={styles.input}
            type="radio"
            name={name}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
          />
          <span className={styles.text}>{option.label}</span>
        </label>
      ))}
    </div>
  );
}
