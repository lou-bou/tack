import type { ComponentProps } from 'react';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'danger';

export function Button({
  variant = 'secondary',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`${styles.button} ${styles[variant]} ${className ?? ''}`}
      {...props}
    />
  );
}

/** An icon alone, so it has to carry its own name. */
export function IconButton({
  label,
  className,
  ...props
}: Omit<ComponentProps<'button'>, 'aria-label'> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`${styles.icon} ${className ?? ''}`}
      {...props}
    />
  );
}
