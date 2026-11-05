import type { Density, Theme } from '@tack/shared';
import { Screen } from '../components/Screen';
import { Segmented } from '../components/Segmented';
import { NotificationsSection } from '../components/NotificationsSection';
import { TrashSection } from '../components/TrashSection';
import { setDensity, setTheme, useAppearance } from '../lib/appearance';
import styles from './Settings.module.css';

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'roomy', label: 'Roomy' },
];

export function SettingsPage() {
  const { theme, density } = useAppearance();
  return (
    <Screen title="Settings">
      <section className={styles.section} aria-labelledby="appearance">
        <h2 id="appearance" className={styles.heading}>
          Appearance
        </h2>
        <div className={styles.row}>
          <span id="theme-label">Theme</span>
          <Segmented
            name="theme"
            labelledBy="theme-label"
            value={theme}
            options={THEME_OPTIONS}
            onChange={(value) => void setTheme(value)}
          />
        </div>
        <div className={styles.row}>
          <span id="density-label">Card density</span>
          <Segmented
            name="density"
            labelledBy="density-label"
            value={density}
            options={DENSITY_OPTIONS}
            onChange={(value) => void setDensity(value)}
          />
        </div>
      </section>
      <NotificationsSection />
      <TrashSection />
    </Screen>
  );
}
