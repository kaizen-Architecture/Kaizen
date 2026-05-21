import { MantineThemeOverride } from '@mantine/core';

export type AppThemeName = 'default' | 'kaizen';

export interface AppThemeConfig {
  name: AppThemeName;
  mantineTheme: MantineThemeOverride;
  colors: {
    headerBg: { light: string; dark: string };
    navbarBg: { light: string; dark: string };
    bodyBg: { light: string; dark: string };
    mainBg: { light: string; dark: string };
  };
}

export const themes: Record<AppThemeName, AppThemeConfig> = {
  default: {
    name: 'default',
    mantineTheme: {
      primaryColor: 'indigo',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
      headings: {
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
        fontWeight: 700,
      },
    },
    colors: {
      headerBg: { light: 'rgba(67, 56, 202, 0.85)', dark: 'rgba(30, 27, 75, 0.85)' },
      navbarBg: { light: 'rgba(67, 56, 202, 0.85)', dark: 'rgba(30, 27, 75, 0.85)' },
      bodyBg: { light: '#f8f9fa', dark: '#0f172a' },
      mainBg: { light: '#f8f9fa', dark: '#141517' },
    },
  },
  kaizen: {
    name: 'kaizen',
    mantineTheme: {
      primaryColor: 'teal', // Nearest standard Mantine color to #00d2c4 for components that rely on primaryColor
      primaryShade: 4, // Teal 4 is close to #00d2c4
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
      headings: {
        fontFamily: 'Outfit, Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
        fontWeight: 700,
      },
    },
    colors: {
      headerBg: { light: 'rgba(255, 255, 255, 0.85)', dark: 'rgba(18, 22, 32, 0.7)' },
      navbarBg: { light: 'rgba(255, 255, 255, 0.85)', dark: 'rgba(18, 22, 32, 0.7)' },
      bodyBg: { light: '#f3f4f6', dark: '#0a0c10' },
      mainBg: { light: '#f3f4f6', dark: '#121620' },
    },
  },
};
