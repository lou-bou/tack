import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data';

/**
 * False only on a device's very first load, until the server has answered or failed to. Until then
 * an empty database doesn't mean there's nothing, so screens shouldn't say so.
 */
export function useFirstSyncDone(): boolean {
  return (
    useLiveQuery(async () => {
      const [seq, status] = await Promise.all([db.meta.get('seq'), db.meta.get('status')]);
      return seq !== undefined || (status !== undefined && status.value !== 'connecting');
    }, []) ?? false
  );
}
