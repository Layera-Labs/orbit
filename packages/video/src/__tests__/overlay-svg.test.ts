import { describe, expect, it } from 'vitest';
import { overlayToSVG } from '../overlay-svg';
import type { TextOverlay } from '../types';

const base: TextOverlay = {
  id: 'o',
  type: 'text',
  text: 'Hi & <there>',
  start: 0,
  end: 2,
  x: 0.5,
  y: 0.85,
  fontSize: 60,
  color: 'white',
  align: 'center',
  box: { color: 'black', opacity: 0.5 },
};

describe('overlayToSVG', () => {
  it('renders a full-frame svg with an escaped caption + box', () => {
    const svg = overlayToSVG(base, 1080, 1920);
    expect(svg).toContain('width="1080"');
    expect(svg).toContain('height="1920"');
    expect(svg).toContain('<text');
    expect(svg).toContain('text-anchor="middle"');
    expect(svg).toContain('<rect'); // caption box
    expect(svg).toContain('Hi &amp; &lt;there&gt;'); // XML-escaped
  });

  it('splits newlines into multiple tspans and omits the box when unset', () => {
    const svg = overlayToSVG({ ...base, text: 'a\nb', box: undefined }, 100, 100);
    expect((svg.match(/<tspan/g) ?? []).length).toBe(2);
    expect(svg).not.toContain('<rect');
  });
});
