import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { IconButton } from './Button';
import styles from './Menu.module.css';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

const EDGE = 8;
const GAP = 4;

/**
 * An icon button that opens a list of actions. The list is a popover so it sits in the top layer,
 * free of the overflow clipping in lists and sheets.
 */
export function Menu({
  label,
  icon,
  items,
}: {
  label: string;
  icon: ReactNode;
  items: readonly MenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  useLayoutEffect(() => {
    const menu = list.current;
    const anchor = trigger.current;
    if (!open || !menu || !anchor) return;
    menu.showPopover?.();
    // Under the trigger and aligned to its right edge, flipped or nudged to stay on screen.
    const a = anchor.getBoundingClientRect();
    const m = menu.getBoundingClientRect();
    const below = a.bottom + GAP + m.height <= innerHeight - EDGE;
    const top = below ? a.bottom + GAP : Math.max(EDGE, a.top - GAP - m.height);
    const left = Math.min(Math.max(EDGE, a.right - m.width), innerWidth - EDGE - m.width);
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    menu.querySelector('button')?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (list.current?.contains(target) || trigger.current?.contains(target)) return;
      setOpen(false);
    };
    const dismiss = () => setOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', dismiss);
    };
  }, [open]);

  const onKeyDown = (event: KeyboardEvent) => {
    const buttons = Array.from(list.current?.querySelectorAll('button') ?? []);
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const focus = (index: number) => {
      event.preventDefault();
      buttons[(index + buttons.length) % buttons.length]?.focus();
    };
    if (event.key === 'ArrowDown') focus(at + 1);
    else if (event.key === 'ArrowUp') focus(at - 1);
    else if (event.key === 'Home') focus(0);
    else if (event.key === 'End') focus(buttons.length - 1);
    else if (event.key === 'Tab') close(false);
    else if (event.key === 'Escape') {
      // Inside a sheet, Escape should close only the menu.
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
  };

  return (
    <>
      <IconButton
        ref={trigger}
        label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        {icon}
      </IconButton>
      {open && (
        <div
          ref={list}
          className={styles.menu}
          role="menu"
          aria-label={label}
          popover="manual"
          onKeyDown={onKeyDown}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={`${styles.item} ${item.danger ? styles.danger : ''}`}
              onClick={() => {
                close(true);
                item.onSelect();
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
