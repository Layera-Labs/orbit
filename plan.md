# Orbit Agentic Canvas Editor SDK — Final Implementation Plan

## 1. Overview & Vision

**Orbit** is a developer-facing, embeddable canvas editor SDK sold via **$200/month subscription**. It combines a traditional drag-and-drop manual editor with an AI-powered "Agentic" interface, allowing end-users to edit images (and later videos) via natural language prompts or precise manual controls.

**Core Paradigm:** Dual-mode editing — *Agentic* (AI-driven, prompt-based) and *Manual* (pixel-perfect, direct manipulation).

**Key Business Requirements:**
- **$200/month subscription only** — no free tier. Only paid `orbit_sk_...` keys can install and use the SDK.
- **White-label by default**: No Orbit branding. Full control over styles, icons, colors, fonts.
- **Configuration-driven UI**: Developers can hide, remove, add, or reorder any UI item (sidebar items, toolbar items, panels).
- **Developer-branded watermarks**: Full freedom for developers to add/remove canvas and export watermarks via their own backend logic — no coupling to our backend.
- **Our backend proxies all AI requests**: `api.orbit.ai/v1/*`. We inject system prompts on top of user requests. Models: OpenAI GPT-4o + Google Gemini.
- **Client-side API keys** with domain verification (`Origin` header + allowlist).
- **React + Next.js primary support**, with a Vanilla JS core enabling all other frameworks.
- **Mobile/Tablet + Apple Pencil support** via Pointer Events.
- **Demos**: `demo.orbit.ai` (React) and `demo-next.orbit.ai` (Next.js) on Vercel.

---

## 2. UI/UX Architecture

### 2.1. Global Layout Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [Logo]  File   Edit   View   Insert   Format   Help          [User Profile] │  <-- Top Toolbar
├──────────┬──────────────────────────────────────────┬──────────────────────┤
│          │                                          │  [Agentic | Manually]│
│  LEFT    │                                          │  ─────────────────── │
│  SIDEBAR │          C A N V A S                     │  Context-Aware       │
│  (Tools) │          (Infinite/Paged)                │  Properties Panel    │
│          │                                          │                      │
│  [Icons] │          • Grid Background               │  • AI Edit           │
│  Text    │          • Rulers (optional)             │  • Crop & Expand     │
│  Photos  │          • Selected Object               │  • Adjustments       │
│  Shapes  │            Handles/Borders               │  • Lighting          │
│  ...     │                                          │  • Layers (mini)     │
│          │                                          │                      │
├──────────┴──────────────────────────────────────────┴──────────────────────┤
│  [+] Add    12.5% ─[=========●====]─ 200%    [Fit] [100%] [Fill]          │  <-- Bottom Zoom Bar
└─────────────────────────────────────────────────────────────────────────────┘
```

**Layout Rules:**
- **Dual Theme**: Dark (`#1a1a1a` panels) and Light (`#f8f9fa` panels) from Phase 0. Extensible theme manager for Phase 2.
- **Smooth Theme Transition**: CSS `transition-all duration-300` between themes.
- **Responsive Collapse**: Sidebars collapse into icon-only rails or slide-out drawers on smaller viewports.
- **Canvas Centering**: Centered in remaining viewport with subtle dot-grid/line-grid background.

---

### 2.2. Component Breakdown

#### A. Top Toolbar (Global Actions)
- **Left:** Branding, Main Menu (File, Edit, View, Insert).
- **Center:** Contextual quick actions (Undo, Redo, Duplicate, Delete, Align).
- **Right:** Export, Share, User Account, Settings.
- **Fully configurable:** Developers can reorder, hide, or inject custom items.

#### B. Left Sidebar (Asset Library)
- **Visual Style:** Icon-only vertical rail. Clicking expands a secondary "Drawer" panel.
- **Items (all hideable/reorderable):**
  1. **My Designs** — Saved projects/history.
  2. **Templates** — Pre-made layouts. *Feature: "Show templates with same size" toggle.*
  3. **Text** — Typography presets (Headers, Subheaders, Body, Fancy). *Sub-tabs: "Text" presets, "My fonts".*
  4. **Photos** — Unsplash search (developer provides API key).
  5. **Icons** — Searchable vector/SVG library.
  6. **Shapes** — Geometric primitives, tables, lines, arrows.
  7. **Stickers** — Graphics and illustrations.
  8. **Backgrounds** — Solid colors, gradients, patterns, images.
  9. **Videos** — Pexels video clips (developer provides API key). *Hidden until Phase 2.*
  10. **Upload** — Drag & drop zone for user assets.
  11. **Draw** — Freehand drawing mode (Brush/Highlighter).
  12. **Layers** — Layer manager (visibility, lock, opacity, blend modes).
  13. **Size** — Canvas resizing. *Social presets + Custom dimensions.*

