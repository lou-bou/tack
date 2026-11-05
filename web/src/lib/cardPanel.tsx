import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';

interface CardPanelApi {
  open: (cardId: string) => void;
  close: () => void;
}

const Context = createContext<CardPanelApi | null>(null);

/**
 * Opens and closes the panel through `?card=`, on whichever screen is showing. The value never
 * changes, so hundreds of cards can use it without re-rendering on every navigation.
 */
export function CardPanelProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const latest = useRef({ navigate, location });
  useEffect(() => {
    latest.current = { navigate, location };
  });

  const api = useMemo<CardPanelApi>(
    () => ({
      open: (cardId) => {
        const { navigate: go, location: at } = latest.current;
        const params = new URLSearchParams(at.search);
        const already = params.has('card');
        params.set('card', cardId);
        // Switching cards replaces, so the back button closes the panel in one press.
        void go(
          { pathname: at.pathname, search: `?${params}` },
          { replace: already, state: { openedInApp: true } },
        );
      },
      close: () => {
        const { navigate: go, location: at } = latest.current;
        if ((at.state as { openedInApp?: boolean } | null)?.openedInApp) {
          void go(-1);
          return;
        }
        // Arrived from a link or notification: there's nothing to go back to.
        const params = new URLSearchParams(at.search);
        params.delete('card');
        const search = params.toString();
        void go({ pathname: at.pathname, search: search ? `?${search}` : '' }, { replace: true });
      },
    }),
    [],
  );

  return <Context.Provider value={api}>{children}</Context.Provider>;
}

export function useCardPanel(): CardPanelApi {
  const value = useContext(Context);
  if (!value) throw new Error('useCardPanel must be used inside CardPanelProvider');
  return value;
}
