import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router';
import { Bell } from './Bell';
import { ConnectionPill } from './ConnectionPill';
import { LogoMark } from './Logo';
import styles from './Screen.module.css';

/**
 * A screen's title and content. On a phone the header is the top bar, with the logo and status;
 * on desktop those live in the sidebar and it's just the title row. `flush` hands all scrolling
 * and padding to the content, for the board's own lists.
 */
export function Screen({
  title,
  actions,
  background,
  flush = false,
  children,
}: {
  title: string;
  actions?: ReactNode;
  background?: string;
  flush?: boolean;
  children?: ReactNode;
}) {
  const style: CSSProperties | undefined = background ? { background } : undefined;
  return (
    <div className={styles.screen} style={style}>
      <header className={styles.header}>
        <Link to="/" className={styles.logo} aria-label="All boards">
          <LogoMark />
        </Link>
        <h1 className={styles.title}>{title}</h1>
        <div className={styles.end}>
          <Bell className={styles.bell} />
          {actions}
        </div>
        <div className={styles.pillRow}>
          <ConnectionPill />
        </div>
      </header>
      <div className={flush ? styles.flush : styles.body}>{children}</div>
    </div>
  );
}
