import { useRef, useState } from 'react';
import type { Density, Theme } from '@tack/shared';
import { DiagnosticsSection } from '../components/DiagnosticsSection';
import { Screen } from '../components/Screen';
import { Segmented } from '../components/Segmented';
import { NotificationsSection } from '../components/NotificationsSection';
import { TrashSection } from '../components/TrashSection';
import { enableTrace, traceEnabled } from '../lib/trace';
import { setDensity, setTheme, useAppearance } from '../lib/appearance';
import styles from './Settings.module.css';

const VERSION_TAPS = 5;
const REPOSITORY = 'https://github.com/lou-bou/tack';

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
  const [diagnostics, setDiagnostics] = useState(traceEnabled);
  const versionTaps = useRef(0);
  const tapVersion = () => {
    versionTaps.current += 1;
    if (versionTaps.current < VERSION_TAPS) return;
    enableTrace();
    setDiagnostics(true);
  };
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
      <section className={`${styles.section} ${styles.about}`} aria-labelledby="about">
        <h2 id="about" className={styles.heading}>
          About
        </h2>
        <div className={styles.row}>
          {/* TEMPORARY: five taps open the diagnostics. See lib/trace.ts. */}
          <button type="button" className={styles.version} onClick={tapVersion}>
            Tack {__APP_VERSION__}
          </button>
          <a className={styles.link} href={REPOSITORY} target="_blank" rel="noreferrer">
            Repository
          </a>
        </div>
      </section>
      {diagnostics && <DiagnosticsSection />}
    </Screen>
  );
}
