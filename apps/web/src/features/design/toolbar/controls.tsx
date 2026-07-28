'use client';

import { useState, type ReactNode } from 'react';
import { Icon, type IconName } from '@/brand/Icon';
import { Popover } from '@/brand/Popover';
import styles from './PropertyBar.module.css';

/** The bar shell. Horizontal, scrollable, pinned by its own stylesheet. */
export function PropertyBar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.bar} role="toolbar" aria-label={label}>
      {children}
    </div>
  );
}

export function Sep() {
  return <span className={styles.sep} aria-hidden="true" />;
}

export function BarButton({
  icon,
  label,
  text,
  on,
  disabled,
  danger,
  onClick,
}: {
  icon: IconName;
  label: string;
  /** Renders the mark beside a word. Same reasoning as `BarMenu`'s `text`. */
  text?: string;
  on?: boolean;
  disabled?: boolean;
  danger?: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      className={`${text ? styles.textButton : styles.iconButton} ${danger ? styles.danger : ''}`}
      data-on={on || undefined}
      aria-pressed={on === undefined ? undefined : on}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} size={text ? 13 : 15} />
      {text && <span>{text}</span>}
    </button>
  );
}

/**
 * A number you type.
 *
 * Held as a STRING while focused so an intermediate value like "" or "-" does
 * not get coerced to 0 and written to the document on the way to "-40". It
 * commits on blur and on Enter, and reverts on Escape.
 */
export function NumField({
  icon,
  label,
  value,
  min,
  max,
  suffix,
  precision = 0,
  onChange,
}: {
  icon?: IconName;
  label: string;
  value: number;
  min?: number;
  max?: number;
  suffix?: string;
  /** Decimals to SHOW. Geometry is whole pixels, so it defaults to none. */
  precision?: number;
  onChange(v: number): void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const factor = 10 ** precision;
  const shown = draft ?? String(Math.round(value * factor) / factor);

  const commit = (raw: string) => {
    const n = Number(raw);
    setDraft(null);
    if (!Number.isFinite(n)) return;
    let next = n;
    if (min != null) next = Math.max(min, next);
    if (max != null) next = Math.min(max, next);
    if (next !== value) onChange(next);
  };

  return (
    <label className={styles.field} title={label}>
      {icon && <Icon name={icon} size={13} />}
      <span className="sr-only">{label}</span>
      <input
        className={styles.fieldInput}
        type="number"
        value={shown}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === 'Escape') {
            setDraft(null);
            (e.target as HTMLInputElement).blur();
          }
          // The canvas listens for Delete/Backspace; typing a number must not
          // reach it and remove the very element being edited.
          e.stopPropagation();
        }}
      />
      {suffix && <span className={styles.fieldSuffix}>{suffix}</span>}
    </label>
  );
}

/**
 * A trigger that opens arbitrary content in a popover.
 *
 * Three shapes, in order of how much the trigger has to say:
 * - `value` — a select showing the current setting ("Oswald").
 * - `text` — an icon plus a WORD. Menus get this by default, because a mark on
 *   its own could not carry "arrange" or "size and position": those were read as
 *   "collapse" and "database" respectively. A tooltip is not an answer when the
 *   question is what the button does at a glance.
 * - neither — a bare mark, only for verbs a glyph genuinely carries (duplicate,
 *   delete) or a state toggle sitting in a labelled group.
 */
export function BarMenu({
  label,
  value,
  text,
  icon,
  children,
  wide,
}: {
  label: string;
  value?: string;
  text?: string;
  icon?: IconName;
  children: ReactNode | ((close: () => void) => ReactNode);
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const close = () => setOpen(false);
  const shape = value !== undefined ? styles.select : text ? styles.textButton : styles.iconButton;

  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        className={shape}
        data-on={open || undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((o) => !o)}
      >
        {icon && <Icon name={icon} size={value === undefined && !text ? 15 : 13} />}
        {value !== undefined && <span className={styles.selectValue}>{value}</span>}
        {text && <span>{text}</span>}
        {value !== undefined && (
          <span className={styles.selectCaret}>
            <Icon name="chevronDown" size={12} />
          </span>
        )}
      </button>
      <Popover
        anchor={anchor}
        open={open}
        onClose={close}
        label={label}
        align={wide ? 'center' : 'start'}
      >
        {typeof children === 'function' ? children(close) : children}
      </Popover>
    </>
  );
}

/**
 * A filter for a menu that can run long.
 *
 * Autofocused, because the only reason to open a searchable menu is to look for
 * something — and `stopPropagation` on keys so typing "b" does not reach the
 * canvas shortcut handler and do something to the selection.
 */
export function MenuSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange(v: string): void;
  placeholder: string;
}) {
  return (
    <div className={styles.search}>
      <Icon name="search" size={14} />
      <input
        className={styles.searchInput}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}

export function MenuItem({
  children,
  on,
  onClick,
  style,
}: {
  children: ReactNode;
  on?: boolean;
  onClick(): void;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      className={styles.menuItem}
      data-on={on || undefined}
      aria-pressed={on}
      onClick={onClick}
      style={style}
    >
      <span className={styles.menuLabel}>{children}</span>
      {on && <Icon name="check" size={13} />}
    </button>
  );
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format(v: number): string;
  onChange(v: number): void;
}) {
  return (
    <div className={styles.sliderRow}>
      <div className={styles.sliderHead}>
        <span className={styles.sliderLabel}>{label}</span>
        <span className={`${styles.sliderValue} w-data`}>{format(value)}</span>
      </div>
      <input
        className={styles.range}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/** A row of small toggle buttons — alignment and the like. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; icon: IconName; label: string }[];
  value: T;
  onChange(v: T): void;
  label: string;
}) {
  return (
    <span className={styles.segmented} role="group" aria-label={label}>
      {options.map((o) => (
        <BarButton
          key={o.id}
          icon={o.icon}
          label={o.label}
          on={value === o.id}
          onClick={() => onChange(o.id)}
        />
      ))}
    </span>
  );
}

export { styles as barStyles };
