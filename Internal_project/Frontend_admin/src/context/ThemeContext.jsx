import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'nexchain-theme';
const VALID_THEMES = ['light', 'dark', 'system'];

const getStoredTheme = () => {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem(STORAGE_KEY);
  return VALID_THEMES.includes(stored) ? stored : 'system';
};

const getSystemPref = () => {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(getStoredTheme);
  const [systemPrefersDark, setSystemPrefersDark] = useState(getSystemPref);

  // react to OS theme changes only when user selected "system"
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event) => setSystemPrefersDark(event.matches);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  // persist chosen theme
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const resolvedTheme = theme === 'system' ? (systemPrefersDark ? 'dark' : 'light') : theme;

  // push classes to <html> so Tailwind dark: and custom CSS can react
  useEffect(() => {
    const root = document.documentElement;
    const isDark = resolvedTheme === 'dark';

    root.classList.toggle('theme-dark', isDark);
    root.classList.toggle('theme-light', !isDark);
    root.classList.toggle('dark', isDark);
    root.dataset.theme = theme;

    // ensure browsers style built-ins (e.g., scrollbar) correctly
    let colorSchemeMeta = document.querySelector('meta[name="color-scheme"]');
    if (!colorSchemeMeta) {
      colorSchemeMeta = document.createElement('meta');
      colorSchemeMeta.setAttribute('name', 'color-scheme');
      document.head.appendChild(colorSchemeMeta);
    }
    colorSchemeMeta.setAttribute('content', isDark ? 'dark light' : 'light dark');
  }, [resolvedTheme, theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      toggleTheme,
    }),
    [theme, resolvedTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
