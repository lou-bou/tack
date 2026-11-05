import { useEffect, useRef, useState } from 'react';
import styles from './Splash.module.css';

const KEY = 'tack.splash.shown';
const SETTLED_MS = 1050;
const FLY_MS = 400;
const STILL_MS = 400;

function alreadyShown(): boolean {
  try {
    if (sessionStorage.getItem(KEY)) return true;
    sessionStorage.setItem(KEY, '1');
    return false;
  } catch {
    return false;
  }
}

/** The logo on screen right now: the sidebar's on desktop, the top bar's on a phone. */
function findTarget(): HTMLElement | null {
  const marks = document.querySelectorAll<HTMLElement>('[data-logo-target]');
  return Array.from(marks).find((mark) => mark.offsetParent !== null) ?? null;
}

/**
 * Opening the app (once per launch): the card drops in and settles at its tilt, the tack presses
 * down with a small squash, then the logo flies to its place. Nothing behind it waits, and it
 * never takes a tap.
 */
export function Splash() {
  const [done, setDone] = useState(alreadyShown);
  const mark = useRef<SVGSVGElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (done) return;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timers: ReturnType<typeof setTimeout>[] = [];

    if (still) {
      timers.push(setTimeout(() => setDone(true), STILL_MS));
    } else {
      timers.push(
        setTimeout(() => {
          const svg = mark.current;
          const target = findTarget();
          backdrop.current?.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: FLY_MS,
            easing: 'ease-out',
            fill: 'forwards',
          });
          if (svg && target) {
            const from = svg.getBoundingClientRect();
            const to = target.getBoundingClientRect();
            const dx = to.left + to.width / 2 - (from.left + from.width / 2);
            const dy = to.top + to.height / 2 - (from.top + from.height / 2);
            svg.animate(
              [
                { transform: 'none' },
                { transform: `translate(${dx}px, ${dy}px) scale(${to.width / from.width})` },
              ],
              { duration: FLY_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' },
            );
          }
        }, SETTLED_MS),
        setTimeout(() => setDone(true), SETTLED_MS + FLY_MS),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [done]);

  if (done) return null;
  return (
    <div className={styles.splash} aria-hidden="true" data-splash>
      <div ref={backdrop} className={styles.backdrop} />
      <svg ref={mark} className={styles.mark} viewBox="0 0 512 512">
        <g className={styles.card}>
          <g transform="rotate(-6 256 290)">
            <rect x="124" y="140" width="264" height="300" rx="36" className={styles.body} />
            <path d="M168 238 l18 18 l34 -38" className={styles.check} />
            <rect x="240" y="232" width="104" height="18" rx="9" className={styles.lineDone} />
            <rect x="168" y="296" width="176" height="18" rx="9" className={styles.line} />
            <rect x="168" y="352" width="120" height="18" rx="9" className={styles.line} />
          </g>
        </g>
        <g className={styles.tack}>
          <circle cx="256" cy="128" r="50" className={styles.tackHead} />
          <circle cx="240" cy="110" r="14" className={styles.tackShine} />
        </g>
      </svg>
    </div>
  );
}
