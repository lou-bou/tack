import { useCallback } from 'react';
import { ListChecks } from 'lucide-react';
import { Link } from 'react-router';
import { daysBetween, isPlanned, todayReason, todayString, type Card } from '@tack/shared';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { SelectionBar } from '../components/SelectionBar';
import { CardFace, CardSlot } from '../components/board/CardFace';
import { boardTitle } from '../lib/boards';
import { usePlanning } from '../lib/planning';
import { SelectionProvider, useSelection } from '../lib/selection';
import { useFirstSyncDone } from '../lib/synced';
import { useToday } from '../lib/today';
import styles from './Today.module.css';

/** "Planned yesterday" and so on, for a plan carried over from an earlier day. */
function plannedNote(card: Card, now: number): string | null {
  if (todayReason(card, now) !== 'planned' || !card.plannedFor) return null;
  const days = daysBetween(card.plannedFor, todayString(now));
  if (days <= 0) return null;
  return days === 1 ? 'Planned yesterday' : `Planned ${days} days ago`;
}

export function TodayPage() {
  const { groups, now, toggle } = useToday();
  const synced = useFirstSyncDone();
  // Only cards put here by hand can be taken off. Due dates keep the rest here.
  const canSelect = useCallback((card: Card) => isPlanned(card, now), [now]);
  const selection = useSelection(canSelect);
  const plan = usePlanning();
  const anyPlanned = groups?.some(({ rows }) => rows.some(({ card }) => isPlanned(card, now)));

  return (
    <Screen
      title="Today"
      actions={
        anyPlanned || selection.selecting ? (
          <button
            type="button"
            className={styles.select}
            aria-pressed={selection.selecting}
            title="Select cards"
            onClick={selection.selecting ? selection.stop : selection.start}
          >
            <ListChecks />
            <span className={styles.selectLabel}>Select</span>
          </button>
        ) : undefined
      }
    >
      <SelectionProvider value={selection.api}>
        <div className={styles.column}>
          {groups?.length === 0 && synced && <EmptyState message="Nothing due today." />}
          {groups?.map(({ board, rows }) => (
            <section key={board.id} className={styles.group} aria-label={board.name}>
              <h2 className={styles.heading}>
                <Link to={`/board/${board.id}`}>{boardTitle(board)}</Link>
              </h2>
              <ul>
                {rows.map(({ card, listName, leaving }) => {
                  const note = plannedNote(card, now);
                  return (
                    <li key={card.id} data-card-id={card.id}>
                      <CardSlot leaving={leaving}>
                        <CardFace
                          card={card}
                          now={now}
                          showCompleted
                          onToggle={toggle}
                          listName={note ? `${listName} · ${note}` : listName}
                        />
                      </CardSlot>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </SelectionProvider>
      {selection.selecting && (
        <SelectionBar count={selection.selected.size} onCancel={selection.stop}>
          <Button
            variant="primary"
            disabled={selection.selected.size === 0}
            onClick={() => {
              void plan([...selection.selected], false);
              selection.stop();
            }}
          >
            Remove from today
          </Button>
        </SelectionBar>
      )}
    </Screen>
  );
}
