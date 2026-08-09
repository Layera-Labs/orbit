import { useState, useEffect, useCallback } from 'react';
import { themeManager } from '../themes/manager';
import type { OrbitTheme } from '@layera-labs/shared';

export function useTheme() {
  const [theme, setThemeState] = useState<OrbitTheme>(themeManager.getCurrentTheme());

  useEffect(() => {
    themeManager.setTheme(theme.id);
  }, [theme.id]);

  const setTheme = useCallback((themeId: string) => {
    themeManager.setTheme(themeId);
    setThemeState(themeManager.getCurrentTheme());
  }, []);

  const toggleTheme = useCallback(() => {
    const newThemeId = theme.id === 'orbit-dark' ? 'orbit-light' : 'orbit-dark';
    setTheme(newThemeId);
  }, [theme.id, setTheme]);

  return {
    theme,
    setTheme,
    toggleTheme,
    isDark: theme.id === 'orbit-dark',
  };
}
