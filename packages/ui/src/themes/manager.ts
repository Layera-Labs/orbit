import { type OrbitTheme } from '@layera-labs/shared';
import { darkTheme } from './dark';
import { lightTheme } from './light';

const themes = new Map<string, OrbitTheme>([
  [darkTheme.id, darkTheme],
  [lightTheme.id, lightTheme],
]);

export class ThemeManager {
  private currentTheme: OrbitTheme = darkTheme;

  getTheme(id: string): OrbitTheme | undefined {
    return themes.get(id);
  }

  setTheme(id: string): void {
    const theme = themes.get(id);
    if (!theme) throw new Error(`Theme "${id}" not found`);
    this.currentTheme = theme;
    this.applyTheme(theme);
  }

  registerTheme(theme: OrbitTheme): void {
    themes.set(theme.id, theme);
  }

  getCurrentTheme(): OrbitTheme {
    return this.currentTheme;
  }

  private applyTheme(theme: OrbitTheme): void {
    const root = document.documentElement;
    Object.entries(theme.variables).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
    root.style.setProperty('color-scheme', theme.id === 'orbit-light' ? 'light' : 'dark');
  }
}

export const themeManager = new ThemeManager();