#### C. Center Canvas
- **Engine:** Fabric.js v6 (wrapped for future WebGL swap).
- **Features:** Infinite/fixed-size modes, multi-select, smart guides, rulers.
- **Interactions:** Drag & Drop, Transform (move/scale/rotate/skew), Crop.
- **Touch/Stylus:** Pointer Events for mobile, tablet, Apple Pencil.

#### D. Right Panel (Properties & Agentic)
- **Tabs:**
  1. **Agentic:**
     - *Input Area:* "Describe what you want to change..."
     - *Model Selector:* Dropdown (`Flux 2 Klein`, `Flux Inpaint`, etc.).
     - *Image Reference:* Attach/upload reference image.
     - *Generate Button:* Triggers AI pipeline.
  2. **Manually:**
     - *Dynamic Inspector:* Changes based on selected object.
     - *Sections:* AI Edit, Crop & Expand, Image Adjustments, Change Lighting, Typography, Arrange.

#### E. Bottom Zoom Bar
- **Left:** Quick add page/layer.
- **Center:** Slider + input for zoom percentage.
- **Right:** Preset buttons (`Fit`, `100%`, `Fill`).

---

## 3. Custom UI Library: `@orbit/ui`

### Distribution Model (Shadcn-Style)
```bash
# Install the CLI
npx @orbit/ui@latest init

# Add components to developer's project
npx @orbit/ui add button sidebar tooltip dialog
# Copies source code into: components/ui/orbit-button.tsx
```

**Why:** Developers own the code. They can restyle, extend, or fork any component. Orbit ships design system + interaction logic, not sealed components.

### Component Inventory (Phase 1)
| Component | Description |
|-----------|-------------|
| `OrbitButton` | Primary, secondary, ghost, destructive, icon variants |
| `OrbitInput` | Text, textarea, number, search, validation states |
| `OrbitSidebar` | Collapsible rail + expandable drawer |
| `OrbitTooltip` | Hover/focus tooltips with arrow |
| `OrbitDialog` | Modal, alert, confirm, slide-over |
| `OrbitDropdown` | Select, combobox, multi-select |
| `OrbitSlider` | Range slider (zoom, adjustments) |
| `OrbitColorPicker` | Hex/RGBA, gradient picker, preset swatches |
| `OrbitLoading` | Spinner, skeleton, progress (icon + image variants) |
| `OrbitTabs` | Horizontal/vertical tabs (Agentic/Manually) |
| `OrbitAccordion` | Collapsible sections (Right Panel) |
| `OrbitContextMenu` | Right-click menus on canvas |
| `OrbitToast` | Notification system |
| `OrbitResizable` | Drag-to-resize panels |

### Component Architecture
Every component:
1. Uses **Tailwind CSS** for styling (no CSS-in-JS).
2. Exposes `className` and `style` props for full override.
3. Uses **CSS variables** for theme tokens.
4. Is **headless-friendly**: Logic hooks (`useSidebar`, `useDialog`) separate from presentational components.

```tsx
// Example: OrbitButton
import { cn } from '@orbit/shared';
import { Slot } from '@radix-ui/react-slot';

export interface OrbitButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  asChild?: boolean;
}

export const OrbitButton = React.forwardRef<HTMLButtonElement, OrbitButtonProps>(
  ({ className, variant = 'primary', size = 'md', asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-md font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-50',
          'bg-[var(--orbit-button-primary-bg)] text-[var(--orbit-button-primary-text)]',
          variant === 'secondary' && 'bg-[var(--orbit-button-secondary-bg)]',
          size === 'sm' && 'h-8 px-3 text-xs',
          size === 'md' && 'h-10 px-4 text-sm',
          size === 'lg' && 'h-12 px-6 text-base',
          className // Developer override wins
        )}
        {...props}
      />
    );
  }
);
```

