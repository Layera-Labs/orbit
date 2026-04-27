import { type OrbitTheme } from '@orbit/shared';

export const lightTheme: OrbitTheme = {
  id: 'orbit-light',
  name: 'Orbit Light',
  variables: {
    // Canvas & Backgrounds
    '--orbit-workspace-bg': '#e8e8ed',
    '--orbit-canvas-bg': '#ffffff',
    '--orbit-canvas-dot': '#d1d1d6',
    '--orbit-sidebar-bg': '#ffffff',
    '--orbit-sidebar-rail-bg': '#ffffff',
    '--orbit-panel-bg': '#ffffff',
    '--orbit-panel-hover-bg': '#f5f5f7',
    '--orbit-panel-active-bg': '#f0f0f0',

    // Borders
    '--orbit-border': '#e5e5ea',
    '--orbit-border-hover': '#d1d1d6',
    '--orbit-divider': '#f0f0f0',

    // Text
    '--orbit-text-primary': '#1d1d1f',
    '--orbit-text-secondary': '#86868b',
    '--orbit-text-tertiary': '#aeaeb2',
    '--orbit-text-inverse': '#ffffff',

    // Accent
    '--orbit-accent': '#3b82f6',
    '--orbit-accent-hover': '#2563eb',
    '--orbit-accent-muted': 'rgba(59, 130, 246, 0.1)',
    '--orbit-accent-subtle': 'rgba(59, 130, 246, 0.05)',

    // Status
    '--orbit-danger': '#dc2626',
    '--orbit-danger-hover': '#b91c1c',
    '--orbit-danger-muted': 'rgba(220, 38, 38, 0.1)',
    '--orbit-success': '#16a34a',
    '--orbit-success-hover': '#15803d',
    '--orbit-success-muted': 'rgba(22, 163, 74, 0.1)',
    '--orbit-warning': '#d97706',
    '--orbit-warning-hover': '#b45309',
    '--orbit-warning-muted': 'rgba(217, 119, 6, 0.1)',
    '--orbit-info': '#0891b2',
    '--orbit-info-hover': '#0e7490',
    '--orbit-info-muted': 'rgba(8, 145, 178, 0.1)',

    // Interactive
    '--orbit-hover-bg': 'rgba(0, 0, 0, 0.04)',
    '--orbit-hover-elevated-bg': 'rgba(0, 0, 0, 0.08)',
    '--orbit-active-bg': 'rgba(0, 0, 0, 0.12)',
    '--orbit-selected-bg': 'rgba(59, 130, 246, 0.1)',
    '--orbit-focus-ring': 'rgba(59, 130, 246, 0.4)',
    '--orbit-disabled-bg': 'rgba(0, 0, 0, 0.04)',

    // Tools
    '--orbit-tool-bg': '#f8f9fa',
    '--orbit-tool-active-bg': '#e9ecef',
    '--orbit-tool-hover-bg': '#f1f3f5',

    // Spacing (same as dark)
    '--orbit-space-xs': '4px',
    '--orbit-space-sm': '8px',
    '--orbit-space-md': '12px',
    '--orbit-space-lg': '16px',
    '--orbit-space-xl': '24px',
    '--orbit-space-2xl': '32px',

    // Typography (same as dark)
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

    // Radius (same as dark)
    '--orbit-radius-sm': '4px',
    '--orbit-radius-md': '8px',
    '--orbit-radius-lg': '12px',
    '--orbit-radius-xl': '16px',

    // Shadows (adjusted for light)
    '--orbit-shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.05)',
    '--orbit-shadow-md': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
    '--orbit-shadow-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.05)',
    '--orbit-shadow-xl': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
    '--orbit-shadow-inner': 'inset 0 2px 4px rgba(0, 0, 0, 0.05)',
    '--orbit-shadow-focus': '0 0 0 2px var(--orbit-focus-ring)',

    // Transitions (same as dark)
    '--orbit-duration-fast': '100ms',
    '--orbit-duration-normal': '200ms',
    '--orbit-duration-slow': '300ms',
    '--orbit-ease-default': 'cubic-bezier(0.4, 0, 0.2, 1)',
    '--orbit-ease-in': 'cubic-bezier(0.4, 0, 1, 1)',
    '--orbit-ease-out': 'cubic-bezier(0, 0, 0.2, 1)',
    '--orbit-ease-in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',

    // Z-Index (same as dark)
    '--orbit-z-canvas': '0',
    '--orbit-z-layer': '10',
    '--orbit-z-ui': '100',
    '--orbit-z-overlay': '200',
    '--orbit-z-modal': '300',
    '--orbit-z-tooltip': '400',

    // Layout (same as dark)
    '--orbit-sidebar-width': '320px',
    '--orbit-sidebar-rail-width': '64px',
    '--orbit-panel-width': '320px',
    '--orbit-toolbar-height': '48px',
    '--orbit-zoombar-height': '40px',
  },
};
