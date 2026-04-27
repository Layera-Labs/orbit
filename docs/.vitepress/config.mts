import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Orbit SDK',
  description: 'Orbit Agentic Canvas Editor SDK — Documentation',
  base: '/',
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/api/core' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Configuration', link: '/guide/configuration' },
            { text: 'Architecture', link: '/guide/architecture' },
          ],
        },
        {
          text: 'Features',
          items: [
            { text: 'Layers', link: '/guide/layers' },
            { text: 'Video', link: '/guide/video' },
            { text: 'Audio', link: '/guide/audio' },
            { text: 'Transitions', link: '/guide/transitions' },
            { text: 'AI Tools', link: '/guide/ai-tools' },
            { text: 'Export', link: '/guide/export' },
            { text: 'Collaboration', link: '/guide/collaboration' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Core Engine', link: '/api/core' },
            { text: 'React Wrapper', link: '/api/react' },
            { text: 'Agentic', link: '/api/agentic' },
            { text: 'Shared Types', link: '/api/shared' },
            { text: 'UI Components', link: '/api/ui' },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/orbit-ai/orbit' },
    ],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Orbit AI',
    },
  },
});
