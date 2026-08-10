import { createElement, createId, createPage, type Document } from '@layera-labs/orbit-model';
import type {
  TemplateListOptions,
  TemplateProvider,
  TemplateSummary,
} from '../types';

function svgThumb(label: string, bg: string, fg: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><rect width='200' height='200' fill='${bg}'/><text x='100' y='105' font-family='sans-serif' font-size='18' fill='${fg}' text-anchor='middle'>${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function doc(width: number, height: number, background: string, build: ReturnType<typeof createElement>[]): Document {
  return {
    id: createId('doc'),
    schemaVersion: 2,
    width,
    height,
    unit: 'px',
    pages: [createPage({ width, height, background: { type: 'solid', color: background }, children: build })],
    fonts: [],
  };
}

interface Entry {
  summary: TemplateSummary;
  make: () => Document;
}

const TEMPLATES: Entry[] = [
  {
    summary: { id: 'quote', name: 'Quote', thumbnail: svgThumb('Quote', '#0f172a', '#fafafa'), width: 1080, height: 1080, category: 'Social' },
    make: () =>
      doc(1080, 1080, '#0f172a', [
        createElement({ type: 'text', text: '“Design is intelligence made visible.”', x: 120, y: 360, width: 840, height: 280, fontSize: 76, fontWeight: 700, fill: '#f8fafc', align: 'center', fontFamily: 'Playfair Display' }),
        createElement({ type: 'text', text: '— ALINA WHEELER', x: 120, y: 700, width: 840, height: 48, fontSize: 28, fontWeight: 600, fill: '#94a3b8', align: 'center' }),
        createElement({ type: 'shape', shape: 'rect', x: 480, y: 300, width: 120, height: 8, fill: '#22d3ee' }),
      ]),
  },
  {
    summary: { id: 'sale', name: 'Sale', thumbnail: svgThumb('SALE', '#dc2626', '#ffffff'), width: 1080, height: 1080, category: 'Marketing' },
    make: () =>
      doc(1080, 1080, '#dc2626', [
        createElement({ type: 'text', text: 'BIG\nSALE', x: 120, y: 220, width: 840, height: 360, fontSize: 200, fontWeight: 700, fill: '#ffffff', align: 'center' }),
        createElement({ type: 'shape', shape: 'rect', x: 290, y: 640, width: 500, height: 110, fill: '#111827', cornerRadius: 55 }),
        createElement({ type: 'text', text: 'UP TO 50% OFF', x: 290, y: 672, width: 500, height: 48, fontSize: 40, fontWeight: 700, fill: '#ffffff', align: 'center' }),
      ]),
  },
  {
    summary: { id: 'title', name: 'Title Card', thumbnail: svgThumb('Title', '#4f46e5', '#ffffff'), width: 1920, height: 1080, category: 'Presentation' },
    make: () =>
      doc(1920, 1080, '#eef2ff', [
        createElement({ type: 'shape', shape: 'ellipse', x: 1500, y: -200, width: 700, height: 700, fill: '#c7d2fe' }),
        createElement({ type: 'text', text: 'Project Orbit', x: 160, y: 420, width: 1100, height: 130, fontSize: 110, fontWeight: 700, fill: '#1e1b4b' }),
        createElement({ type: 'text', text: 'A modular canvas editor SDK', x: 162, y: 580, width: 900, height: 60, fontSize: 44, fontWeight: 400, fill: '#4f46e5' }),
      ]),
  },
];

/** Zero-config template library (templates ARE Document JSON). */
export class DemoTemplateProvider implements TemplateProvider {
  readonly id = 'demo-templates';
  readonly kind = 'template' as const;

  async list(options?: TemplateListOptions): Promise<TemplateSummary[]> {
    const q = options?.query?.toLowerCase().trim();
    return TEMPLATES.map((t) => t.summary).filter((s) =>
      q ? s.name.toLowerCase().includes(q) : true,
    );
  }

  async getDocument(id: string): Promise<Document> {
    const entry = TEMPLATES.find((t) => t.summary.id === id);
    if (!entry) throw new Error(`Template not found: ${id}`);
    return entry.make();
  }

  async categories(): Promise<string[]> {
    return [...new Set(TEMPLATES.map((t) => t.summary.category).filter(Boolean) as string[])];
  }
}
