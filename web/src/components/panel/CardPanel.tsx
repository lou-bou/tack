import { Suspense, lazy, useEffect, useRef, useState, type TouchEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowUp, Check, Clock, Flag, Trash2, X } from 'lucide-react';
import { useSearchParams } from 'react-router';
import {
  DEFAULT_DUE_TIME,
  DEFAULT_START_TIME,
  byPosition,
  dropPosition,
  dueState,
  formatDateValue,
  formatTimestamp,
  positionAtEnd,
  startAfterDue,
  type Card,
  type DateValue,
} from '@tack/shared';
import { db } from '../../data';
import { restoreCard, setCardCompleted, trashCard, updateCard } from '../../data/actions';
import { boardTitle, useNow } from '../../lib/boards';
import { useCardPanel } from '../../lib/cardPanel';
import { useFirstSyncDone } from '../../lib/synced';
import { Button, IconButton } from '../Button';
import { useToast } from '../Toast';
import { DatePicker } from './DatePicker';
import { PriorityControl } from './PriorityControl';
import styles from './CardPanel.module.css';

const loadDescription = () => import('./Description');
const Description = lazy(loadDescription);
const PRELOAD_FALLBACK_MS = 2000;

/** Loads the editor's 500KB in the background, so it's never part of the wait after a tap. */
function usePreloadEditor(): void {
  useEffect(() => {
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(() => void loadDescription());
      return () => cancelIdleCallback(id);
    }
    const timer = setTimeout(() => void loadDescription(), PRELOAD_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, []);
}

/** True from just after the first paint, so slow work follows the panel instead of holding it up. */
function useAfterFirstPaint(): boolean {
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(() => setPainted(true));
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, []);
  return painted;
}

const SWIPE_CLOSE_PX = 100;

/** Saves as you type, keeps its own text while focused, and restores the old title if left empty. */
function TitleField({ card }: { card: Card }) {
  const [draft, setDraft] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const value = draft ?? card.title;

  useEffect(() => {
    const element = field.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={field}
      className={styles.title}
      aria-label="Card title"
      rows={1}
      enterKeyHint="done"
      value={value}
      onFocus={() => setDraft(card.title)}
      onChange={(event) => {
        const text = event.target.value.replace(/\s*\n\s*/g, ' ');
        setDraft(text);
        const trimmed = text.trim();
        if (trimmed) void updateCard(card.id, { title: trimmed });
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function DateButton({
  label,
  value,
  card,
  isDue,
  now,
  onOpen,
}: {
  label: string;
  value: DateValue | null;
  card: Card;
  isDue: boolean;
  now: number;
  onOpen: () => void;
}) {
  const state = isDue ? dueState(card, now) : 'none';
  const stateClass = styles[state] ?? '';
  return (
    <button type="button" className={`${styles.dateChip} ${stateClass}`} onClick={onOpen}>
      <span className={styles.dateLabel}>{label}</span>
      <span className={styles.dateValue}>
        {state === 'overdue' && <Flag />}
        {state === 'dueSoon' && <Clock />}
        {state === 'completed' && <Check />}
        {value ? formatDateValue(value) : 'Not set'}
      </span>
    </button>
  );
}

function Details({ card }: { card: Card }) {
  const data = useLiveQuery(async () => {
    const [board, lists, siblings] = await Promise.all([
      db.boards.get(card.boardId),
      db.lists.where('boardId').equals(card.boardId).toArray(),
      db.cards.where('listId').equals(card.listId).toArray(),
    ]);
    return {
      board,
      lists: lists.filter((l) => !l.deletedAt).sort(byPosition),
      siblings: siblings.filter((c) => !c.deletedAt).sort(byPosition),
    };
  }, [card.boardId, card.listId]);
  const now = useNow();
  const toast = useToast();
  const { close } = useCardPanel();
  const [picking, setPicking] = useState<'start' | 'due' | null>(null);
  const painted = useAfterFirstPaint();

  if (!data) return null;
  const { board, lists, siblings } = data;
  const showCompleted = board?.showCompleted ?? false;

  const visible = siblings.filter((c) => c.id === card.id || showCompleted || !c.completed);
  const at = visible.findIndex((c) => c.id === card.id);
  const others = siblings.filter((c) => c.id !== card.id);

  // Steps past visible neighbours, so a hidden card never makes a press look like it did nothing.
  const move = (direction: -1 | 1) => {
    const ids = visible.map((c) => c.id);
    ids.splice(at, 1);
    ids.splice(at + direction, 0, card.id);
    void updateCard(card.id, { position: dropPosition(others, ids, card.id) });
  };

  const moveToList = async (listId: string) => {
    const target = (await db.cards.where('listId').equals(listId).toArray()).sort(byPosition);
    await updateCard(card.id, { listId, position: positionAtEnd(target) });
  };

  return (
    <>
      <div className={styles.head}>
        <button
          type="button"
          role="checkbox"
          aria-checked={card.completed}
          aria-label={`Complete ${card.title}`}
          className={styles.check}
          onClick={() => void setCardCompleted(card.id, !card.completed)}
        >
          <span className={`${styles.box} ${card.completed ? styles.boxDone : ''}`}>
            {card.completed && <Check />}
          </span>
        </button>
        <TitleField card={card} />
      </div>

      <div className={styles.crumb}>
        <span className={styles.boardName}>{board ? boardTitle(board) : ''}</span>
        <span aria-hidden="true">/</span>
        <select
          className={styles.select}
          aria-label="List"
          value={card.listId}
          onChange={(event) => void moveToList(event.target.value)}
        >
          {lists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.name}
            </option>
          ))}
        </select>
      </div>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Priority</h3>
        <PriorityControl
          value={card.priority}
          onChange={(priority) => void updateCard(card.id, { priority })}
        />
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Dates</h3>
        <div className={styles.dates}>
          <DateButton
            label="Start"
            value={card.start}
            card={card}
            isDue={false}
            now={now}
            onOpen={() => setPicking('start')}
          />
          <DateButton
            label="Due"
            value={card.due}
            card={card}
            isDue
            now={now}
            onOpen={() => setPicking('due')}
          />
        </div>
        {picking === 'start' && (
          <DatePicker
            label="Start date"
            value={card.start}
            defaultTime={DEFAULT_START_TIME}
            now={now}
            isValid={(candidate) => !startAfterDue(candidate, card.due)}
            onChange={(start) => void updateCard(card.id, { start })}
            onClose={() => setPicking(null)}
          />
        )}
        {picking === 'due' && (
          <DatePicker
            label="Due date"
            value={card.due}
            defaultTime={DEFAULT_DUE_TIME}
            now={now}
            isValid={(candidate) => !startAfterDue(card.start, candidate)}
            onChange={(due) => void updateCard(card.id, { due })}
            onClose={() => setPicking(null)}
          />
        )}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Description</h3>
        <Suspense fallback={<div className={styles.editorLoading} />}>
          {painted ? (
            <Description key={card.id} cardId={card.id} value={card.description} />
          ) : (
            <div className={styles.editorLoading} />
          )}
        </Suspense>
      </section>

      <footer className={styles.footer}>
        <div className={styles.times}>
          <span>Created {formatTimestamp(card.createdAt)}</span>
          <span>Updated {formatTimestamp(card.updatedAt)}</span>
        </div>
        <div className={styles.actions}>
          <Button disabled={at <= 0} onClick={() => move(-1)}>
            <ArrowUp />
            Move up
          </Button>
          <Button disabled={at < 0 || at >= visible.length - 1} onClick={() => move(1)}>
            <ArrowDown />
            Move down
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              void trashCard(card.id);
              close();
              toast.show('Card moved to Trash', {
                label: 'Undo',
                onAction: () => void restoreCard(card.id),
              });
            }}
          >
            <Trash2 />
            Delete
          </Button>
        </div>
      </footer>
    </>
  );
}

