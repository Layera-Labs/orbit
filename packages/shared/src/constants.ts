/**
 * Orbit SDK Constants
 */

// `ORBIT_VERSION` used to live here as a hand-typed string. It is now generated
// from package.json into ./version.ts at build time, and re-exported from the
// package root, so it cannot say something the manifest does not.

// Canvas defaults
export const DEFAULT_CANVAS_WIDTH = 1080;
export const DEFAULT_CANVAS_HEIGHT = 1080;

// Zoom limits
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 5;
export const DEFAULT_ZOOM = 1;

// `ORBIT_BACKEND_URL` used to live here, defaulting to `https://api.orbit.ai` —
// a host nobody operates. Nothing in the SDK read it, so its only effect was to
// tell a reader that a hosted backend exists and that this is its address. A
// default aimed at a dead host is worse than no default: it turns "you have not
// configured a backend" into a DNS or connection error thrown from inside a
// fetch, at request time, with the real cause nowhere in the message. There is
// no Layera-operated backend; the URL of yours is a required argument to
// `OrbitBackendAdapter`, and it fails loudly at construction if it is missing.

// Asset APIs
export const UNSPLASH_API_URL = 'https://api.unsplash.com';
export const PEXELS_API_URL = 'https://api.pexels.com';

// Social media presets
export const SOCIAL_PRESETS = {
  instagram: { width: 1080, height: 1080, label: 'Instagram Post', category: 'social' },
  'instagram-story': { width: 1080, height: 1920, label: 'Instagram Story', category: 'social' },
  'instagram-reel': { width: 1080, height: 1920, label: 'Instagram Reel', category: 'social' },
  twitter: { width: 1200, height: 675, label: 'Twitter/X Post', category: 'social' },
  'twitter-header': { width: 1500, height: 500, label: 'Twitter/X Header', category: 'social' },
  facebook: { width: 1200, height: 630, label: 'Facebook Post', category: 'social' },
  'facebook-cover': { width: 820, height: 312, label: 'Facebook Cover', category: 'social' },
  linkedin: { width: 1208, height: 640, label: 'LinkedIn Post', category: 'social' },
  'linkedin-banner': { width: 1584, height: 396, label: 'LinkedIn Banner', category: 'social' },
  youtube: { width: 1280, height: 720, label: 'YouTube Thumbnail', category: 'social' },
  'youtube-banner': { width: 2560, height: 1440, label: 'YouTube Banner', category: 'social' },
  pinterest: { width: 1000, height: 1500, label: 'Pinterest Pin', category: 'social' },
  tiktok: { width: 1080, height: 1920, label: 'TikTok Video', category: 'social' },
  twitch: { width: 1200, height: 480, label: 'Twitch Banner', category: 'social' },
  a4: { width: 2480, height: 3508, label: 'A4 Paper', category: 'print' },
  'us-letter': { width: 2550, height: 3300, label: 'US Letter', category: 'print' },
  'business-card': { width: 1050, height: 600, label: 'Business Card', category: 'print' },
  'presentation': { width: 1920, height: 1080, label: 'Presentation', category: 'screen' },
  custom: { width: 0, height: 0, label: 'Custom', category: 'custom' },
} as const;

// Aspect ratios for crop & expand
export const ASPECT_RATIOS = [
  { label: '1:1', value: 1 },
  { label: '4:5', value: 4 / 5 },
  { label: '9:16', value: 9 / 16 },
  { label: '16:9', value: 16 / 9 },
  { label: '3:4', value: 3 / 4 },
  { label: '4:3', value: 4 / 3 },
  { label: '2:3', value: 2 / 3 },
  { label: '3:2', value: 3 / 2 },
  { label: '5:4', value: 5 / 4 },
  { label: '2.35:1', value: 2.35 },
  { label: '21:9', value: 21 / 9 },
];

