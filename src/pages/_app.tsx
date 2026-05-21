import 'swagger-ui-react/swagger-ui.css';
import { AppShell, ColorScheme, ColorSchemeProvider, MantineProvider } from '@mantine/core';
import { useColorScheme, useHotkeys } from '@mantine/hooks';
import { ModalsProvider } from '@mantine/modals';
import { NotificationsProvider } from '@mantine/notifications';
import { getCookie, setCookie } from 'cookies-next';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { appWithTranslation } from 'next-i18next';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import { KaizenHeader } from '../components/header';
import { KaizenNavbar } from '../components/navbar';
import { AuthGuard } from '../components/kaizen/AuthGuard';
import '../styles/globals.css';
import { trpc } from '../utils/trpc';
import 'dayjs/locale/es';
import { AppThemeProvider, useAppTheme } from '../theme/ThemeContext';

dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);

function MainApp(
  props: AppProps & {
    colorScheme: ColorScheme;
    toggleColorScheme: (value?: ColorScheme) => void;
    navOpened: boolean;
    setNavOpened: (opened: boolean) => void;
  },
) {
  const { Component, pageProps, colorScheme, toggleColorScheme, navOpened, setNavOpened } = props;
  const { currentThemeConfig } = useAppTheme();

  return (
    <ColorSchemeProvider colorScheme={colorScheme} toggleColorScheme={toggleColorScheme}>
      <MantineProvider
        withGlobalStyles
        withNormalizeCSS
        theme={{
          ...currentThemeConfig.mantineTheme,
          colorScheme,
          globalStyles: (theme) => ({
            body: {
              backgroundColor:
                theme.colorScheme === 'dark'
                  ? currentThemeConfig.colors.bodyBg.dark
                  : currentThemeConfig.colors.bodyBg.light,
              color: theme.colorScheme === 'dark' ? theme.colors.gray[3] : theme.colors.dark[7],
            },
          }),
        }}
      >
        <ModalsProvider>
          <NotificationsProvider position="top-center" limit={5}>
            <AppShell
              fixed
              padding="md"
              navbar={<KaizenNavbar opened={navOpened} setOpened={setNavOpened} />}
              header={<KaizenHeader opened={navOpened} setOpened={setNavOpened} />}
              styles={(theme) => ({
                main: {
                  backgroundColor:
                    theme.colorScheme === 'dark'
                      ? currentThemeConfig.colors.mainBg.dark
                      : currentThemeConfig.colors.mainBg.light,
                },
              })}
            >
              <AuthGuard>
                <Component {...pageProps} />
              </AuthGuard>
            </AppShell>
          </NotificationsProvider>
        </ModalsProvider>
      </MantineProvider>
    </ColorSchemeProvider>
  );
}

function MyApp(props: AppProps) {
  const preferredColorScheme = useColorScheme();
  const [colorScheme, setColorScheme] = useState<ColorScheme>('light');
  const [navOpened, setNavOpened] = useState(false);

  useEffect(() => {
    let followSystem = getCookie('follow-system');
    if (followSystem === undefined) {
      followSystem = true;
      setCookie('follow-system', '1');
    }
    if (followSystem === '1') {
      setColorScheme(preferredColorScheme);
    } else {
      setColorScheme((getCookie('mantine-color-scheme') as ColorScheme) || preferredColorScheme);
    }
  }, [preferredColorScheme]);
  const toggleColorScheme = (value?: ColorScheme) => {
    const nextColorScheme = value || (colorScheme === 'dark' ? 'light' : 'dark');
    setColorScheme(nextColorScheme);
    setCookie('mantine-color-scheme', nextColorScheme, { maxAge: 60 * 60 * 24 * 30 });
  };

  useHotkeys([['shift+t', () => toggleColorScheme()]]);

  return (
    <>
      <Head>
        <title>Kaizen Manga Downloader</title>
        <meta name="viewport" content="minimum-scale=1, initial-scale=1, width=device-width" />
        <link rel="shortcut icon" href="/favicon.ico?v=kaizen-v3" />
        <link rel="icon" type="image/png" href="/kaizen.png?v=kaizen-v3" />
      </Head>

      <AppThemeProvider>
        <MainApp
          {...props}
          colorScheme={colorScheme}
          toggleColorScheme={toggleColorScheme}
          navOpened={navOpened}
          setNavOpened={setNavOpened}
        />
      </AppThemeProvider>
    </>
  );
}

export default trpc.withTRPC(appWithTranslation(MyApp));
