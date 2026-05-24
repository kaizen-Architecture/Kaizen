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

dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);

function MyApp(props: AppProps) {
  const { Component, pageProps } = props;
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

      <ColorSchemeProvider colorScheme={colorScheme} toggleColorScheme={toggleColorScheme}>
        <MantineProvider
          withGlobalStyles
          withNormalizeCSS
          theme={{
            primaryColor: 'indigo',
            colorScheme,
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
            headings: {
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
              fontWeight: 700,
            },
            components: {
              ActionIcon: {
                styles: (theme) => ({
                  root: {
                    [`@media (max-width: ${theme.breakpoints.sm}px)`]: {
                      minWidth: '44px',
                      minHeight: '44px',
                    },
                  },
                }),
              },
            },
            globalStyles: (theme) => ({
              body: {
                backgroundColor: theme.colorScheme === 'dark' ? '#0f172a' : theme.colors.gray[0],
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
                  main: { backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[8] : theme.colors.gray[0] },
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
    </>
  );
}

export default trpc.withTRPC(appWithTranslation(MyApp));
