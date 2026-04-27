import { type OrbitTheme } from '@orbit/shared';

export const darkTheme: OrbitTheme = {
  id: 'orbit-dark',
  name: 'Orbit Dark',
  variables: {
    // Canvas & Backgrounds
    '--orbit-workspace-bg': '#1e1e1e',
    '--orbit-canvas-bg': '#2a2a2a',
    '--orbit-canvas-dot': '#2a2a2a',
    '--orbit-sidebar-bg': '#1a1a1a',
    '--orbit-sidebar-rail-bg': '#141414',
    '--orbit-panel-bg': '#242424',
    '--orbit-panel-hover-bg': '#2e2e2e',
    '--orbit-panel-active-bg': '#333333',

    // Borders
    '--orbit-border': '#333333',
    '--orbit-border-hover': '#444444',
    '--orbit-divider': '#2a2a2a',

    // Text
    '--orbit-text-primary': '#e5e5e5',
    '--orbit-text-secondary': '#a0a0a0',
    '--orbit-text-tertiary': '#6b6b6b',
    '--orbit-text-inverse': '#0f0f0f',

    // Accent
    '--orbit-accent': '#3b82f6',
    '--orbit-accent-hover': '#2563eb',
    '--orbit-accent-muted': 'rgba(59, 130, 246, 0.15)',
    '--orbit-accent-subtle': 'rgba(59, 130, 246, 0.08)',

    // Status
    '--orbit-danger': '#ef4444',
    '--orbit-danger-hover': '#dc2626',
    '--orbit-danger-muted': 'rgba(239, 68, 68, 0.15)',
    '--orbit-success': '#22c55e',
    '--orbit-success-hover': '#16a34a',
    '--orbit-success-muted': 'rgba(34, 197, 94, 0.15)',
    '--orbit-warning': '#f59e0b',
    '--orbit-warning-hover': '#d97706',
    '--orbit-warning-muted': 'rgba(245, 158, 11, 0.15)',
    '--orbit-info': '#06b6d4',
    '--orbit-info-hover': '#0891b2',
    '--orbit-info-muted': 'rgba(6, 182, 212, 0.15)',

    // Interactive
    '--orbit-hover-bg': 'rgba(255, 255, 255, 0.06)',
    '--orbit-hover-elevated-bg': 'rgba(255, 255, 255, 0.1)',
    '--orbit-active-bg': 'rgba(255, 255, 255, 0.12)',
    '--orbit-selected-bg': 'rgba(59, 130, 246, 0.15)',
    '--orbit-focus-ring': 'rgba(59, 130, 246, 0.5)',
    '--orbit-disabled-bg': 'rgba(255, 255, 255, 0.04)',

    // Tools
    '--orbit-tool-bg': '#1a1a1a',
    '--orbit-tool-active-bg': '#333333',
    '--orbit-tool-hover-bg': '#2a2a2a',

    // Spacing
    '--orbit-space-xs': '4px',
    '--orbit-space-sm': '8px',
    '--orbit-space-md': '12px',
    '--orbit-space-lg': '16px',
    '--orbit-space-xl': '24px',
    '--orbit-space-2xl': '32px',

    // Typography
    '--orbit-font-ui': 'Inter',
    '--orbit-font-mono': 'JetBrains Mono',
    '--orbit-font-size-xs': '11px',
    '--orbit-font-size-sm': '13px',
    '--orbit-font-size-md': '14px',
    '--orbit-font-size-lg': '16px',
    '--orbit-font-size-xl': '20px',
    '--orbit-line-height-xs': '14px',
    '--orbit-line-height-sm': '16px',
    '--orbit-line-height-md': '20px',
    '--orbit-line-height-lg': '24px',
    '--orbit-line-height-xl': '28px',

    // Radius
    '--orbit-radius-sm': '4px',
    '--orbit-radius-md': '8px',
    '--orbit-radius-lg': '12px',
    '--orbit-radius-xl': '16px',

    // Shadows
    '--orbit-shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.3)',
    '--orbit-shadow-md': '0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.2)',
    '--orbit-shadow-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.3)',
    '--orbit-shadow-xl': '0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.4)',
    '--orbit-shadow-inner': 'inset 0 2px 4px rgba(0, 0, 0, 0.3)',
    '--orbit-shadow-focus': '0 0 0 2px var(--orbit-focus-ring)',

    // Transitions
    '--orbit-duration-fast': '100ms',
    '--orbit-duration-normal': '200ms',
    '--orbit-duration-slow': '300ms',
    '--orbit-ease-default': 'cubic-bezier(0.4, 0, 0.2, 1)',
    '--orbit-ease-in': 'cubic-bezier(0.4, 0, 1, 1)',
    '--orbit-ease-out': 'cubic-bezier(0, 0, 0.2, 1)',
    '--orbit-ease-in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',

    // Z-Index
    '--orbit-z-canvas': '0',
    '--orbit-z-layer': '10',
    '--orbit-z-ui': '100',
    '--orbit-z-overlay': '200',
    '--orbit-z-modal': '300',
    '--orbit-z-tooltip': '400',

    // Layout
    '--orbit-sidebar-width': '320px',
    '--orbit-sidebar-rail-width': '64px',
    '--orbit-panel-width': '320px',
    '--orbit-toolbar-height': '48px',
    '--orbit-zoombar-height': '40px',
  },
};
