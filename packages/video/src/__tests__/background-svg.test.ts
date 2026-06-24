import { describe, expect, it } from 'vitest';
import { backgroundToSVG } from '../background-svg';

describe('backgroundToSVG', () => {
  it('renders a solid color', () => {
    const s = backgroundToSVG({ type: 'color', color: '#ff0000' }, 100, 200);
    expect(s).toContain('width="100"');
    expect(s).toContain('height="200"');
    expect(s).toContain('fill="#ff0000"');
  });

  it('renders a linear gradient', () => {
    const s = backgroundToSVG({ type: 'gradient', from: '#000', to: '#fff', angle: 90 }, 100, 100);
    expect(s).toContain('<linearGradient');
    expect(s).toContain('stop-color="#000"');
    expect(s).toContain('stop-color="#fff"');
    expect(s).toContain('fill="url(#g)"');
  });
});
