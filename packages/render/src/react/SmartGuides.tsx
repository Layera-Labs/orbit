import { Line } from 'react-konva';
import type { Guide } from '../types';

export function SmartGuides({ guides, zoom }: { guides: Guide[]; zoom: number }) {
  return (
    <>
      {guides.map((g, i) => {
        const points =
          g.axis === 'x'
            ? [g.position, g.start, g.position, g.end]
            : [g.start, g.position, g.end, g.position];
        return (
          <Line
            key={i}
            points={points}
            stroke="#10b981"
            strokeWidth={1 / zoom}
            listening={false}
            perfectDrawEnabled={false}
          />
        );
      })}
    </>
  );
}
