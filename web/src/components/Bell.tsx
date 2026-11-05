import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bell as BellIcon } from 'lucide-react';
import { NOTIFICATION_KEEP_DAYS, formatTimestamp, type Notification } from '@tack/shared';
import { db, store } from '../data';
import { useCardPanel } from '../lib/cardPanel';
import { useNow } from '../lib/boards';
import { Sheet } from './Sheet';
import styles from './Bell.module.css';

const DAY_MS = 86_400_000;

function useNotifications(): Notification[] {
  const now = useNow();
  return (
    useLiveQuery(async () => {
      const cutoff = new Date(now - NOTIFICATION_KEEP_DAYS * DAY_MS).toISOString();
      const rows = await db.notifications.toArray();
      return rows
        .filter((n) => n.createdAt >= cutoff)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    }, [now]) ?? []
  );
}

/** The bell, with its unread dot and the list it opens. Opening the list marks them read. */
export function Bell({ className, label }: { className?: string; label?: ReactNode }) {
  const notifications = useNotifications();
  const { open: openCard } = useCardPanel();
  const [open, setOpen] = useState(false);
  // What was unread when the list opened stays marked, though it's now saved as read.
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const unread = notifications.filter((n) => !n.readAt);

  const show = () => {
    setFresh(new Set(unread.map((n) => n.id)));
    setOpen(true);
    const readAt = new Date().toISOString();
    for (const notification of unread) {
      void store.update('notifications', notification.id, { readAt });
    }
  };

  const name = unread.length > 0 ? `Notifications, ${unread.length} unread` : 'Notifications';
  return (
    <>
      <button
        type="button"
        className={className}
        aria-label={name}
        title="Notifications"
        onClick={show}
      >
        <span className={styles.icon}>
          <BellIcon />
          {unread.length > 0 && <span className={styles.dot} />}
        </span>
        {label}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Notifications">
        {notifications.length === 0 ? (
          <p className={styles.empty}>Nothing yet. Cards due tomorrow will show up here.</p>
        ) : (
          <ul className={styles.list}>
            {notifications.map((notification) => (
              <li key={notification.id}>
                <button
                  type="button"
                  className={`${styles.row} ${fresh.has(notification.id) ? styles.fresh : ''}`}
                  onClick={() => {
                    setOpen(false);
                    openCard(notification.cardId);
                  }}
                >
                  <span className={styles.title}>{notification.title}</span>
                  <span className={styles.body}>{notification.body}</span>
                  <span className={styles.time}>{formatTimestamp(notification.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </>
  );
}
