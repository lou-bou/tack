import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { X } from 'lucide-react';
import styles from './Toast.module.css';

const DURATION_MS = 5000;
const MAX_TOASTS = 3;

interface ToastAction {
  label: string;
  onAction: () => void;
}

interface ToastItem {
  id: number;
  message: string;
  action?: ToastAction;
}

interface ToastApi {
  show: (message: string, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const show = useCallback<ToastApi['show']>(
    (message, action) => {
      const id = nextId.current++;
      setItems((current) => [...current.slice(1 - MAX_TOASTS), { id, message, action }]);
      setTimeout(() => dismiss(id), DURATION_MS);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.region} role="status" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={styles.toast}>
            <span className={styles.message}>{item.message}</span>
            {item.action && (
              <button
                type="button"
                className={styles.action}
                onClick={() => {
                  dismiss(item.id);
                  item.action?.onAction();
                }}
              >
                {item.action.label}
              </button>
            )}
            <button
              type="button"
              className={styles.close}
              aria-label="Dismiss"
              onClick={() => dismiss(item.id)}
            >
              <X />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
