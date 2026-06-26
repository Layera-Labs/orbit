import * as React from 'react';
import { createPortal } from 'react-dom';
import { FALLBACK_GOOGLE_FONTS, fetchGoogleFonts, loadGoogleFont } from '../utils/googleFonts';

interface GoogleFontPickerProps {
  value: string;
  onChange: (fontFamily: string) => void;
  buttonClassName?: string;
}

const PANEL_WIDTH = 280;
const PREVIEW_LIMIT = 80;

export const GoogleFontPicker: React.FC<GoogleFontPickerProps> = ({ value, onChange, buttonClassName = '' }) => {
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  const [fonts, setFonts] = React.useState<string[]>(FALLBACK_GOOGLE_FONTS);
  const [query, setQuery] = React.useState('');
  const [panelPosition, setPanelPosition] = React.useState<{ left: number; top: number } | null>(null);

  React.useEffect(() => {
    let mounted = true;
    fetchGoogleFonts().then((items) => {
      if (mounted) setFonts(items);
    });
    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    loadGoogleFont(value);
  }, [value]);

  const visibleFonts = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return fonts.slice(0, PREVIEW_LIMIT);
    return fonts
      .filter((font) => font.toLowerCase().includes(normalizedQuery))
      .slice(0, PREVIEW_LIMIT);
  }, [fonts, query]);

  React.useEffect(() => {
    visibleFonts.slice(0, 24).forEach(loadGoogleFont);
  }, [visibleFonts]);

  React.useLayoutEffect(() => {
    if (!open) return;

    const measure = () => {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      setPanelPosition({
        left: Math.min(Math.max(8, rect.left), window.innerWidth - PANEL_WIDTH - 8),
        top: rect.bottom + 8,
      });
    };

    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  const panel =
    open && panelPosition && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={panelRef}
            className="fixed z-[120] rounded-2xl border border-slate-200/80 bg-white/95 p-2 shadow-[0_24px_70px_-30px_rgba(15,23,42,0.45)] backdrop-blur-xl"
            style={{ left: panelPosition.left, top: panelPosition.top, width: PANEL_WIDTH }}
          >
            <label className="sr-only" htmlFor="orbit-font-search">Search Google fonts</label>
            <input
              id="orbit-font-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Google fonts"
              className="mb-2 h-8 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              autoFocus
            />
            <div className="max-h-60 overflow-y-auto pr-1">
              {visibleFonts.map((font) => (
                <button
                  key={font}
                  type="button"
                  onClick={() => {
                    loadGoogleFont(font);
                    onChange(font);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={`flex h-8 w-full items-center justify-between rounded-lg px-2.5 text-left text-xs transition hover:bg-slate-100 active:scale-[0.99] ${
                    font === value ? 'bg-blue-50 text-blue-700' : 'text-slate-800'
                  }`}
                >
                  <span className="truncate" style={{ fontFamily: font }}>{font}</span>
                  {font === value && <span className="text-[11px] font-semibold uppercase text-blue-600">Active</span>}
                </button>
              ))}
              {visibleFonts.length === 0 && (
                <div className="px-3 py-6 text-center text-xs text-slate-500">No fonts found</div>
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((next) => !next)}
        className={`inline-flex h-9 min-w-[6rem] items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-white/90 px-3 text-xs text-slate-800 shadow-sm outline-none transition hover:border-slate-300 hover:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 ${buttonClassName}`}
        aria-label="Font family"
        aria-expanded={open}
      >
        <span className="truncate" style={{ fontFamily: value }}>{value}</span>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {panel}
    </>
  );
};