---

## 4. Theme Manager: `@orbit/ui/themes`

### Phase 1: Dark + Light Themes
```typescript
const darkTheme: OrbitTheme = {
  id: 'orbit-dark',
  name: 'Orbit Dark',
  variables: {
    '--orbit-canvas-bg': '#0f0f0f',
    '--orbit-sidebar-bg': '#1a1a1a',
    '--orbit-panel-bg': '#242424',
    '--orbit-border': '#333333',
    '--orbit-text-primary': '#e5e5e5',
    '--orbit-text-secondary': '#a0a0a0',
    '--orbit-accent': '#3b82f6',
    '--orbit-accent-hover': '#2563eb',
    '--orbit-danger': '#ef4444',
    '--orbit-success': '#22c55e',
  }
};

const lightTheme: OrbitTheme = {
  id: 'orbit-light',
  name: 'Orbit Light',
  variables: {
    '--orbit-canvas-bg': '#f8f9fa',
    '--orbit-sidebar-bg': '#ffffff',
    '--orbit-panel-bg': '#f1f3f5',
    '--orbit-border': '#dee2e6',
    '--orbit-text-primary': '#212529',
    '--orbit-text-secondary': '#6c757d',
    '--orbit-accent': '#3b82f6',
    '--orbit-accent-hover': '#2563eb',
    '--orbit-danger': '#dc2626',
    '--orbit-success': '#16a34a',
  }
};
```

### Runtime Switching with Smooth Transition
```tsx
editor.setTheme('orbit-light'); // Applies transition-all duration-300
```

### Tailwind Integration
```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        orbit: {
          canvas: 'var(--orbit-canvas-bg)',
          sidebar: 'var(--orbit-sidebar-bg)',
          panel: 'var(--orbit-panel-bg)',
          border: 'var(--orbit-border)',
          text: 'var(--orbit-text-primary)',
          'text-secondary': 'var(--orbit-text-secondary)',
          accent: 'var(--orbit-accent)',
        }
      }
    }
  }
};
```

### Phase 2 Extension
```tsx
editor.registerTheme({
  id: 'brand-pink',
  name: 'Brand Pink',
  variables: { '--orbit-accent': '#ec4899', ... }
});
```

---

## 5. Core Engine: `@orbit/core`

### Public API
```typescript
class OrbitEngine {
  constructor(container: HTMLElement, config: OrbitConfig);

  // Scene
  scene: SceneGraph;
  viewport: ViewportController;
  history: CommandHistory;

  // Layers
  addLayer(type: LayerType, props: LayerProps): string;
  removeLayer(id: string): void;
  selectLayer(id: string | string[]): void;
  transformLayer(id: string, matrix: Matrix): void;
  setLayerEffect(id: string, effect: Effect): void;

  // Tools
  setTool(tool: ToolType): void;
  configureTool(options: ToolOptions): void;

  // Export
  export(options: ExportOptions): Promise<Blob>;

  // Watermark
  setCanvasWatermark(options: WatermarkOptions | null): void;
  setExportWatermark(options: WatermarkOptions | null): void;

  // Theme
  setTheme(themeId: string): void;
  registerTheme(theme: OrbitTheme): void;

  // Events
  on(event: OrbitEvent, callback: Function): void;
}
```

### Scene Graph
```typescript
interface Layer {
  id: string;
  type: 'image' | 'text' | 'shape' | 'video' | 'group';
  name: string;
  x: number; y: number;
  width: number; height: number;
  rotation: number;
  scaleX: number; scaleY: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  blendMode: BlendMode;
  effects: Effect[];
  content: ImageContent | TextContent | ShapeContent | VideoContent;
}

interface SceneGraph {
  root: Layer[];
  background: BackgroundProps;
  width: number;
  height: number;
}
```

### Renderer Abstraction
```
packages/core/src/renderer/
├── Renderer.ts               # Abstract interface
├── FabricRenderer.ts         # Fabric.js v6 implementation
├── types/
│   └── scene.ts              # Renderer-agnostic types
└── shaders/
    ├── adjustments.frag      # Brightness, Contrast, Saturation, Color Temp
    └── lighting.frag         # 3D multi-light system
```

