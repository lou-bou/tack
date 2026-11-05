import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export interface Vapid {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export interface Config {
  host: string;
  port: number;
  dbPath: string;
  webDist: string;
  /** Missing keys leave push disabled; the rest of the app still runs. */
  vapid: Vapid | null;
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a whole number, got "${raw}"`);
  return Number(raw);
}

export function loadConfig(): Config {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  return {
    host: process.env.HOST ?? '0.0.0.0',
    port: intFromEnv('PORT', 8097),
    dbPath: process.env.DB_PATH ?? path.resolve('data/tack.db'),
    // src/ in dev, dist/ in prod: both sit one level below server/.
    webDist: process.env.WEB_DIST ?? path.resolve(here, '../../web/dist'),
    vapid:
      publicKey && privateKey
        ? { publicKey, privateKey, subject: process.env.VAPID_SUBJECT ?? 'mailto:admin@localhost' }
        : null,
  };
}
