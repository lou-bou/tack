import { useEffect, useState } from 'react';
import {
  enablePush,
  isInstalled,
  isIos,
  isTouchPrimary,
  pushState,
  sendTestPush,
  type PushState,
} from '../lib/push';
import { Button } from './Button';
import { useToast } from './Toast';
import pageStyles from '../pages/Settings.module.css';
import styles from './NotificationsSection.module.css';

const STATE_TEXT: Record<PushState, string> = {
  unsupported: "This browser can't receive notifications.",
  blocked: "Blocked in this device's settings.",
  off: 'Off on this phone.',
  on: 'On for this phone.',
};

export function NotificationsSection() {
  const toast = useToast();
  const [state, setState] = useState<PushState | null>(null);
  const [touch] = useState(isTouchPrimary);
  // iPhone only offers push to an app on the Home Screen (SPEC §3.8).
  const [needsInstall] = useState(() => isIos() && !isInstalled());

  useEffect(() => {
    let live = true;
    void pushState().then((value) => {
      if (live) setState(value);
    });
    return () => {
      live = false;
    };
  }, []);

  const enable = async () => {
    const problem = await enablePush();
    if (problem) toast.show(problem);
    setState(await pushState());
  };

  return (
    <section className={pageStyles.section} aria-labelledby="notifications">
      <h2 id="notifications" className={pageStyles.heading}>
        Notifications
      </h2>
      {touch && (
        <div className={pageStyles.row}>
          <div className={styles.text}>
            <span>Enable notifications on this phone</span>
            <span className={styles.hint}>
              {needsInstall
                ? 'On iPhone, add Tack to your Home Screen first, then open it from there.'
                : state && STATE_TEXT[state]}
            </span>
          </div>
          {!needsInstall && state !== 'unsupported' && state !== 'blocked' && (
            <Button onClick={() => void enable()}>
              {state === 'on' ? 'Turn on again' : 'Enable'}
            </Button>
          )}
        </div>
      )}
      <div className={pageStyles.row}>
        <span>Test notification</span>
        <Button onClick={() => void sendTestPush().then((message) => toast.show(message))}>
          Send test
        </Button>
      </div>
    </section>
  );
}
