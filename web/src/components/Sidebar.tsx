import { useMemo, useState, type ReactNode } from 'react';
import { DndContext, closestCenter, type Modifier } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CalendarDays, PanelLeftClose, PanelLeftOpen, Settings, Sun } from 'lucide-react';
import { Link, NavLink } from 'react-router';
import { updateBoard } from '../data/actions';
import { boardGlyph, useBoards, type BoardSummary } from '../lib/boards';
import { useDragSensors } from '../lib/dnd';
import { useReorder } from '../lib/reorder';
import { ConnectionPill } from './ConnectionPill';
import { LogoMark } from './Logo';
import { TodayBadge } from './TodayBadge';
import styles from './Sidebar.module.css';

const COLLAPSED_KEY = 'tack.sidebar.collapsed';

type Row = BoardSummary & { id: string; position: string };

const VERTICAL: Modifier[] = [({ transform }) => ({ ...transform, x: 0 })];

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
      draggable={false}
      className={({ isActive }) => `${styles.item} ${isActive ? styles.active : ''}`}
    >
      {children}
      <span className={collapsed ? 'sr-only' : styles.label}>{label}</span>
    </NavLink>
  );
}

function SidebarBoard({ summary, collapsed }: { summary: Row; collapsed: boolean }) {
  const { board, overdue } = summary;
  const { setNodeRef, listeners, transform, transition } = useSortable({ id: board.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...listeners}
    >
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
  );
}

export function Sidebar() {
  // Per device, unlike theme and density: how much room there is depends on the screen.
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const boards = useBoards();
  const rows = useMemo(
    () =>
      boards?.map((summary) => ({
        ...summary,
        id: summary.board.id,
        position: summary.board.position,
      })),
    [boards],
  );
  const { ordered, onDragEnd } = useReorder(
    rows,
    (id, position) => void updateBoard(id, { position }),
  );
  const sensors = useDragSensors();

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
          <TodayBadge className={styles.todayBadge} />
        </NavItem>
        <NavItem to="/calendar" label="Calendar" collapsed={collapsed}>
          <CalendarDays />
        </NavItem>
        <hr className={styles.divider} />
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={VERTICAL}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={ordered?.map((b) => b.id) ?? []}
            strategy={verticalListSortingStrategy}
          >
            <ul className={styles.boards} aria-label="Boards">
              {ordered?.map((summary) => (
                <SidebarBoard key={summary.id} summary={summary} collapsed={collapsed} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
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
