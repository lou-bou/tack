import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CloudUpload } from 'lucide-react';
import { db, syncStatus } from '../data';

const EMPTY: ReadonlySet<string> = new Set();
const Context = createContext<ReadonlySet<string>>(EMPTY);
const CARD_PREFIX = 'cards:';

/**
 * Which cards have edits still queued. While online the queue empties in milliseconds, and marking
 * that would only make cards flicker on every edit, so this only counts when something's holding
 * the queue back.
 */
export function UnsentProvider({ children }: { children: ReactNode }) {
  const status = useLiveQuery(syncStatus, []);
  const keys = useLiveQuery(() => db.outbox.toCollection().primaryKeys(), []);
  const unsent = useMemo<ReadonlySet<string>>(() => {
    if (status === 'online' || status === 'connecting' || !keys?.length) return EMPTY;
    return new Set(
      keys
        .map(String)
        .filter((key) => key.startsWith(CARD_PREFIX))
        .map((key) => key.slice(CARD_PREFIX.length)),
    );
  }, [status, keys]);
  return <Context.Provider value={unsent}>{children}</Context.Provider>;
}

/** The subtle "saved on this device" marker (SPEC §4). */
export function UnsentMarker({ cardId, className }: { cardId: string; className?: string }) {
  const unsent = useContext(Context);
  if (!unsent.has(cardId)) return null;
  const label = 'Saved on this device';
  return (
    <span className={className} role="img" aria-label={label} title={label}>
      <CloudUpload />
    </span>
  );
}
