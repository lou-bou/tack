import styles from './Logo.module.css';

/** The mark, with the variant for the current theme chosen in CSS so it never lags a change. */
export function LogoMark() {
  return (
    <span className={styles.mark} aria-hidden="true" data-logo-target>
      <img className={styles.onLight} src="/brand/tack-logo.svg" alt="" />
      <img className={styles.onDark} src="/brand/tack-logo-dark.svg" alt="" />
    </span>
  );
}