**If we replace Fabric with custom WebGL later, only `FabricRenderer.ts` changes. The public API (`OrbitEngine`) stays identical.**

---

## 6. White-Label Configuration

Developers control **every pixel** of the UI:

```typescript
interface OrbitConfig {
  // Core
  apiKey: string;
  backendUrl: string;

  // Theme
  theme: string | OrbitTheme;

  // UI Layout (hide/show/reorder anything)
  ui: {
    leftSidebar: {
      visible: boolean;
      items: SidebarItem[]; // Can inject custom React components
    };
    topToolbar: {
      visible: boolean;
      items: ToolbarItem[];
    };
    rightPanel: {
      visible: boolean;
      tabs: TabItem[];
      sections: string[];
    };
    bottomBar: {
      visible: boolean;
      zoomControls: boolean;
      addPageButton: boolean;
    };
  };

  // Features
  features: {
    agentic: boolean;
    draw: boolean;
    video: boolean;        // Phase 2
    collaboration: boolean; // Phase 2
  };

  // Asset Providers (developer brings own keys)
  providers: {
    photos?: AssetProvider;  // UnsplashProvider(apiKey)
    videos?: AssetProvider;  // PexelsProvider(apiKey)
    icons?: AssetProvider;
    stickers?: AssetProvider;
  };

  // Watermark (fully developer-controlled)
  watermark?: {
    canvas?: WatermarkOptions | null;
    export?: WatermarkOptions | null;
  };

  // Callbacks
  callbacks?: {
    onExport?: (blob: Blob, format: string) => void;
    onError?: (error: OrbitError) => void;
    onLayerSelect?: (layer: Layer | null) => void;
  };
}
```

---

## 7. Watermark System (Developer-Controlled)

**No link to our backend.** Full developer freedom.

```typescript
interface WatermarkOptions {
  type: 'text' | 'image';
  content: string; // text or image URL
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  opacity: number;
  fontSize?: number;
  color?: string;
  padding?: number;
}

// Developer configures at init
const editor = new OrbitEditor({
  watermark: {
    canvas: {
      type: 'text',
      content: 'Made with MyApp',
      position: 'bottom-right',
      opacity: 0.3,
      fontSize: 12,
      color: '#ffffff',
    },
    export: {
      type: 'image',
      content: '/my-logo.png',
      position: 'center',
      opacity: 0.5,
    }
  }
});

// Or control dynamically via callbacks
editor.configureExport({
  watermark: async (context) => {
    const hasPaid = await fetch('/api/check-subscription');
    return hasPaid ? null : { type: 'text', content: 'Free tier', ... };
  }
});
```

---

## 8. Asset Provider System

**Pluggable architecture.** Developer provides their own API keys.

```typescript
interface AssetProvider {
  id: string;
  search(query: string, options: SearchOptions): Promise<Asset[]>;
  getById(id: string): Promise<Asset>;
}

class UnsplashProvider implements AssetProvider {
  constructor(apiKey: string);
  search(query) {
    return fetch(`https://api.unsplash.com/search/photos?query=${query}`, {
      headers: { Authorization: `Client-ID ${this.apiKey}` }
    });
  }
}

class PexelsProvider implements AssetProvider {
  constructor(apiKey: string);
  search(query) {
    return fetch(`https://api.pexels.com/videos/search?query=${query}`, {
      headers: { Authorization: this.apiKey }
    });
  }
}
```

**Error Handling:**
- Invalid/missing key: Toast error "Invalid [Provider] API key"
- Rate limit: Toast error "Rate limit reached. Try again later."
- SDK does not retry or manage quotas.

---

## 9. AI Agentic: `@orbit/agentic`

### Security
- Client-side API key + domain verification via `Origin` header.
- No proxy required (developer's choice if they want one).

### Backend Architecture
```
┌─────────────┐     ┌──────────────────────────┐     ┌─────────────────┐
│   SDK       │────▶│   api.orbit.ai/v1/edit   │────▶│  OpenAI GPT-4o  │
│  (Browser)  │     │  • Validate API key      │     │     or          │
│             │◀────│  • Check domain allowlist│◀────│  Google Gemini  │
│             │     │  • Inject system prompts │     │                 │
└─────────────┘     │  • Route to model        │     └─────────────────┘
                    └──────────────────────────┘
