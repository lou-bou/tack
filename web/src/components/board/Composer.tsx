import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { createCard } from '../../data/actions';
import { Button, IconButton } from '../Button';
import styles from './Composer.module.css';

/** Enter adds and stays open for the next one; Escape or tapping outside closes (SPEC §3.3). */
export function Composer({
  boardId,
  listId,
  onAdded,
  onClose,
}: {
  boardId: string;
  listId: string;
  onAdded: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const root = useRef<HTMLFormElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [onClose]);

  const add = () => {
    const trimmed = title.replace(/\s+/g, ' ').trim();
    if (trimmed) {
      void createCard(boardId, listId, trimmed).then(onAdded);
      setTitle('');
    }
    field.current?.focus();
  };

  return (
    <form
      ref={root}
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault();
        add();
      }}
    >
      <textarea
        ref={field}
        className={styles.field}
        aria-label="Card title"
        placeholder="Card title"
        rows={2}
        autoFocus
        enterKeyHint="done"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            add();
          }
          if (event.key === 'Escape') onClose();
        }}
      />
      <div className={styles.actions}>
        <Button type="submit" variant="primary">
          Add
        </Button>
        <IconButton label="Close" onClick={onClose}>
          <X />
        </IconButton>
      </div>
    </form>
  );
}
