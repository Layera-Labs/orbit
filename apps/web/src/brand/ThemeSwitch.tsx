'use client';

import { applyTheme, useTheme, type Theme } from '@/store/themeStore';
import styles from './ThemeSwitch.module.css';

/**
 * The theme switch.
 *
 * Explicitly NOT the stock sun-and-moon pill with a sliding knob — that control
 * is one of the loudest machine-made tells there is. This shows the two palettes
 * themselves: each option is a small plate painted in that theme's own surface
 * with a bar of its own ink across it, so you are choosing a SURFACE and looking
 * at the thing you will get. It fits a product called The Instrument better than
 * a celestial metaphor does.
 *
 * Both plates are always drawn in literal colours rather than tokens, because
 * each has to show its own theme while only one of them is active.
 */
const OPTIONS: { id: Theme; label: string; surface: string; ink: string; edge: string }[] = [
  { id: 'light', label: 'Light', surface: '#e6e1de', ink: '#1a1715', edge: 'rgba(26,23,21,0.22)' },
  { id: 'dark', label: 'Dark', surface: '#100f0e', ink: '#f4f1ec', edge: 'rgba(244,241,236,0.22)' },
];

export function ThemeSwitch() {
  const theme = useTheme();

  return (
    <div className={styles.group} role="group" aria-label="Theme">
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className={styles.option}
          data-on={theme === option.id}
          aria-pressed={theme === option.id}
          title={`${option.label} theme`}
          onClick={() => applyTheme(option.id)}
        >
          <span
            className={styles.plate}
            style={{ background: option.surface, boxShadow: `inset 0 0 0 1px ${option.edge}` }}
            aria-hidden="true"
          >
            <span className={styles.bar} style={{ background: option.ink }} />
          </span>
          <span className={styles.srOnly}>{option.label} theme</span>
        </button>
      ))}
    </div>
  );
}
