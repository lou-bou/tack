import { PROTOCOL_VERSION, type Change, type PullResponse, type PushResponse } from '@tack/shared';

/** Cloudflare Access wants a new login. Not an outage: the queue waits for the user to sign in. */
export class SessionExpiredError extends Error {}
/** The server speaks a newer protocol, so this client has to update first. */
export class OutdatedClientError extends Error {}

export interface Transport {
  push(changes: Change[]): Promise<PushResponse>;
  pull(since: number): Promise<PullResponse>;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  // With redirects followed, Access's redirect to its login page would fail like a network error.
  const res = await fetch(url, { ...init, redirect: 'manual', cache: 'no-store' });
  if (res.type === 'opaqueredirect' || res.status === 401 || res.status === 403) {
    throw new SessionExpiredError();
  }
  if (res.status === 426) throw new OutdatedClientError();
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return (await res.json()) as T;
}

export const httpTransport: Transport = {
  push: (changes) =>
    request('/api/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocol: PROTOCOL_VERSION, changes }),
    }),
  pull: (since) => request(`/api/sync/pull?since=${since}&protocol=${PROTOCOL_VERSION}`),
};
