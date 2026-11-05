import { useEffect, useState } from 'react';
import { SyncCheck } from './SyncCheck';
import styles from './DeviceTest.module.css';

// Temporary page for the step 1 device test: install, offline, realtime and push, on real devices
// behind Cloudflare Access. The real screens replace it in step 4.

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function useStreamStatus(): { connected: boolean; lastEvent: string } {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState('none yet');
  useEffect(() => {
    const source = new EventSource('/api/events');
    const seen = (name: string) => setLastEvent(`${name} at ${new Date().toLocaleTimeString()}`);
    source.addEventListener('ready', () => {
      setConnected(true);
      seen('ready');
    });
    source.addEventListener('change', () => seen('change'));
    source.onerror = () => setConnected(false);
    return () => source.close();
  }, []);
  return { connected, lastEvent };
}

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className={styles.row}>
      <dt>{label}</dt>
      <dd>
        {ok === undefined ? '' : ok ? 'OK: ' : 'Not OK: '}
        {value}
      </dd>
    </div>
  );
}

export function DeviceTest() {
  const stream = useStreamStatus();
  const [worker, setWorker] = useState(() =>
    'serviceWorker' in navigator ? 'checking' : 'not supported',
  );
  const [standalone] = useState(() => matchMedia('(display-mode: standalone)').matches);
  const [online, setOnline] = useState<string>('checking');
  const [pushResult, setPushResult] = useState('');

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then((reg) => {
      const active = reg.active;
      if (!active) return;
      setWorker(active.state);
      active.addEventListener('statechange', () => setWorker(active.state));
    });
  }, []);

  useEffect(() => {
    fetch('/api/health', { redirect: 'manual', cache: 'no-store' })
      .then((res) => {
        setOnline(
          res.type === 'opaqueredirect' ? 'session expired' : res.ok ? 'reachable' : 'error',
        );
      })
      .catch(() => setOnline('unreachable'));
  }, []);

  async function enablePush() {
    try {
      setPushResult('Asking permission…');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushResult(`Permission: ${permission}`);
        return;
      }
      const { publicKey } = (await (await fetch('/api/push/key')).json()) as {
        publicKey: string | null;
      };
      if (!publicKey) {
        setPushResult('The server has no VAPID keys.');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToBytes(publicKey),
      });
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription),
      });
      setPushResult(res.ok ? 'Enabled on this device.' : `Subscribe failed: ${res.status}`);
    } catch (err) {
      setPushResult(`Failed: ${String(err)}`);
    }
  }

  async function sendTest() {
    try {
      const res = await fetch('/api/push/test', { method: 'POST' });
      const body = (await res.json()) as { sent?: number; error?: string };
      setPushResult(res.ok ? `Sent to ${body.sent} device(s).` : `Failed: ${body.error}`);
    } catch (err) {
      setPushResult(`Failed: ${String(err)}`);
    }
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>
        <img className={styles.logoLight} src="/brand/tack-logo.svg" alt="" />
        <img className={styles.logoDark} src="/brand/tack-logo-dark.svg" alt="" />
        Tack device test
      </h1>
      <dl className={styles.list}>
        <Row label="Service worker" value={worker} ok={worker === 'activated'} />
        <Row label="Installed as app" value={standalone ? 'yes' : 'no, in a browser tab'} />
        <Row label="Server" value={online} ok={online === 'reachable'} />
        <Row
          label="Realtime stream"
          value={stream.connected ? 'connected' : 'not connected'}
          ok={stream.connected}
        />
        <Row label="Last stream event" value={stream.lastEvent} />
        <Row
          label="Notifications"
          value={'Notification' in window ? Notification.permission : 'not supported'}
        />
      </dl>
      <div className={styles.actions}>
        <button className={styles.primary} onClick={enablePush}>
          Enable notifications on this phone
        </button>
        <button className={styles.secondary} onClick={sendTest}>
          Send test notification
        </button>
      </div>
      <p role="status">{pushResult}</p>
      <SyncCheck />
    </main>
  );
}
