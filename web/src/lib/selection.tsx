import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Card } from '@tack/shared';

export interface SelectionApi {
  selecting: boolean;
  selected: ReadonlySet<string>;
  toggle: (id: string) => void;
  /** On Today only planned cards can be taken off, so only they can be picked there. */
  canSelect: (card: Card) => boolean;
}

const Context = createContext<SelectionApi | null>(null);

/** What a card face needs to know: null outside a screen that offers selecting. */
export function useSelectionContext(): SelectionApi | null {
  return useContext(Context);
}

const everything = () => true;

/** Select mode for a screen: pick several cards, then act on them all at once. */
export function useSelection(canSelect: (card: Card) => boolean = everything) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const start = useCallback(() => {
    setSelected(new Set());
    setSelecting(true);
  }, []);

  const stop = useCallback(() => {
    setSelecting(false);
    setSelected(new Set());
  }, []);

  useEffect(() => {
    if (!selecting) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) stop();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selecting, stop]);

  const api = useMemo<SelectionApi>(
    () => ({ selecting, selected, toggle, canSelect }),
    [selecting, selected, toggle, canSelect],
  );

  return { ...api, start, stop, api };
}

export function SelectionProvider({
  value,
  children,
}: {
  value: SelectionApi;
  children: ReactNode;
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