// Keyboard shortcuts
export const KEYBOARD_SHORTCUTS = {
  // History
  undo: { key: 'z', modifiers: ['ctrl', 'meta'], description: 'Undo' },
  redo: { key: 'y', modifiers: ['ctrl', 'meta'], description: 'Redo' },
  'redo-mac': { key: 'z', modifiers: ['shift', 'ctrl', 'meta'], description: 'Redo (Mac)' },
  
  // Selection
  selectAll: { key: 'a', modifiers: ['ctrl', 'meta'], description: 'Select all' },
  deselect: { key: 'Escape', modifiers: [], description: 'Deselect' },
  delete: { key: 'Delete', modifiers: [], description: 'Delete selected' },
  'delete-backspace': { key: 'Backspace', modifiers: [], description: 'Delete selected (alt)' },
  
  // Transform
  duplicate: { key: 'd', modifiers: ['ctrl', 'meta'], description: 'Duplicate' },
  group: { key: 'g', modifiers: ['ctrl', 'meta'], description: 'Group' },
  ungroup: { key: 'g', modifiers: ['shift', 'ctrl', 'meta'], description: 'Ungroup' },
  
  // Layers
  bringForward: { key: ']', modifiers: ['ctrl', 'meta'], description: 'Bring forward' },
  bringToFront: { key: ']', modifiers: ['shift', 'ctrl', 'meta'], description: 'Bring to front' },
  sendBackward: { key: '[', modifiers: ['ctrl', 'meta'], description: 'Send backward' },
  sendToBack: { key: '[', modifiers: ['shift', 'ctrl', 'meta'], description: 'Send to back' },
  
  // View
  zoomIn: { key: '+', modifiers: ['ctrl', 'meta'], description: 'Zoom in' },
  zoomOut: { key: '-', modifiers: ['ctrl', 'meta'], description: 'Zoom out' },
  zoomFit: { key: '0', modifiers: ['ctrl', 'meta'], description: 'Fit to screen' },
  zoom100: { key: '1', modifiers: ['ctrl', 'meta'], description: '100% zoom' },
  
  // Tools
  toolSelect: { key: 'v', modifiers: [], description: 'Select tool' },
  toolText: { key: 't', modifiers: [], description: 'Text tool' },
  toolShape: { key: 'r', modifiers: [], description: 'Rectangle tool' },
  toolBrush: { key: 'b', modifiers: [], description: 'Brush tool' },
  toolCrop: { key: 'c', modifiers: [], description: 'Crop tool' },
  
  // Export
  export: { key: 'e', modifiers: ['ctrl', 'meta'], description: 'Export' },
  
  // UI
  toggleSidebar: { key: 's', modifiers: ['ctrl', 'meta'], description: 'Toggle sidebar' },
  togglePanel: { key: 'p', modifiers: ['ctrl', 'meta'], description: 'Toggle panel' },
  toggleTheme: { key: 'l', modifiers: ['ctrl', 'meta'], description: 'Toggle theme' },
} as const;

// The paths `OrbitBackendAdapter` posts to, relative to whatever backend URL you
// hand it. These are ROUTE SHAPES, not addresses — there is no host in them and
// they name nothing hosted, so unlike the removed `ORBIT_BACKEND_URL` they stay:
// they are what you implement if you are writing the service yourself.
export const API_ENDPOINTS = {
  edit: '/v1/edit',
  generate: '/v1/generate',
  inpaint: '/v1/inpaint',
  outpaint: '/v1/outpaint',
  lighting: '/v1/lighting',
  video: '/v1/video',
} as const;

// AI Models available
export const AI_MODELS = [
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', supports: ['image', 'edit'] },
  { id: 'gemini-pro', name: 'Gemini Pro', provider: 'google', supports: ['image', 'edit'] },
  { id: 'flux-2-klein', name: 'Flux 2 Klein', provider: 'flux', supports: ['image', 'inpaint'] },
  { id: 'flux-inpaint', name: 'Flux Inpaint', provider: 'flux', supports: ['inpaint', 'outpaint'] },
] as const;

// Feature flags defaults
export const DEFAULT_FEATURE_FLAGS = {
  agentic: true,
  draw: true,
  video: false,
  collaboration: false,
  history: true,
  layers: true,
  export: true,
  import: true,
  templates: true,
} as const;

// Tool configurations
export const TOOL_CONFIG = {
  brush: {
    minStrokeWidth: 1,
    maxStrokeWidth: 100,
    defaultStrokeWidth: 5,
    defaultColor: '#3b82f6',
    defaultOpacity: 1,
  },
  highlighter: {
    minStrokeWidth: 5,
    maxStrokeWidth: 100,
    defaultStrokeWidth: 20,
    defaultColor: '#f59e0b',
    defaultOpacity: 0.3,
  },
  text: {
    minFontSize: 8,
    maxFontSize: 400,
    defaultFontSize: 32,
    defaultFontFamily: 'Inter',
    defaultColor: '#e5e5e5',
  },
  shape: {
    defaultFill: '#3b82f6',
    defaultStroke: 'transparent',
    defaultStrokeWidth: 0,
  },
} as const;

// Layer blend modes
export const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
] as const;

// Export quality presets
export const EXPORT_QUALITY = {
  low: 0.6,
  medium: 0.8,
  high: 0.95,
  maximum: 1.0,
} as const;

// Scale presets for PNG/JPG export
export const EXPORT_SCALE = [1, 1.5, 2, 3, 4] as const;
