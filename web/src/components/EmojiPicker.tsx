import { useEffect, useRef } from 'react';
import dataSource from 'emoji-picker-element-data/en/emojibase/data.json?url';
import styles from './EmojiPicker.module.css';

/** Loaded on demand. Its data file is self-hosted and precached, so it works offline. */
export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const pick = useRef(onPick);
  useEffect(() => {
    pick.current = onPick;
  });

  useEffect(() => {
    let cancelled = false;
    let picker: HTMLElement | null = null;
    void import('emoji-picker-element').then(({ Picker }) => {
      if (cancelled || !host.current) return;
      picker = new Picker({ dataSource });
      picker.className = `${styles.picker} ${document.documentElement.dataset.theme ?? 'light'}`;
      picker.addEventListener('emoji-click', (event) => {
        const { unicode } = (event as CustomEvent<{ unicode?: string }>).detail;
        if (unicode) pick.current(unicode);
      });
      host.current.append(picker);
    });
    return () => {
      cancelled = true;
      picker?.remove();
    };
  }, []);

  return <div ref={host} className={styles.host} />;
}
