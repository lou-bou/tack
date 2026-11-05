import { useLiveQuery } from 'dexie-react-hooks';
import { CloudOff, LogIn, RefreshCw } from 'lucide-react';
import { syncStatus } from '../data';
import styles from './ConnectionPill.module.css';

/** Says why changes aren't reaching the server, and offers the fix when there is one. */
export function ConnectionPill({ iconOnly = false }: { iconOnly?: boolean }) {
  const status = useLiveQuery(syncStatus, []);
  const cls = `${styles.pill} ${iconOnly ? styles.iconOnly : ''}`;

  if (status === 'offline') {
    const label = 'Offline · changes will sync';
    return (
      <span className={cls} role="status" title={iconOnly ? label : undefined}>
        <CloudOff />
        <span className={iconOnly ? 'sr-only' : undefined}>{label}</span>
      </span>
    );
  }
  if (status === 'expired') {
    // A real navigation: the service worker leaves /api/ alone, so it reaches the Access login.
    const label = 'Session expired · Sign in';
    return (
      <a className={cls} href="/api/auth/refresh" title={iconOnly ? label : undefined}>
        <LogIn />
        <span className={iconOnly ? 'sr-only' : undefined}>{label}</span>
      </a>
    );
  }
  if (status === 'outdated') {
    const label = 'Update needed · Reload';
    return (
      <button
        className={cls}
        type="button"
        title={iconOnly ? label : undefined}
        onClick={() => location.reload()}
      >
        <RefreshCw />
        <span className={iconOnly ? 'sr-only' : undefined}>{label}</span>
      </button>
    );
  }
  return null;
}
