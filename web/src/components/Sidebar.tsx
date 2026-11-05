import { useState, type ReactNode } from 'react';
import { CalendarDays, PanelLeftClose, PanelLeftOpen, Settings, Sun } from 'lucide-react';
import { Link, NavLink } from 'react-router';
import { boardGlyph, useBoards } from '../lib/boards';
import { ConnectionPill } from './ConnectionPill';
import { LogoMark } from './Logo';
import styles from './Sidebar.module.css';

const COLLAPSED_KEY = 'tack.sidebar.collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function NavItem({
  to,
  label,
  collapsed,
  children,
}: {
  to: string;
  label: string;
  collapsed: boolean;
  children: ReactNode;
}) {
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      className={({ isActive }) => `${styles.item} ${isActive ? styles.active : ''}`}
    >
      {children}
      <span className={collapsed ? 'sr-only' : styles.label}>{label}</span>
    </NavLink>
  );
}

export function Sidebar() {
  // Per device, unlike theme and density: how much room there is depends on the screen.
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const boards = useBoards();

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, String(next));
    } catch {
      // It just won't be remembered next launch.
    }
  };

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
      <Link to="/" className={styles.brand} aria-label="Tack, all boards">
        <LogoMark />
        {!collapsed && <span className={styles.wordmark}>Tack</span>}
      </Link>

      <nav className={styles.nav} aria-label="Main">
        <NavItem to="/today" label="Today" collapsed={collapsed}>
          <Sun />
        </NavItem>
        <NavItem to="/calendar" label="Calendar" collapsed={collapsed}>
          <CalendarDays />
        </NavItem>
        <hr className={styles.divider} />
        <ul className={styles.boards} aria-label="Boards">
          {boards?.map(({ board, overdue }) => (
            <li key={board.id}>
              <NavItem to={`/board/${board.id}`} label={board.name} collapsed={collapsed}>
                <span className={styles.glyph} aria-hidden="true">
                  {boardGlyph(board)}
                </span>
                {overdue > 0 && (
                  <span className={styles.dot}>
                    <span className="sr-only">Has overdue cards</span>
                  </span>
                )}
              </NavItem>
            </li>
          ))}
        </ul>
      </nav>

      <div className={styles.footer}>
        <ConnectionPill iconOnly={collapsed} />
        <NavItem to="/settings" label="Settings" collapsed={collapsed}>
          <Settings />
        </NavItem>
        <button
          type="button"
          className={styles.item}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : undefined}
          onClick={toggle}
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          {!collapsed && <span className={styles.label}>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
