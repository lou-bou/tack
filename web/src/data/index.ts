import { HlcClock } from '@tack/shared';
import { TackDb, type SyncStatus } from './db';
import { SyncEngine } from './engine';
import { Store } from './store';
import { httpTransport } from './transport';

const RETRY_MS = 15_000;
const CHANNEL = 'tack-sync';
const LOCK = 'tack-sync-leader';

export const db = new TackDb();
const clock = new HlcClock(crypto.randomUUID().slice(0, 8));
const channel = new BroadcastChannel(CHANNEL);

let poke: () => void = () => {};

export const store = new Store(db, clock, () => {
  poke();
  channel.postMessage('write');
});

export async function syncStatus(): Promise<SyncStatus> {
  const entry = await db.meta.get('status');
  return (entry?.value as SyncStatus | undefined) ?? 'connecting';
}

/** Runs sync for as long as this tab is the leader. Only one tab per device talks to the server. */
function lead(): void {
  const engine = new SyncEngine(db, clock, httpTransport);
  const sync = () => void engine.sync();
  poke = sync;
  channel.onmessage = sync;

  const connect = () => {
    const source = new EventSource('/api/events');
    source.addEventListener('ready', sync);
    source.addEventListener('change', sync);
    // After an Access expiry EventSource gives up for good, so it has to be reopened by hand.
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) setTimeout(connect, RETRY_MS);
      void engine.sync();
    };
  };
  connect();

  window.addEventListener('online', sync);
  window.addEventListener('focus', sync);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sync();
  });
  setInterval(() => {
    void syncStatus().then((status) => {
      if (status !== 'online') sync();
    });
  }, RETRY_MS);
  sync();
}

export function startSync(): void {
  void navigator.locks.request(LOCK, () => {
    lead();
    return new Promise(() => {}); // Hold the lock until the tab closes.
  });
}
