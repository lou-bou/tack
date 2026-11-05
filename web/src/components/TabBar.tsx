import { CalendarDays, LayoutGrid, Settings, Sun } from 'lucide-react';
import { NavLink, useMatch } from 'react-router';
import { TodayBadge } from './TodayBadge';
import styles from './TabBar.module.css';

export function TabBar() {
  // The Boards tab stays active inside a board, which lives at its own path.
  const inBoard = useMatch('/board/*') !== null;
  const cls = (active: boolean) => `${styles.tab} ${active ? styles.active : ''}`;
  return (
    <nav className={styles.bar} aria-label="Main">
      <NavLink to="/" end className={({ isActive }) => cls(isActive || inBoard)}>
        <LayoutGrid />
        Boards
      </NavLink>
      <NavLink to="/today" className={({ isActive }) => cls(isActive)}>
        <span className={styles.iconWrap}>
          <Sun />
          <TodayBadge className={styles.badge} />
        </span>
        Today
      </NavLink>
      <NavLink to="/calendar" className={({ isActive }) => cls(isActive)}>
        <CalendarDays />
        Calendar
      </NavLink>
      <NavLink to="/settings" className={({ isActive }) => cls(isActive)}>
        <Settings />
        Settings
      </NavLink>
    </nav>
  );
}
