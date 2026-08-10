import * as React from 'react';
import { createPortal } from 'react-dom';
import type { Layer, TextContent } from '@layera-labs/orbit-shared';
import type { OrbitEngine } from '@layera-labs/orbit-core';
import { GoogleFontPicker } from './GoogleFontPicker';

type TextGradient = NonNullable<TextContent['gradient']>;
type TextShadow = NonNullable<TextContent['shadow']>;

interface TextToolbarProps {
  engine: OrbitEngine | null;
  layer: Layer;
  content: TextContent;
  updateLayer: (id: string, updates: Partial<Layer>) => void;
  updateContent: (engine: OrbitEngine | null, layer: Layer, updates: Record<string, unknown>) => void;
}

const SOLID_COLORS = [
  'transparent',
  '#ffffff',
  '#f8f9fa',
  '#f1f3f5',
  '#e9ecef',
  '#dee2e6',
  '#212529',
  '#1293e8',
  '#339af0',
  '#51cf66',
  '#fcc419',
  '#ff922b',
  '#ff6b6b',
  '#c75be8',
  '#845ef7',
  '#5c7cfa',
  '#2bb7c9',
  '#20c997',
  '#94d82d',
];

const GRADIENT_PRESETS: TextGradient[] = [
  { start: '#667eea', end: '#764ba2', angle: 135 },
  { start: '#f06595', end: '#cc5de8', angle: 135 },
  { start: '#22b8cf', end: '#0ccef5', angle: 135 },
  { start: '#38d9a9', end: '#20c997', angle: 135 },
  { start: '#ff8787', end: '#ffd43b', angle: 135 },
  { start: '#b197fc', end: '#f3d9fa', angle: 135 },
  { start: '#ffc9c9', end: '#cc5de8', angle: 135 },
  { start: '#d0ebff', end: '#91a7ff', angle: 135 },
  { start: '#e9ecef', end: '#ced4da', angle: 135 },
  { start: '#212529', end: '#212529', angle: 135 },
  { start: '#faa2c1', end: '#fcc2d7', angle: 135 },
  { start: '#b2f2bb', end: '#e9fac8', angle: 135 },
];

function isHexColor(value: string | undefined): boolean {
  return !!value && /^#[0-9a-f]{6}$/i.test(value);
}

function getGradientCss(gradient: TextGradient): string {
  return `linear-gradient(${gradient.angle}deg, ${gradient.start}, ${gradient.end})`;
}

function sameGradient(a: TextGradient | undefined, b: TextGradient): boolean {
  return !!a && a.start === b.start && a.end === b.end && a.angle === b.angle;
}

const Divider: React.FC = () => <div className="h-9 w-px bg-slate-200" />;

const IconButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }> = ({
  active,
  className = '',
  ...props
}) => (
  <button
    {...props}
    className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-base font-semibold text-slate-800 transition hover:bg-slate-100 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 ${
      active ? 'bg-slate-100' : 'bg-transparent'
    } ${className}`}
  />
);

const NumberInput: React.FC<{
  value: number;
  onChange: (value: number) => void;
}> = ({ value, onChange }) => (
  <input
    type="number"
    value={value}
    onChange={(event) => onChange(Number(event.target.value))}
    className="h-9 w-[58px] rounded-lg border border-slate-200 bg-white px-2 text-center text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
    aria-label="Font size"
  />
);

const Panel: React.FC<{
  anchor: HTMLElement | null;
  width: number;
  children: React.ReactNode;
  onClose: () => void;
}> = ({ anchor, width, children, onClose }) => {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState<{ left: number; top: number } | null>(null);

  React.useLayoutEffect(() => {
    if (!anchor) return;

    const measure = () => {
      const rect = anchor.getBoundingClientRect();
      setPosition({
        left: Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8),
        top: rect.bottom + 10,
      });
    };

    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [anchor, width]);

  React.useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (anchor?.contains(target) || panelRef.current?.contains(target)) return;
      onClose();
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [anchor, onClose]);

  if (!position || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[130] rounded-2xl border border-slate-200/80 bg-white p-3 shadow-[0_24px_64px_-34px_rgba(15,23,42,0.5)]"
      style={{ left: position.left, top: position.top, width }}
    >
      {children}
    </div>,
    document.body
  );
};

const PopoverButton: React.FC<{
  label: string;
  value?: string;
  active?: boolean;
  width: number;
  children: (close: () => void) => React.ReactNode;
  icon: React.ReactNode;
}> = ({ label, value, active, width, children, icon }) => {
  const popoverId = React.useId();
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const handleOpen = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== popoverId) {
        setOpen(false);
      }
    };
    window.addEventListener('orbit-text-popover-open', handleOpen);
    return () => window.removeEventListener('orbit-text-popover-open', handleOpen);
  }, [popoverId]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        title={label}
        onClick={() => {
          setOpen((next) => {
            const nextOpen = !next;
            if (nextOpen) {
              window.dispatchEvent(new CustomEvent('orbit-text-popover-open', { detail: popoverId }));
            }
            return nextOpen;
          });
        }}
        className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 active:scale-[0.97] ${
          active || open ? 'bg-slate-100' : 'bg-transparent'
        }`}
      >
        {icon}
        {value && <span>{value}</span>}
      </button>
      {open && (
        <Panel anchor={buttonRef.current} width={width} onClose={() => setOpen(false)}>
          {children(() => setOpen(false))}
        </Panel>
      )}
    </>
  );
};

const RangeRow: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, step = 1, suffix = '', onChange }) => {
  const [localValue, setLocalValue] = React.useState(value);
  
  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <label className="block">
      <div className="mb-3 flex items-center justify-between text-sm font-medium text-slate-800">
        <span>{label}</span>
        <span className="text-slate-600">{localValue}{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={localValue}
        onChange={(event) => setLocalValue(Number(event.target.value))}
        onMouseUp={() => onChange(localValue)}
        onPointerUp={() => onChange(localValue)}
        onTouchEnd={() => onChange(localValue)}
        className="w-full accent-slate-900"
      />
    </label>
  );
};

const ColorSwatch: React.FC<{
  color: string;
  active: boolean;
  onClick: () => void;
}> = ({ color, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`h-10 w-10 rounded-full border transition active:scale-[0.96] ${
      active ? 'border-slate-950 ring-2 ring-slate-200' : 'border-slate-200 hover:border-slate-400'
    }`}
    style={{
      background:
        color === 'transparent'
          ? 'linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)'
          : color,
      backgroundColor: color === 'transparent' ? '#ffffff' : color,
      backgroundSize: color === 'transparent' ? '16px 16px' : undefined,
      backgroundPosition: color === 'transparent' ? '0 0, 0 8px, 8px -8px, -8px 0px' : undefined,
    }}
    title={color}
  />
);

const GradientSwatch: React.FC<{
  gradient: TextGradient;
  active: boolean;
  onClick: () => void;
}> = ({ gradient, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`h-12 w-12 rounded-full border transition active:scale-[0.96] ${
      active ? 'border-slate-950 ring-2 ring-slate-200' : 'border-slate-200 hover:border-slate-400'
    }`}
    style={{ background: getGradientCss(gradient) }}
  />
);

const AlignmentIcon: React.FC<{ align: TextContent['alignment'] }> = ({ align }) => {
  const rows =
    align === 'center'
      ? [18, 26, 18]
      : align === 'right'
        ? [18, 26, 22]
        : align === 'justify'
          ? [26, 26, 26]
          : [26, 18, 22];

  return (
    <svg width="20" height="20" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      {rows.map((rowWidth, index) => {
        const x = align === 'right' ? 24 - rowWidth : align === 'center' ? (26 - rowWidth) / 2 : 2;
        return (
          <rect
            key={index}
            x={x}
            y={6 + index * 7}
            width={rowWidth}
            height="2.4"
            rx="1.2"
            fill="currentColor"
          />
        );
      })}
    </svg>
  );
};

