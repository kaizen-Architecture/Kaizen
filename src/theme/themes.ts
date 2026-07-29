import { MantineThemeOverride } from '@mantine/core';

export type AppThemeName = 'default' | 'kaizen';

export interface AppThemeConfig {
  name: AppThemeName;
  mantineTheme: MantineThemeOverride;
  colors: {
    headerBg: { light: string; dark: string };
    headerText: { light: string; dark: string };
    versionText: { light: string; dark: string };
    burgerColor: { light: string; dark: string };
    navbarBg: { light: string; dark: string };
    navbarText: { light: string; dark: string };
    navbarTextDimmed: { light: string; dark: string };
    navbarItemActiveBg: { light: string; dark: string };
    navbarItemActiveText: { light: string; dark: string };
    navbarItemHoverBg: { light: string; dark: string };
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
      headerText: { light: '#ffffff', dark: '#ffffff' },
      versionText: { light: '#c7d2fe', dark: '#c7d2fe' },
      burgerColor: { light: '#ffffff', dark: '#ffffff' },
      navbarBg: { light: 'rgba(67, 56, 202, 0.85)', dark: 'rgba(30, 27, 75, 0.85)' },
      navbarText: { light: 'rgba(255, 255, 255, 0.95)', dark: 'rgba(255, 255, 255, 0.85)' },
      navbarTextDimmed: { light: 'rgba(255, 255, 255, 0.85)', dark: 'rgba(255, 255, 255, 0.55)' },
      navbarItemActiveBg: { light: 'rgba(255, 255, 255, 0.15)', dark: 'rgba(255, 255, 255, 0.15)' },
      navbarItemActiveText: { light: '#ffffff', dark: '#ffffff' },
      navbarItemHoverBg: { light: 'rgba(255, 255, 255, 0.1)', dark: 'rgba(255, 255, 255, 0.1)' },
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
      headerText: { light: '#0f172a', dark: '#f1f5f9' },
      versionText: { light: '#475569', dark: '#94a3b8' },
      burgerColor: { light: '#0f172a', dark: '#ffffff' },
      navbarBg: { light: 'rgba(255, 255, 255, 0.85)', dark: 'rgba(18, 22, 32, 0.7)' },
      navbarText: { light: '#334155', dark: '#cbd5e1' },
      navbarTextDimmed: { light: '#475569', dark: '#94a3b8' },
      navbarItemActiveBg: { light: 'rgba(0, 0, 0, 0.05)', dark: 'rgba(255, 255, 255, 0.08)' },
      navbarItemActiveText: { light: '#0f172a', dark: '#ffffff' },
      navbarItemHoverBg: { light: 'rgba(0, 0, 0, 0.03)', dark: 'rgba(255, 255, 255, 0.04)' },
      bodyBg: { light: '#f3f4f6', dark: '#0a0c10' },
      mainBg: { light: '#f3f4f6', dark: '#121620' },
    },
  },
};
