export * from './types';
export { ProviderRegistry } from './registry';

// Zero-config built-in provider implementations (swap for real backends).
export { PicsumPhotoProvider } from './builtins/picsum';
export { PresetBackgroundProvider } from './builtins/backgrounds';
export { GoogleFontProvider } from './builtins/google-fonts';
export { DemoTemplateProvider } from './builtins/demo-templates';
