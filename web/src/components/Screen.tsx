import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ConnectionPill } from './ConnectionPill';
import { LogoMark } from './Logo';
import styles from './Screen.module.css';

/**
 * A screen's title and content. On a phone the header is the top bar, with the logo and status;
 * on desktop those live in the sidebar and it's just the title row.
 */
export function Screen({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <Link to="/" className={styles.logo} aria-label="All boards">
          <LogoMark />
        </Link>
        <h1 className={styles.title}>{title}</h1>
        <div className={styles.end}>
          <span className={styles.status}>
            <ConnectionPill />
          </span>
          {actions}
        </div>
      </header>
      <div className={styles.body}>{children}</div>
    </div>
  );
}
