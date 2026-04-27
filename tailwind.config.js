/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class', '[data-theme="orbit-dark"]'],
  content: [
    './packages/ui/src/**/*.{ts,tsx}',
    './packages/react/src/**/*.{ts,tsx}',
    './apps/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        orbit: {
          // Canvas & Backgrounds
          workspace: 'var(--orbit-workspace-bg)',
          canvas: 'var(--orbit-canvas-bg)',
          'canvas-dot': 'var(--orbit-canvas-dot)',
          sidebar: 'var(--orbit-sidebar-bg)',
          'sidebar-rail': 'var(--orbit-sidebar-rail-bg)',
          panel: 'var(--orbit-panel-bg)',
          'panel-hover': 'var(--orbit-panel-hover-bg)',
          'panel-active': 'var(--orbit-panel-active-bg)',
          
          // Borders & Dividers
          border: 'var(--orbit-border)',
          'border-hover': 'var(--orbit-border-hover)',
          divider: 'var(--orbit-divider)',
          
          // Text
          text: 'var(--orbit-text-primary)',
          'text-secondary': 'var(--orbit-text-secondary)',
          'text-tertiary': 'var(--orbit-text-tertiary)',
          'text-inverse': 'var(--orbit-text-inverse)',
          
          // Accent (Primary Action)
          accent: 'var(--orbit-accent)',
          'accent-hover': 'var(--orbit-accent-hover)',
          'accent-muted': 'var(--orbit-accent-muted)',
          'accent-subtle': 'var(--orbit-accent-subtle)',
          
          // Status Colors
          danger: 'var(--orbit-danger)',
          'danger-hover': 'var(--orbit-danger-hover)',
          'danger-muted': 'var(--orbit-danger-muted)',
          success: 'var(--orbit-success)',
          'success-hover': 'var(--orbit-success-hover)',
          'success-muted': 'var(--orbit-success-muted)',
          warning: 'var(--orbit-warning)',
          'warning-hover': 'var(--orbit-warning-hover)',
          'warning-muted': 'var(--orbit-warning-muted)',
          info: 'var(--orbit-info)',
          'info-hover': 'var(--orbit-info-hover)',
          'info-muted': 'var(--orbit-info-muted)',
          
          // Interactive States
          hover: 'var(--orbit-hover-bg)',
          'hover-elevated': 'var(--orbit-hover-elevated-bg)',
          active: 'var(--orbit-active-bg)',
          selected: 'var(--orbit-selected-bg)',
          focus: 'var(--orbit-focus-ring)',
          disabled: 'var(--orbit-disabled-bg)',
          
          // Tool-specific
          tool: 'var(--orbit-tool-bg)',
          'tool-active': 'var(--orbit-tool-active-bg)',
          'tool-hover': 'var(--orbit-tool-hover-bg)',
        }
      },
      spacing: {
        'orbit-xs': 'var(--orbit-space-xs)',
        'orbit-sm': 'var(--orbit-space-sm)',
        'orbit-md': 'var(--orbit-space-md)',
        'orbit-lg': 'var(--orbit-space-lg)',
        'orbit-xl': 'var(--orbit-space-xl)',
        'orbit-2xl': 'var(--orbit-space-2xl)',
      },
      fontFamily: {
        orbit: ['var(--orbit-font-ui)', 'Inter', 'system-ui', 'sans-serif'],
        'orbit-mono': ['var(--orbit-font-mono)', 'JetBrains Mono', 'monospace'],
      },
      fontSize: {
        'orbit-xs': ['var(--orbit-font-size-xs)', { lineHeight: 'var(--orbit-line-height-xs)' }],
        'orbit-sm': ['var(--orbit-font-size-sm)', { lineHeight: 'var(--orbit-line-height-sm)' }],
        'orbit-md': ['var(--orbit-font-size-md)', { lineHeight: 'var(--orbit-line-height-md)' }],
        'orbit-lg': ['var(--orbit-font-size-lg)', { lineHeight: 'var(--orbit-line-height-lg)' }],
        'orbit-xl': ['var(--orbit-font-size-xl)', { lineHeight: 'var(--orbit-line-height-xl)' }],
      },
      borderRadius: {
        'orbit-none': '0',
        'orbit-sm': 'var(--orbit-radius-sm)',
        'orbit-md': 'var(--orbit-radius-md)',
        'orbit-lg': 'var(--orbit-radius-lg)',
        'orbit-xl': 'var(--orbit-radius-xl)',
        'orbit-full': '9999px',
      },
      boxShadow: {
        'orbit-sm': 'var(--orbit-shadow-sm)',
        'orbit-md': 'var(--orbit-shadow-md)',
        'orbit-lg': 'var(--orbit-shadow-lg)',
        'orbit-xl': 'var(--orbit-shadow-xl)',
        'orbit-inner': 'var(--orbit-shadow-inner)',
        'orbit-focus': 'var(--orbit-shadow-focus)',
      },
      transitionDuration: {
        'orbit-fast': 'var(--orbit-duration-fast)',
        'orbit-normal': 'var(--orbit-duration-normal)',
        'orbit-slow': 'var(--orbit-duration-slow)',
      },
      transitionTimingFunction: {
        'orbit-default': 'var(--orbit-ease-default)',
        'orbit-in': 'var(--orbit-ease-in)',
        'orbit-out': 'var(--orbit-ease-out)',
        'orbit-in-out': 'var(--orbit-ease-in-out)',
      },
      zIndex: {
        'orbit-canvas': 'var(--orbit-z-canvas)',
        'orbit-layer': 'var(--orbit-z-layer)',
        'orbit-ui': 'var(--orbit-z-ui)',
        'orbit-overlay': 'var(--orbit-z-overlay)',
        'orbit-modal': 'var(--orbit-z-modal)',
        'orbit-tooltip': 'var(--orbit-z-tooltip)',
      },
      width: {
        'orbit-sidebar': 'var(--orbit-sidebar-width)',
        'orbit-sidebar-rail': 'var(--orbit-sidebar-rail-width)',
        'orbit-panel': 'var(--orbit-panel-width)',
        'orbit-toolbar': 'var(--orbit-toolbar-height)',
        'orbit-zoombar': 'var(--orbit-zoombar-height)',
      },
      height: {
        'orbit-toolbar': 'var(--orbit-toolbar-height)',
        'orbit-zoombar': 'var(--orbit-zoombar-height)',
        'orbit-sidebar-rail': 'var(--orbit-sidebar-rail-width)',
      },
      animation: {
        'orbit-spin': 'orbit-spin var(--orbit-duration-slow) linear infinite',
        'orbit-pulse': 'orbit-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'orbit-fade-in': 'orbit-fade-in var(--orbit-duration-normal) var(--orbit-ease-out)',
        'orbit-slide-in': 'orbit-slide-in var(--orbit-duration-normal) var(--orbit-ease-out)',
      },
      keyframes: {
        'orbit-spin': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'orbit-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'orbit-fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'orbit-slide-in': {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
