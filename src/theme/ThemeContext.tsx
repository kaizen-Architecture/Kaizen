import React, { createContext, useContext, useEffect, useState } from 'react';
import { getCookie, setCookie } from 'cookies-next';
import { AppThemeName, themes, AppThemeConfig } from './themes';

interface ThemeContextProps {
  appTheme: AppThemeName;
  setAppTheme: (theme: AppThemeName) => void;
  currentThemeConfig: AppThemeConfig;
}

const ThemeContext = createContext<ThemeContextProps | undefined>(undefined);

export function AppThemeProvider({
  children,
  initialTheme,
}: {
  children: React.ReactNode;
  initialTheme?: AppThemeName;
}) {
  const [appTheme, setAppThemeState] = useState<AppThemeName>(initialTheme || 'kaizen'); // Default to kaizen

  useEffect(() => {
    // Only set default cookie if no initial theme was provided and no cookie exists
    const savedTheme = getCookie('kaizen-theme') as AppThemeName;
    if (!savedTheme && !initialTheme) {
      setCookie('kaizen-theme', 'kaizen', { maxAge: 60 * 60 * 24 * 365 });
    }
    // Don't overwrite state - SSR already set it
  }, [initialTheme]);

  const setAppTheme = (theme: AppThemeName) => {
    setAppThemeState(theme);
    setCookie('kaizen-theme', theme, { maxAge: 60 * 60 * 24 * 365 });
  };

  const currentThemeConfig = themes[appTheme];

  const value = React.useMemo(() => ({ appTheme, setAppTheme, currentThemeConfig }), [appTheme, currentThemeConfig]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useAppTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useAppTheme must be used within an AppThemeProvider');
  }
  return context;
};
