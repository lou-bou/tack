import { useSyncExternalStore } from 'react';

const CHECK_EVERY_MS = 3_600_000;

let ready = false;
let registration: ServiceWorkerRegistration | null = null;
const listeners = new Set<() => void>();

function setReady(value: boolean): void {
  if (ready === value) return;
  ready = value;
  listeners.forEach((listener) => listener());
}

/** A new version counts once it has installed alongside the one running now. */
function noticeWaiting(reg: ServiceWorkerRegistration): void {
  if (reg.waiting && reg.active) setReady(true);
}

function watch(reg: ServiceWorkerRegistration): void {
  noticeWaiting(reg);
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    worker?.addEventListener('statechange', () => noticeWaiting(reg));
  });
}

/**
 * Starts the service worker. A new version waits until it's safe to swap in, because taking over
 * by itself would delete files this page may still need, and reload it mid-edit.
 */
export function startUpdates(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  void navigator.serviceWorker.register('/sw.js').then((reg) => {
    registration = reg;
    watch(reg);
  });

  // A phone can leave the app open for days, so a launch alone won't find new versions.
  let checkedAt = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      // Leaving is the moment nothing's in progress, and coming back finds the new version.
      if (ready) applyUpdate();
      return;
    }
    if (Date.now() - checkedAt < CHECK_EVERY_MS) return;
    checkedAt = Date.now();
    void registration?.update().catch(() => {
      // Offline. The next visit tries again.
    });
  });
}

/** Swaps to the new version now. Without one waiting, a plain reload picks up whatever's current. */
export function applyUpdate(): void {
  const waiting = registration?.waiting;
  if (!waiting) {
    location.reload();
    return;
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), {
    once: true,
  });
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

export function useUpdateReady(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => ready,
  );
}