```

### Backend Adapter
```typescript
interface AIBackendAdapter {
  generateImage(params: GenerateParams): Promise<GeneratedAsset>;
  inpaint(params: InpaintParams): Promise<GeneratedAsset>;
  outpaint(params: OutpaintParams): Promise<GeneratedAsset>;
  adjustLighting(params: LightingParams): Promise<GeneratedAsset>;
  generateVideo(params: VideoParams): Promise<GeneratedAsset>; // Phase 2
}

class OrbitBackendAdapter implements AIBackendAdapter {
  constructor(apiKey: string, backendUrl: string);

  async generateImage({ prompt, imageBase64, maskBase64, model }) {
    return fetch(`${this.backendUrl}/v1/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, image: imageBase64, mask: maskBase64, model }),
    });
  }
}
```

### Right Panel — Agentic Tab Features
| Feature | UI | Backend / Client |
|---------|----|-----------------|
| **AI Edit** | Textarea prompt, model selector, image ref | `POST /v1/edit` |
| **Change Region** | Brush mask on canvas + prompt | `POST /v1/inpaint` |
| **Annotate** | Draw annotations + prompt | `POST /v1/edit` |
| **Crop & Expand** | Aspect ratio presets + expand prompt | `POST /v1/outpaint` |
| **Image Adjustments** | Brightness/Contrast/Saturation/Color Temp sliders | WebGL shaders (client-side) |
| **Change Lighting** | 3D orb widget + multi-light controls | `POST /v1/lighting` |

---

## 10. Draw Tool: Raster → Vector

### Phase 1 (Raster)
- Separate overlay `<canvas>` for drawing.
- Brush + Highlighter tools.
- Config: stroke width, color, opacity.
- On mouseup: merge into Fabric.js image layer.

### Phase 2 (Vector)
- Convert raster paths to editable Fabric `Path` objects.
- Node editing (move handles, add/remove points).
- Pressure sensitivity for stylus.

---

## 11. Export System

| Format | Phase | Method |
|--------|-------|--------|
| PNG | 1 | Fabric `toDataURL('image/png')` |
| JPG | 1 | Fabric `toDataURL('image/jpeg')` |
| SVG | 1 | Fabric SVG serializer |
| PDF | 1 | `jspdf` + canvas rasterization |
| GIF | 2 | `gif.js` or backend FFmpeg |
| MP4 | 2 | Backend FFmpeg rendering |
| MP3 | 2 | Audio track extraction |

```typescript
interface ExportOptions {
  format: 'png' | 'jpg' | 'svg' | 'pdf' | 'gif' | 'mp4' | 'mp3';
  quality?: number;    // 0-1 for lossy formats
  scale?: number;      // 1x, 2x, 3x for PNG/JPG
  pages?: string[];    // Multi-page support
  trim?: { start: number; end: number }; // Video/audio only
  watermark?: WatermarkOptions | null;
}
```

---

## 12. React / Next.js Integration

### React
```tsx
import { OrbitEditor } from '@orbit/react';
import '@orbit/react/styles.css';

function App() {
  return (
    <OrbitEditor
      apiKey="orbit_sk_..."
      backendUrl="https://api.orbit.ai"
      theme="orbit-dark"
      config={uiConfig}
      watermark={watermarkConfig}
      providers={{
        photos: new UnsplashProvider(process.env.VITE_UNSPLASH_KEY),
        videos: new PexelsProvider(process.env.VITE_PEXELS_KEY),
      }}
      callbacks={{
        onExport: (blob) => download(blob),
        onError: (err) => toast.error(err.message),
      }}
    />
  );
}
```

### Next.js
```tsx
import dynamic from 'next/dynamic';

const OrbitEditor = dynamic(
  () => import('@orbit/next').then((mod) => mod.OrbitEditor),
  { ssr: false }
);

export default function Page() {
  return <OrbitEditor {...props} />;
}
```

---

## 13. Technology Stack

| Concern | Choice |
|---------|--------|
| Monorepo | Turborepo |
| Package Manager | pnpm |
| Language | TypeScript 5.4+ (strict) |
| Canvas Engine | Fabric.js v6 (wrapped) |
| WebGL Shaders | Custom GLSL |
| State (internal) | Zustand |
| Styling | Tailwind CSS v3.4 |
| CSS Variables | Design tokens for theming |
| Drag & Drop | `@dnd-kit/core` |
| Icons | `lucide-react` (overridable) |
| Build | Vite |
| Test | Vitest + React Testing Library + Playwright |
| Docs | VitePress |

---

## 14. Implementation Roadmap

### Phase 0: Foundation + UI Library (Weeks 1-3)
| Week | Deliverable |
|------|-------------|
| **1** | Monorepo (Turborepo + pnpm), Vite build pipeline, TypeScript strict, linting, npm publish setup |
| **2** | Tailwind CSS v3.4 setup, design tokens, CSS variables, `@orbit/shared` utilities (`cn()`, types, constants) |
| **3** | `@orbit/ui` base: component architecture, CLI scaffolding (`npx @orbit/ui add`), `OrbitButton`, `OrbitInput`, `OrbitTooltip`, `OrbitDialog`, `OrbitSidebar` skeleton, theme manager (dark/light + smooth transition) |

### Phase 1: Image SDK MVP (Weeks 4-11)
| Week | Deliverable |
|------|-------------|
| **4-5** | `@orbit/core`: Fabric.js engine, scene graph, history, zoom/pan, pointer/touch events, canvas watermark overlay |
| **6-7** | `@orbit/ui`: Complete Left Sidebar (all 12 categories), drag & drop, asset providers (Unsplash, Pexels) with developer keys, error handling |
| **8-9** | `@orbit/ui`: Manual tools UI (select, transform, text, shapes, raster draw, crop), Right Panel (Manually tab: Typography, Arrange) |
| **10-11** | `@orbit/agentic`: AI adapter, Agentic tab, Change Region, Crop & Expand, Image Adjustments (WebGL shaders), Change Lighting. Export (PNG/JPG/SVG/PDF) with watermark hooks |

### Phase 2: Video + Vector + Multi-User + Themes (Weeks 12-22)
| Week | Deliverable |
|------|-------------|
| **12-14** | Video engine, timeline UI, keyframe animation system |
| **15-17** | Audio tracks, transitions, video export (GIF/MP4), audio export (MP3) |
| **18-19** | Multi-user sync (WebSockets + Yjs CRDTs), cursor presence |
| **20-21** | Vector draw tool (Bézier curves, node editing), custom theme marketplace |
| **22** | Performance audit, SDK v2.0, documentation, final npm publishing |

---

## 15. File Structure (Final)

```
orbit/
├── apps/
│   ├── demo/                   # React demo app (demo.orbit.ai)
│   └── demo-next/              # Next.js demo app (demo-next.orbit.ai)
├── packages/
│   ├── core/                   # Vanilla TS canvas engine (@orbit/core)
│   ├── react/                  # React wrapper + hooks (@orbit/react)
│   ├── next/                   # Next.js SSR-safe wrapper (@orbit/next)
│   ├── ui/                     # Shadcn-style component registry (@orbit/ui)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   └── themes/
│   │   └── cli/                # npx @orbit/ui add <component>
│   ├── agentic/                # AI client + prompt builders (@orbit/agentic)
│   ├── effects/                # WebGL shaders (@orbit/effects)
│   ├── assets/                 # Asset providers + IndexedDB cache (@orbit/assets)
│   └── shared/                 # Types, utilities, constants (@orbit/shared)
├── package.json
├── turbo.json
├── tailwind.config.js          # Shared Tailwind preset
└── LICENSE
```

---

## 16. Security & License Model

| Concern | Implementation |
|---------|---------------|
| API Key | `orbit_sk_...`, client-side, validated via `Origin` header + domain allowlist |
| Rate Limiting | Per-key, enforced by `api.orbit.ai` |
| Subscription | **$200/month only** — no free tier. Unauthorized keys rejected at init |
| Watermark | Fully controlled by developer (canvas overlay + export bake) |
| AI Backend | Our backend proxies to OpenAI GPT-4o / Google Gemini with injected system prompts |

---

## 17. Demos

| App | URL | Stack |
|-----|-----|-------|
| React Demo | `demo.orbit.ai` | React + Vite |
| Next.js Demo | `demo-next.orbit.ai` | Next.js + Vercel |

---

*Plan Version: v4.0 (Final)*  
*Date: 2026-04-22*  
*Status: Implementation In Progress*
