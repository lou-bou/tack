import { useSyncExternalStore } from 'react';

const QUERY = '(width >= 900px)';

function subscribe(onChange: () => void): () => void {
  const media = matchMedia(QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

/** For the few places where the two layouts differ by more than CSS can say. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, () => matchMedia(QUERY).matches);
}
