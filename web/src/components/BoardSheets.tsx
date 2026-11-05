import { useState, type FormEvent } from 'react';
import { MoreHorizontal, Palette, Pencil, Smile, Trash2 } from 'lucide-react';
import type { Board, BoardColor } from '@tack/shared';
import { createBoard, restoreBoard, trashBoard, updateBoard } from '../data/actions';
import { Button, IconButton } from './Button';
import { ColorPicker } from './ColorPicker';
import { EmojiPicker } from './EmojiPicker';
import { Menu } from './Menu';
import { Sheet } from './Sheet';
import { useToast } from './Toast';
import fieldStyles from './Field.module.css';
import styles from './BoardSheets.module.css';

export function NewBoardSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState<string | null>(null);
  const [color, setColor] = useState<BoardColor>('neutral');
  const [picking, setPicking] = useState(false);

  const reset = () => {
    setName('');
    setEmoji(null);
    setColor('neutral');
    setPicking(false);
  };
  const close = () => {
    reset();
    onClose();
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = await createBoard({ name: trimmed, emoji, color });
    reset();
    onCreated(id);
  };

  return (
    <Sheet open={open} onClose={close} title="New board">
      <form className={styles.form} onSubmit={(event) => void submit(event)}>
        <label className={fieldStyles.field}>
          <span className={fieldStyles.label}>Name</span>
          <input
            className={fieldStyles.input}
            value={name}
            autoFocus
            enterKeyHint="done"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <div className={fieldStyles.field}>
          <span className={fieldStyles.label}>Emoji</span>
          <div className={styles.emojiRow}>
            <IconButton label="Choose emoji" onClick={() => setPicking((value) => !value)}>
              {emoji ? <span className={styles.emoji}>{emoji}</span> : <Smile />}
            </IconButton>
            {emoji && <Button onClick={() => setEmoji(null)}>Remove</Button>}
          </div>
          {picking && (
            <EmojiPicker
              onPick={(value) => {
                setEmoji(value);
                setPicking(false);
              }}
            />
          )}
        </div>
        <div className={fieldStyles.field}>
          <span className={fieldStyles.label}>Colour</span>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <Button type="submit" variant="primary" disabled={!name.trim()}>
          Create board
        </Button>
      </form>
    </Sheet>
  );
}

function RenameBoard({ board, onClose }: { board: Board; onClose: () => void }) {
  const [name, setName] = useState(board.name);
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = name.trim();
        if (trimmed && trimmed !== board.name) void updateBoard(board.id, { name: trimmed });
        onClose();
      }}
    >
      <label className={fieldStyles.field}>
        <span className={fieldStyles.label}>Name</span>
        <input
          className={fieldStyles.input}
          value={name}
          autoFocus
          enterKeyHint="done"
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <Button type="submit" variant="primary" disabled={!name.trim()}>
        Save
      </Button>
    </form>
  );
}

type Editing = 'rename' | 'emoji' | 'color' | null;

const TITLES: Record<Exclude<Editing, null>, string> = {
  rename: 'Rename board',
  emoji: 'Change emoji',
  color: 'Change colour',
};

/** The board menu, on the tile and inside the board (SPEC §3.2). */
export function BoardMenu({ board, onDeleted }: { board: Board; onDeleted?: () => void }) {
  const [editing, setEditing] = useState<Editing>(null);
  const toast = useToast();
  const close = () => setEditing(null);

  return (
    <>
      <Menu
        label={`Menu for ${board.name}`}
        icon={<MoreHorizontal />}
        items={[
          { label: 'Rename', icon: <Pencil />, onSelect: () => setEditing('rename') },
          { label: 'Change emoji', icon: <Smile />, onSelect: () => setEditing('emoji') },
          { label: 'Change colour', icon: <Palette />, onSelect: () => setEditing('color') },
          {
            label: 'Delete',
            icon: <Trash2 />,
            danger: true,
            onSelect: () => {
              void trashBoard(board.id);
              onDeleted?.();
              toast.show('Board moved to Trash', {
                label: 'Undo',
                onAction: () => void restoreBoard(board.id),
              });
            },
          },
        ]}
      />
      <Sheet open={editing !== null} onClose={close} title={editing ? TITLES[editing] : ''}>
        {editing === 'rename' && <RenameBoard board={board} onClose={close} />}
        {editing === 'emoji' && (
          <div className={styles.form}>
            <EmojiPicker
              onPick={(emoji) => {
                void updateBoard(board.id, { emoji });
                close();
              }}
            />
            {board.emoji && (
              <Button
                onClick={() => {
                  void updateBoard(board.id, { emoji: null });
                  close();
                }}
              >
                Remove emoji
              </Button>
            )}
          </div>
        )}
        {editing === 'color' && (
          <ColorPicker
            value={board.color}
            onChange={(color) => void updateBoard(board.id, { color })}
          />
        )}
      </Sheet>
    </>
  );
}