const SimpleIcon: React.FC<{ type: 'blur' | 'opacity' | 'stroke' | 'shadow' }> = ({ type }) => {
  if (type === 'blur') {
    return (
      <svg width="20" height="20" viewBox="0 0 26 26" fill="none" aria-hidden="true">
        <path d="M13 3c4 5 6 8 6 12a6 6 0 0 1-12 0c0-4 2-7 6-12z" stroke="currentColor" strokeWidth="2" />
        <path d="M9 17c2.5 1.6 5.3 1.6 8 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === 'opacity') {
    return (
      <svg width="20" height="20" viewBox="0 0 26 26" fill="none" aria-hidden="true">
        <circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="2" />
        <circle cx="16" cy="16" r="6" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  if (type === 'stroke') {
    return (
      <svg width="20" height="20" viewBox="0 0 26 26" fill="none" aria-hidden="true">
        <rect x="6" y="5" width="14" height="16" rx="4" stroke="currentColor" strokeWidth="2" />
        <path d="M9 10h8M9 14h8M9 18h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <rect x="5" y="5" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="2" />
      <path d="M7 19L19 7M5 15L15 5M11 21L21 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
};

export const TextToolbar: React.FC<TextToolbarProps> = ({
  engine,
  layer,
  content,
  updateLayer,
  updateContent,
}) => {
  const patchContent = React.useCallback(
    (updates: Record<string, unknown>) => updateContent(engine, layer, updates),
    [content, engine, layer, updateContent]
  );

  const colorValue = isHexColor(content.color) ? content.color : '#1a1a1a';
  const blur = content.blur ?? 0;
  const strokeWidth = content.textStrokeWidth ?? 0;
  const strokeColor = content.textStrokeColor ?? '#1a1a1a';
  const shadow: TextShadow = content.shadow ?? {
    color: '#1a1a1a',
    blur: 14,
    opacity: 35,
    offsetX: 6,
    offsetY: 6,
  };

  return (
    <>
      <GoogleFontPicker
        value={content.fontFamily}
        onChange={(fontFamily) => patchContent({ fontFamily })}
        buttonClassName="h-9 min-w-[96px] rounded-full border-0 bg-transparent px-3 text-sm shadow-none hover:bg-slate-100 focus:ring-0"
      />
      <Divider />
      <NumberInput value={content.fontSize} onChange={(fontSize) => patchContent({ fontSize })} />
      <Divider />
      <PopoverButton
        label="Text color and gradient"
        width={360}
        active={!!content.gradient}
        icon={
          <span
            className="h-7 w-7 rounded-lg border border-slate-300"
            style={{ background: content.gradient ? getGradientCss(content.gradient) : colorValue }}
          />
        }
      >
        {() => <ColorGradientPanel content={content} patchContent={patchContent} colorValue={colorValue} />}
      </PopoverButton>
      <Divider />
      {(['left', 'center', 'right', 'justify'] as const).map((alignment) => (
        <IconButton
          key={alignment}
          type="button"
          title={`Align ${alignment}`}
          active={(content.alignment ?? 'left') === alignment}
          onClick={() => patchContent({ alignment })}
        >
          <AlignmentIcon align={alignment} />
        </IconButton>
      ))}
      <Divider />
      <IconButton
        type="button"
        title="Bold"
        active={(content.fontWeight ?? 400) >= 700}
        onClick={() => patchContent({ fontWeight: (content.fontWeight ?? 400) >= 700 ? 400 : 700 })}
      >
        B
      </IconButton>
      <IconButton
        type="button"
        title="Italic"
        active={content.fontStyle === 'italic'}
        onClick={() => patchContent({ fontStyle: content.fontStyle === 'italic' ? 'normal' : 'italic' })}
      >
        <span className="italic">I</span>
      </IconButton>
      <IconButton
        type="button"
        title="Underline"
        active={content.decoration === 'underline'}
        onClick={() => patchContent({ decoration: content.decoration === 'underline' ? 'none' : 'underline' })}
      >
        <span className="underline underline-offset-4">U</span>
      </IconButton>
      <Divider />
      <PopoverButton
        label="Blur"
        value={`${blur}%`}
        width={300}
        active={blur > 0}
        icon={<SimpleIcon type="blur" />}
      >
        {() => (
          <RangeRow
            label="Blur"
            value={blur}
            min={0}
            max={100}
            suffix="%"
            onChange={(value) => patchContent({ blur: value })}
          />
        )}
      </PopoverButton>
      <Divider />
      <PopoverButton
        label="Transparency"
        value={`${Math.round(layer.opacity * 100)}%`}
        width={300}
        active={layer.opacity < 1}
        icon={<SimpleIcon type="opacity" />}
      >
        {() => (
          <RangeRow
            label="Opacity"
            value={Math.round(layer.opacity * 100)}
            min={0}
            max={100}
            suffix="%"
            onChange={(value) => updateLayer(layer.id, { opacity: value / 100 })}
          />
        )}
      </PopoverButton>
      <Divider />
      <PopoverButton
        label="Stroke"
        value={`${strokeWidth}px`}
        width={300}
        active={strokeWidth > 0}
        icon={<SimpleIcon type="stroke" />}
      >
        {() => (
          <div className="space-y-5">
            <RangeRow
              label="Stroke width"
              value={strokeWidth}
              min={0}
              max={40}
              suffix="px"
              onChange={(value) => patchContent({ textStrokeWidth: value })}
            />
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-800">Stroke color</span>
              <input
                type="color"
                value={isHexColor(strokeColor) ? strokeColor : '#1a1a1a'}
                onChange={(event) => patchContent({ textStrokeColor: event.target.value })}
                className="h-9 w-9 rounded-lg border border-slate-200 bg-white p-1"
                aria-label="Stroke color"
              />
            </div>
          </div>
        )}
      </PopoverButton>
      <Divider />
      <PopoverButton
        label="Shadow"
        value={content.shadow ? '' : '-'}
        width={320}
        active={!!content.shadow}
        icon={<SimpleIcon type="shadow" />}
      >
        {() => (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-800">Shadow</span>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                Color
                <input
                  type="color"
                  value={isHexColor(shadow.color) ? shadow.color : '#1a1a1a'}
                  onChange={(event) => patchContent({ shadow: { ...shadow, color: event.target.value } })}
                  className="h-9 w-9 rounded-lg border border-slate-200 bg-white p-1"
                  aria-label="Shadow color"
                />
              </label>
            </div>
            <RangeRow
              label="Blur"
              value={shadow.blur}
              min={0}
              max={60}
              suffix="px"
              onChange={(value) => patchContent({ shadow: { ...shadow, blur: value } })}
            />
            <RangeRow
              label="Opacity"
              value={shadow.opacity}
              min={0}
              max={100}
              suffix="%"
              onChange={(value) => patchContent({ shadow: { ...shadow, opacity: value } })}
            />
            <RangeRow
              label="Offset X"
              value={shadow.offsetX}
              min={-50}
              max={50}
              suffix="px"
              onChange={(value) => patchContent({ shadow: { ...shadow, offsetX: value } })}
            />
            <RangeRow
              label="Offset Y"
              value={shadow.offsetY}
              min={-50}
              max={50}
              suffix="px"
              onChange={(value) => patchContent({ shadow: { ...shadow, offsetY: value } })}
            />
            <button
              type="button"
              onClick={() => patchContent({ shadow: undefined })}
              className="h-10 rounded-lg px-3 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              Remove shadow
            </button>
          </div>
        )}
      </PopoverButton>
      <Divider />
      <IconButton type="button" title="Delete" onClick={() => engine?.removeLayer(layer.id)}>
        <svg width="20" height="20" viewBox="0 0 26 26" fill="none" aria-hidden="true">
          <path d="M5 7h16M10 7V5h6v2M9 10v10M13 10v10M17 10v10M7 7l1 16h10l1-16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </IconButton>
    </>
  );
};

const ColorGradientPanel: React.FC<{
  content: TextContent;
  colorValue: string;
  patchContent: (updates: Record<string, unknown>) => void;
}> = ({ content, colorValue, patchContent }) => {
  const [tab, setTab] = React.useState<'solid' | 'gradient'>(content.gradient ? 'gradient' : 'solid');
  const activeGradient = content.gradient ?? GRADIENT_PRESETS[0];

  return (
    <div>
      <div className="mb-3 grid grid-cols-2 rounded-lg bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setTab('solid')}
          className={`h-9 rounded-lg text-sm font-semibold transition ${tab === 'solid' ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-500'}`}
        >
          Solid
        </button>
        <button
          type="button"
          onClick={() => setTab('gradient')}
          className={`h-9 rounded-lg text-sm font-semibold transition ${tab === 'gradient' ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-500'}`}
        >
          Gradient
        </button>
      </div>

      {tab === 'solid' ? (
        <>
          <div className="grid grid-cols-6 gap-3">
            {SOLID_COLORS.map((color) => (
              <ColorSwatch
                key={color}
                color={color}
                active={!content.gradient && content.color === color}
                onClick={() => patchContent({ color, gradient: undefined })}
              />
            ))}
          </div>
          <div className="mt-4 flex h-11 items-center gap-3 rounded-lg border border-slate-200 px-3">
            <input
              type="color"
              value={colorValue}
              onChange={(event) => patchContent({ color: event.target.value, gradient: undefined })}
              className="h-8 w-8 rounded-full border border-slate-200 bg-white p-1"
              aria-label="Custom text color"
            />
            <input
              value={colorValue}
              onChange={(event) => {
                if (isHexColor(event.target.value)) {
                  patchContent({ color: event.target.value, gradient: undefined });
                }
              }}
              className="min-w-0 flex-1 text-sm text-slate-900 outline-none"
              aria-label="Text color hex"
            />
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3">
            {GRADIENT_PRESETS.map((gradient) => (
              <GradientSwatch
                key={`${gradient.start}-${gradient.end}-${gradient.angle}`}
                gradient={gradient}
                active={sameGradient(content.gradient, gradient)}
                onClick={() => patchContent({ gradient, color: gradient.start })}
              />
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-slate-200 p-3">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Custom</p>
            <div className="space-y-3">
              {(['start', 'end'] as const).map((key) => (
                <label key={key} className="flex items-center gap-3 text-sm text-slate-700">
                  <span className="w-10 capitalize">{key}</span>
                  <input
                    type="color"
                    value={activeGradient[key]}
                    onChange={(event) => {
                      const gradient = { ...activeGradient, [key]: event.target.value };
                      patchContent({ gradient, color: gradient.start });
                    }}
                    className="h-8 w-8 rounded-full border border-slate-200 bg-white p-1"
                  />
                  <input
                    value={activeGradient[key]}
                    onChange={(event) => {
                      if (isHexColor(event.target.value)) {
                        const gradient = { ...activeGradient, [key]: event.target.value };
                        patchContent({ gradient, color: gradient.start });
                      }
                    }}
                    className="h-9 flex-1 rounded-lg border border-slate-200 px-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
              ))}
              <RangeRow
                label="Angle"
                value={activeGradient.angle}
                min={0}
                max={360}
                suffix=" deg"
                onChange={(angle) => patchContent({ gradient: { ...activeGradient, angle }, color: activeGradient.start })}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};