/** A right-side panel on desktop and a full-screen sheet on phones, over any screen (SPEC §3.5). */
export function CardPanel() {
  const [params] = useSearchParams();
  const cardId = params.get('card');
  const { close } = useCardPanel();
  const synced = useFirstSyncDone();
  usePreloadEditor();
  const panel = useRef<HTMLElement>(null);
  const swipe = useRef<{ startY: number; dy: number } | null>(null);
  const card = useLiveQuery(
    async () => (cardId ? ((await db.cards.get(cardId)) ?? null) : null),
    [cardId],
  );

  // Focus follows the panel, and returns to the card it came from.
  useEffect(() => {
    if (!cardId) return;
    panel.current?.focus({ preventScroll: true });
    return () => {
      document
        .querySelector<HTMLElement>(`[data-card-id="${CSS.escape(cardId)}"] button:not([role])`)
        ?.focus({ preventScroll: true });
    };
  }, [cardId]);

  useEffect(() => {
    if (!cardId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // A sheet or menu on top gets Escape first.
      if (document.querySelector('dialog[open], [role="menu"]')) return;
      close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [cardId, close]);

  if (!cardId) return null;

  const onTouchStart = (event: TouchEvent) => {
    swipe.current = { startY: event.touches[0]?.clientY ?? 0, dy: 0 };
  };
  const onTouchMove = (event: TouchEvent) => {
    if (!swipe.current || !panel.current) return;
    const dy = Math.max(0, (event.touches[0]?.clientY ?? 0) - swipe.current.startY);
    swipe.current.dy = dy;
    panel.current.style.transform = `translateY(${dy}px)`;
  };
  const onTouchEnd = () => {
    const done = (swipe.current?.dy ?? 0) > SWIPE_CLOSE_PX;
    swipe.current = null;
    if (panel.current) panel.current.style.transform = '';
    if (done) close();
  };

  const missing = (card === null && synced) || (card && card.deletedAt);

  return (
    <aside ref={panel} className={styles.panel} aria-label="Card" tabIndex={-1}>
      <div
        className={styles.bar}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <span className={styles.grabber} aria-hidden="true" />
        <IconButton label="Close card" onClick={close}>
          <X />
        </IconButton>
      </div>
      <div className={styles.body}>
        {missing && <p className={styles.missing}>This card doesn't exist or is in Trash.</p>}
        {card && !card.deletedAt && <Details key={card.id} card={card} />}
      </div>
    </aside>
  );
}
