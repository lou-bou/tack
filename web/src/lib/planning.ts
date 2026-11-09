import { todayString } from '@tack/shared';
import { useToast } from '../components/Toast';
import { restorePlanned, setPlanned } from '../data/actions';

const cards = (n: number) => (n === 1 ? '1 card' : `${n} cards`);

/** Plans cards for today or takes them off, then offers Undo. */
export function usePlanning() {
  const toast = useToast();
  return async (ids: readonly string[], plan: boolean) => {
    if (ids.length === 0) return;
    const before = await setPlanned(ids, plan ? todayString(Date.now()) : null);
    toast.show(
      plan ? `${cards(ids.length)} planned for today` : `${cards(ids.length)} taken off Today`,
      {
        label: 'Undo',
        onAction: () => void restorePlanned(before),
      },
    );
  };
}
