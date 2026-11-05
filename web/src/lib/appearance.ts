import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { DENSITIES, SETTINGS_ID, THEMES, type Density, type Theme } from '@tack/shared';
import { db, store } from '../data';

// A local copy of the synced setting, read by index.html before first paint.
const THEME_KEY = 'tack.theme';
const DENSITY_KEY = 'tack.density';

function readLocal<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key) as T | null;
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Only costs a flash of the default look on the next launch.
  }
}

/** The saved choice. Before the first pull there's no row yet, so the local copy stands in. */
export function useAppearance(): { theme: Theme; density: Density } {
  const row = useLiveQuery(() => db.settings.get(SETTINGS_ID), []);
  return {
    theme: row?.theme ?? readLocal(THEME_KEY, THEMES, 'system'),
    density: row?.density ?? readLocal(DENSITY_KEY, DENSITIES, 'compact'),
  };
}

export const setTheme = (theme: Theme) => store.update('settings', SETTINGS_ID, { theme });
export const setDensity = (density: Density) => store.update('settings', SETTINGS_ID, { density });

function paintTheme(theme: Theme, systemDark: boolean): void {
  const dark = theme === 'dark' || (theme === 'system' && systemDark);
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  const background = getComputedStyle(root).getPropertyValue('--bg').trim();
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((meta) => meta.setAttribute('content', background));
}

/** Keeps the page in step with the saved settings, including changes from other devices. */
export function useApplyAppearance(): void {
  const { theme, density } = useAppearance();

  useEffect(() => {
    writeLocal(THEME_KEY, theme);
    const media = matchMedia('(prefers-color-scheme: dark)');
    const paint = () => paintTheme(theme, media.matches);
    paint();
    media.addEventListener('change', paint);
    return () => media.removeEventListener('change', paint);
  }, [theme]);

  useEffect(() => {
    writeLocal(DENSITY_KEY, density);
    document.documentElement.dataset.density = density;
  }, [density]);
}
