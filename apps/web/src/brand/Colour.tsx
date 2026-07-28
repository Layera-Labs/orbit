'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Popover } from './Popover';
import styles from './Colour.module.css';

/* ------------------------------------------------------------ saved colours --- */

const SAVED_KEY = 'orbit-swatches';
const SAVED_MAX = 18;

/**
 * Custom colours are a USER preference, not document data.
 *
 * They belong to the person, not the file — a palette you mixed while working on
 * one poster should be there when you open the next. So localStorage rather than
 * the project row, and shared across every document.
 */
let saved: string[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function readSaved(): string[] {
  if (loaded) return saved;
  loaded = true;
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]');
    saved = Array.isArray(raw) ? raw.filter((c) => typeof c === 'string').slice(0, SAVED_MAX) : [];
  } catch {
    saved = [];
  }
  return saved;
}

export function saveColour(colour: string): void {
  const hex = colour.toLowerCase();
  const next = [hex, ...readSaved().filter((c) => c !== hex)].slice(0, SAVED_MAX);
  saved = next;
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable — the colour still applies, it just is not remembered.
  }
  listeners.forEach((l) => l());
}

function useSaved(): string[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    readSaved,
    () => [],
  );
}

/* ------------------------------------------------------------------ swatch --- */

/**
 * One colour, as a small square.
 *
 * The ring is drawn INSIDE the square with `inset` and the selected state is a
 * ring too, never a filled plate behind it. A tinted surface behind a swatch
 * mixes with the colour it is supposed to be showing — a near-white swatch on a
 * light selected plate simply disappears, which is exactly what went wrong when
 * the selected state was a background.
 */
export function Swatch({
  colour,
  size = 22,
  selected = false,
  className,
}: {
  colour: string;
  size?: number;
  selected?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`${styles.swatch} ${className ?? ''}`}
      data-selected={selected || undefined}
      style={{ background: colour, width: size, height: size }}
      aria-hidden="true"
    />
  );
}

/* ------------------------------------------------------------------ picker --- */

/** The house palette, then a neutral ramp. Small, deliberate, not a colour wheel. */
const PALETTE = [
  '#1a1715', '#3a3330', '#6b635c', '#9a938a', '#c9c2bb', '#f4f1ec',
  '#a8442f', '#c4553d', '#d98b57', '#e0b252', '#6f8f63', '#4f6a45',
  '#3f6b7a', '#2f4858', '#6a5a8c', '#8c3f5a', '#b8463a', '#ffffff',
];

export interface ColourPickerProps {
  value: string;
  onChange(colour: string): void;
  label: string;
  /** Rendered instead of the default swatch trigger. */
  size?: number;
  disabled?: boolean;
}

/**
 * A swatch that opens a grid of colours.
 *
 * The grid is the primary way to choose; the native picker is one cell in it,
 * not the whole control. Anything mixed there is remembered and appears as a new
 * swatch in the grid, so a colour you invented is reusable rather than
 * something you have to mix again from memory.
 */
export function ColourPicker({ value, onChange, label, size = 22, disabled }: ColourPickerProps) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const nativeRef = useRef<HTMLInputElement>(null);
  const savedColours = useSaved();

  // Native `change` — fired once when the OS picker is committed, unlike React's
  // `onChange`, which is the live `input` event. Saving there would record every
  // shade dragged through on the way to the one that was wanted.
  useEffect(() => {
    const input = nativeRef.current;
    if (!input) return;
    const onCommit = () => saveColour(input.value);
    input.addEventListener('change', onCommit);
    return () => input.removeEventListener('change', onCommit);
  }, [open]);
  const current = (value || '#000000').toLowerCase();

  const pick = useCallback(
    (colour: string) => {
      onChange(colour);
      setOpen(false);
    },
    [onChange],
  );

  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        className={styles.trigger}
        disabled={disabled}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={`${label} — ${current.toUpperCase()}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Swatch colour={current} size={size} />
      </button>

      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} label={label} align="center">
        <div className={styles.pickerHead}>
          <span className={styles.pickerTitle}>{label}</span>
          <span className={`${styles.pickerValue} w-data`}>{current.toUpperCase()}</span>
        </div>

        <div className={styles.grid} role="group" aria-label="Palette">
          {PALETTE.map((colour) => (
            <button
              key={colour}
              type="button"
              className={styles.cell}
              aria-label={colour}
              aria-pressed={current === colour}
              onClick={() => pick(colour)}
            >
              <Swatch colour={colour} selected={current === colour} size={size} />
            </button>
          ))}
        </div>

        {savedColours.length > 0 && (
          <>
            <p className={styles.groupLabel}>Saved</p>
            <div className={styles.grid} role="group" aria-label="Saved colours">
              {savedColours.map((colour) => (
                <button
                  key={colour}
                  type="button"
                  className={styles.cell}
                  aria-label={colour}
                  aria-pressed={current === colour}
                  onClick={() => pick(colour)}
                >
                  <Swatch colour={colour} selected={current === colour} size={size} />
                </button>
              ))}
            </div>
          </>
        )}

        <p className={styles.groupLabel}>Custom</p>
        <div className={styles.customRow}>
          {/*
            The native picker lives behind a cell rather than being the control.
            React's `onChange` is the native `input` event here — it fires
            continuously as the OS picker is dragged, which is what keeps the
            document updating live. Saving hangs off the native `change` event
            instead (see the effect above), which fires once on commit; hanging
            it off blur was wrong, because opening the OS picker need not focus
            the input at all and the colour was silently never remembered.
          */}
          <button
            type="button"
            className={styles.customCell}
            onClick={() => nativeRef.current?.click()}
            aria-label="Mix a colour"
          >
            <span className={styles.customPlus} aria-hidden="true">
              +
            </span>
            <span className={styles.customText}>Mix a colour</span>
          </button>
          <input
            ref={nativeRef}
            className={styles.nativeInput}
            type="color"
            value={current}
            aria-label={`${label}: mix a colour`}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      </Popover>
    </>
  );
}

/** A labelled row wrapping the picker, for use inside panels. */
export function ColourRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange(colour: string): void;
}) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <span className={`${styles.rowValue} w-data`}>{(value || '').toUpperCase()}</span>
      <ColourPicker value={value} onChange={onChange} label={label} />
    </div>
  );
}

/** Re-exported so panels can render a plain selectable swatch grid. */
export function SwatchGrid({
  colours,
  value,
  onChange,
  label,
}: {
  colours: string[];
  value?: string;
  onChange(colour: string): void;
  label: string;
}) {
  return (
    <div className={styles.grid} role="group" aria-label={label}>
      {colours.map((colour) => (
        <button
          key={colour}
          type="button"
          className={styles.cell}
          aria-label={colour}
          aria-pressed={value?.toLowerCase() === colour.toLowerCase()}
          onClick={() => onChange(colour)}
        >
          <Swatch colour={colour} selected={value?.toLowerCase() === colour.toLowerCase()} />
        </button>
      ))}
    </div>
  );
}

/** Load saved colours eagerly on mount so the first popover is not empty. */
export function usePrimeSavedColours(): void {
  useEffect(() => {
    readSaved();
  }, []);
}
