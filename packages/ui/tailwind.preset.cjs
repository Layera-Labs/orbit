/**
 * Tailwind preset for `@layera-labs/orbit-ui`.
 *
 * Every component in this package styles itself with class names like
 * `bg-orbit-accent`, `text-orbit-text`, `rounded-orbit-md` and
 * `duration-orbit-normal`. Those are not Tailwind defaults — they are this
 * design system's names, and without a theme extension that declares them
 * Tailwind emits no rules at all for them. The package shipped for a while with
 * the components and the `--orbit-*` custom properties (see `./themes`) but
 * nothing joining the two, so installing it got you correct markup with no
 * colour, no radius and no spacing, and no documented way to fix it.
 *
 * This file is that join, and it is the same object the Orbit repository's own
 * root `tailwind.config.js` builds on, so what a consumer gets is what the
 * components were developed against rather than a second copy that can drift.
 *
 *   // tailwind.config.js
 *   module.exports = {
 *     presets: [require('@layera-labs/orbit-ui/tailwind.preset')],
 *     content: [
 *       './src/**\/*.{ts,tsx}',
 *       './node_modules/@layera-labs/orbit-ui/dist/**\/*.js',
 *     ],
 *   };
 *
 * The `content` entry for `dist` matters: Tailwind generates utilities only for
 * class names it can SEE as literal text, and after this package is built its
 * class names live in `dist/index.js`. A consumer scanning only their own source
 * gets the preset's names defined and none of them emitted.
 *
 * Values are `var(--orbit-*)` references, not literals, which is what lets the
 * runtime theme switch (`themeManager.setTheme('orbit-light')`) recolour already
 * rendered components. Two consequences worth knowing: the custom properties
 * must be set on some ancestor — apply a theme, or paste its `variables` into
 * your own `:root` — or the utilities resolve to nothing; and Tailwind's slash
 * opacity syntax (`bg-orbit-accent/50`) cannot work on a var that holds a whole
 * colour rather than channels. The components never use it.
 *
 * CommonJS on purpose. This package is `"type": "module"`, so a plain `.js`
 * preset here would be ESM and unrequirable from the `tailwind.config.js` most
 * projects still have; `.cjs` is loadable from both a CJS `require` and an ESM
 * `import`, which a Tailwind config in either style needs.
 *
 * The names below are NOT a mechanical `orbit-x` -> `--orbit-x` transform, and
 * assuming they were is how this gets subtly wrong: `text-orbit-text` reads
 * `--orbit-text-primary`, `bg-orbit-panel` reads `--orbit-panel-bg`, and
 * `bg-orbit-hover` reads `--orbit-hover-bg`. `src/__tests__/tailwind-preset.test.ts`
 * checks this file against the class names the components actually emit and
 * against the custom properties the themes actually define.
 */

/** @type {Omit<import('tailwindcss').Config, 'content'>} */
module.exports = {
  theme: {
    extend: {
      colors: {
        orbit: {
          // Canvas & backgrounds
          workspace: 'var(--orbit-workspace-bg)',
          'workspace-bg': 'var(--orbit-workspace-bg)',
          canvas: 'var(--orbit-canvas-bg)',
          'canvas-bg': 'var(--orbit-canvas-bg)',
          'canvas-dot': 'var(--orbit-canvas-dot)',
          sidebar: 'var(--orbit-sidebar-bg)',
          'sidebar-rail': 'var(--orbit-sidebar-rail-bg)',
          panel: 'var(--orbit-panel-bg)',
          'panel-hover': 'var(--orbit-panel-hover-bg)',
          'panel-active': 'var(--orbit-panel-active-bg)',

          // Borders & dividers
          border: 'var(--orbit-border)',
          'border-hover': 'var(--orbit-border-hover)',
          divider: 'var(--orbit-divider)',

          // Text
          text: 'var(--orbit-text-primary)',
          'text-secondary': 'var(--orbit-text-secondary)',
          'text-tertiary': 'var(--orbit-text-tertiary)',
          'text-inverse': 'var(--orbit-text-inverse)',

          // Accent (primary action)
          accent: 'var(--orbit-accent)',
          'accent-hover': 'var(--orbit-accent-hover)',
          'accent-muted': 'var(--orbit-accent-muted)',
          'accent-subtle': 'var(--orbit-accent-subtle)',

          // Status
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

          // Interactive states
          hover: 'var(--orbit-hover-bg)',
          'hover-elevated': 'var(--orbit-hover-elevated-bg)',
          active: 'var(--orbit-active-bg)',
          selected: 'var(--orbit-selected-bg)',
          focus: 'var(--orbit-focus-ring)',
          disabled: 'var(--orbit-disabled-bg)',

          // Tool surfaces
          tool: 'var(--orbit-tool-bg)',
          'tool-active': 'var(--orbit-tool-active-bg)',
          'tool-hover': 'var(--orbit-tool-hover-bg)',
        },
      },
      // Feeds p-/px-/py-/m-/gap-/space-/inset utilities alike, which is why
      // `top-orbit-lg` and `px-orbit-lg` both resolve from these six.
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
