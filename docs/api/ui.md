# UI Components

The `@orbit/ui` package provides themeable, white-label UI components used by `@orbit/react`.

## Theme System

### CSS Variables

```css
:root {
  --orbit-primary: #3b82f6;
  --orbit-primary-hover: #2563eb;
  --orbit-bg: #ffffff;
  --orbit-bg-secondary: #f9fafb;
  --orbit-text: #1f2937;
  --orbit-text-secondary: #6b7280;
  --orbit-border: #e5e7eb;
  --orbit-border-hover: #d1d5db;
  --orbit-shadow: 0 1px 3px rgba(0,0,0,0.1);
  --orbit-radius: 6px;
  --orbit-sidebar-width: 280px;
  --orbit-toolbar-height: 48px;
  --orbit-font-family: 'Inter', system-ui, sans-serif;
}
```

### `registerTheme`

```ts
import { registerTheme } from '@orbit/ui';

registerTheme('dark', {
  primary: '#60a5fa',
  bg: '#111827',
  text: '#f9fafb',
  border: '#374151',
});
```

## Components

### `Button`

```tsx
import { Button } from '@orbit/ui';

<Button variant="primary" size="sm" onClick={handleClick}>
  Click Me
</Button>
```

Variants: `primary` | `secondary` | `ghost` | `danger`
Sizes: `xs` | `sm` | `md` | `lg`

### `Input`

```tsx
<Input
  type="text"
  value={value}
  onChange={(e) => setValue(e.target.value)}
  placeholder="Enter text..."
/>
```

### `Slider`

```tsx
<Slider
  min={0}
  max={100}
  value={50}
  onChange={(v) => setValue(v)}
/>
```

### `ColorPicker`

```tsx
<ColorPicker
  color="#3b82f6"
  onChange={(color) => setColor(color)}
/>
```

### `Dropdown`

```tsx
<Dropdown
  options={[
    { value: 'png', label: 'PNG' },
    { value: 'jpg', label: 'JPG' },
  ]}
  value={format}
  onChange={(v) => setFormat(v)}
/>
```

### `Modal`

```tsx
<Modal open={isOpen} onClose={() => setIsOpen(false)} title="Export">
  <p>Export your design</p>
</Modal>
```

### `Toast`

```tsx
import { showToast } from '@orbit/ui';

showToast({ message: 'Exported successfully', type: 'success' });
showToast({ message: 'Export failed', type: 'error' });
```

### `Tooltip`

```tsx
<Tooltip content="Save design (Ctrl+S)">
  <Button>Save</Button>
</Tooltip>
```

### `ContextMenu`

```tsx
<ContextMenu
  items={[
    { label: 'Copy', shortcut: 'Ctrl+C', onClick: handleCopy },
    { label: 'Paste', shortcut: 'Ctrl+V', onClick: handlePaste },
  ]}
>
  <div>Right-click me</div>
</ContextMenu>
```

## Icons

All icons are inline SVGs. No external icon library dependency.

```tsx
import { IconExport, IconUndo, IconRedo } from '@orbit/ui';

<IconExport size={20} />
```

## Layout Components

### `Panel`

```tsx
<Panel title="Layers" collapsible>
  <LayerList />
</Panel>
```

### `SplitPane`

```tsx
<SplitPane direction="horizontal" defaultSplit={0.3}>
  <Sidebar />
  <Canvas />
</SplitPane>
```

### `Resizable`

```tsx
<Resizable direction="vertical" minHeight={200}>
  <Timeline />
</Resizable>
```
