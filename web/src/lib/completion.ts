import { useCallback, useState } from 'react';
import { setCardCompleted } from '../data/actions';
import { useToast } from '../components/Toast';

const LINGER_MS = 450;

/**
 * Ticks and unticks cards. When ticking would hide a card it lingers for its done animation, with
 * the row already saved, and an Undo toast appears (SPEC §3.3).
 */
export function useCompletion() {
  const toast = useToast();
  const [lingering, setLingering] = useState<ReadonlySet<string>>(new Set());

  const toggle = useCallback(
    (card: { id: string; completed: boolean }, willHide: boolean) => {
      const completing = !card.completed;
      void setCardCompleted(card.id, completing);
      if (!completing || !willHide) return;
      const instant = matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!instant) {
        setLingering((current) => new Set(current).add(card.id));
        setTimeout(() => {
          setLingering((current) => {
            const next = new Set(current);
            next.delete(card.id);
            return next;
          });
        }, LINGER_MS);
      }
      toast.show('Card completed', {
        label: 'Undo',
        onAction: () => void setCardCompleted(card.id, false),
      });
    },
    [toast],
  );

  return { lingering, toggle };
}
