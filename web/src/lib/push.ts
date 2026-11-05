/** Whether this device's main pointer is a finger, which is where the Enable row belongs (PLAN §5). */
export const isTouchPrimary = () => matchMedia('(pointer: coarse)').matches;

export const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isInstalled = () =>
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export type PushState = 'unsupported' | 'blocked' | 'off' | 'on';

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return subscription && Notification.permission === 'granted' ? 'on' : 'off';
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Returns a message to show when it didn't work, or null when it did. */
export async function enablePush(): Promise<string | null> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return "Notifications are blocked in this device's settings.";
    const response = await fetch('/api/push/key');
    const { publicKey } = (await response.json()) as { publicKey: string | null };
    if (!publicKey) return "The server doesn't have its push keys set.";
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64ToBytes(publicKey),
    });
    const saved = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription),
    });
    return saved.ok ? null : "Couldn't save this phone on the server.";
  } catch {
    return "Couldn't turn notifications on. Check the connection and try again.";
  }
}

/** The message to show afterwards. */
export async function sendTestPush(): Promise<string> {
  try {
    const response = await fetch('/api/push/test', { method: 'POST' });
    if (response.status === 503) return "The server doesn't have its push keys set.";
    if (!response.ok) return "Couldn't send the test notification.";
    const { sent } = (await response.json()) as { sent: number };
    if (sent === 0) return 'No device has notifications on yet.';
    return sent === 1 ? 'Sent to 1 device.' : `Sent to ${sent} devices.`;
  } catch {
    return "Couldn't reach the server.";
  }
}
