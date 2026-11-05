import { useEffect, useRef } from 'react';
import type { EditorView } from '@codemirror/view';
import { updateCard } from '../../data/actions';
import { createDescriptionEditor } from './DescriptionEditor';
import styles from './DescriptionEditor.module.css';

const SAVE_DELAY_MS = 500;

/** Typing is saved after a pause, and always on blur or close (PLAN §2). */
export default function Description({ cardId, value }: { cardId: string; value: string }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsaved = useRef<string | null>(null);

  useEffect(() => {
    const flush = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      if (unsaved.current !== null) void updateCard(cardId, { description: unsaved.current });
      unsaved.current = null;
    };
    const editor = createDescriptionEditor({
      parent: host.current as HTMLElement,
      value,
      onChange: (text) => {
        unsaved.current = text;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(flush, SAVE_DELAY_MS);
      },
      onBlur: flush,
    });
    view.current = editor;
    // Leaving the app can skip the unmount on a phone, so save as it goes to the background.
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      flush();
      editor.destroy();
      view.current = null;
    };
    // The editor is keyed by card and `value` only seeds it; later changes arrive below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  // A change from another device shows up, unless you're mid-edit here.
  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.hasFocus || unsaved.current !== null) return;
    const current = editor.state.doc.toString();
    if (current !== value) {
      editor.dispatch({ changes: { from: 0, to: current.length, insert: value } });
      unsaved.current = null;
      if (timer.current) clearTimeout(timer.current);
    }
  }, [value]);

  return <div ref={host} className={styles.host} />;
}
