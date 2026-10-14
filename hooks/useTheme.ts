'use client';

import { useState, useEffect, useCallback } from 'react';
import { safeStorage } from '@/lib/storage';
import { STORAGE_KEYS } from '@/lib/constants';
import { ThemeMode } from '@/types/preference';

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = safeStorage.get<ThemeMode>(STORAGE_KEYS.THEME, 'dark');
    setThemeState(saved);
    applyTheme(saved);
  }, []);

  const applyTheme = (mode: ThemeMode) => {
    if (typeof document === 'undefined') return;
    if (mode === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', mode);
    }
  };

  const setTheme = useCallback((newTheme: ThemeMode) => {
    setThemeState(newTheme);
    safeStorage.set(STORAGE_KEYS.THEME, newTheme);
    applyTheme(newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme, mounted };
}
