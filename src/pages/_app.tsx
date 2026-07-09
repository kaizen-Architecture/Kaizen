import 'swagger-ui-react/swagger-ui.css';
import { AppShell, ColorScheme, ColorSchemeProvider, MantineProvider } from '@mantine/core';
import { useColorScheme, useHotkeys } from '@mantine/hooks';
import { ModalsProvider } from '@mantine/modals';
import { NotificationsProvider } from '@mantine/notifications';
import { getCookie, setCookie } from 'cookies-next';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { appWithTranslation } from 'next-i18next';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import { KaizenHeader } from '../components/header';
import { KaizenNavbar } from '../components/navbar';
import { ReaderNavbar } from '../components/kaizen/ReaderNavbar';
import { AuthGuard } from '../components/kaizen/AuthGuard';
import '../styles/globals.css';
import { trpc } from '../utils/trpc';
import 'dayjs/locale/es';

dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);

/**
 * Lee el tema de color guardado de forma sincrona desde cookies.
 * Esto evita el flash de tema incorrecto en el primer render (flickering).
 * En SSR se devuelve 'dark' como fallback seguro; en cliente lee la cookie.
 */
function getInitialColorScheme(): ColorScheme {
  if (typeof window === 'undefined') return 'dark';
  const followSystem = getCookie('follow-system');
  // Si está activo "seguir sistema" (o la cookie no existe aún), usamos 'dark' como base
  // y el useEffect con useColorScheme lo corregirá sin flash visible porque coincide.
  if (!followSystem || followSystem === '1') {
    // Intentamos leer la preferencia del sistema de forma sincrónica
    try {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      return mq.matches ? 'dark' : 'light';
    } catch {
      return 'dark';
    }
  }
  const saved = getCookie('mantine-color-scheme') as ColorScheme | undefined;
  return saved === 'light' || saved === 'dark' ? saved : 'dark';
}

function MyApp(props: AppProps) {
  const { Component, pageProps } = props;
  const router = useRouter();
  const preferredColorScheme = useColorScheme();
  const [colorScheme, setColorScheme] = useState<ColorScheme>(getInitialColorScheme);
  const [navOpened, setNavOpened] = useState(false);
  const [readerMode, setReaderMode] = useState<'downloader' | 'reader'>('downloader');
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const settings = trpc.settings.query.useQuery();
  const readerModuleEnabled = (settings.data?.appConfig as any)?.readerEnabled !== false;

  // Sincroniza el tema con la preferencia del sistema SOLO cuando cambia
  // (follow-system activado). Evita re-setear si el usuario eligió uno manualmente.
  useEffect(() => {
    const followSystem = getCookie('follow-system');
    if (!followSystem || followSystem === '1') {
      setColorScheme(preferredColorScheme);
    }
    // Si follow-system === '0', no tocamos el tema (ya lo inicializamos correctamente).
  }, [preferredColorScheme]);

  const toggleColorScheme = (value?: ColorScheme) => {
    const nextColorScheme = value || (colorScheme === 'dark' ? 'light' : 'dark');
    setColorScheme(nextColorScheme);
    // Al cambiar manualmente, desactivamos el modo "seguir sistema"
    setCookie('follow-system', '0');
    setCookie('mantine-color-scheme', nextColorScheme, { maxAge: 60 * 60 * 24 * 30 });
  };

  useHotkeys([['shift+t', () => toggleColorScheme()]]);

  // Read current user role from session cookie (for READER role forcing)
  useEffect(() => {
    const session = getCookie('kaizen-session');
    if (session) {
      try {
        const parsed = JSON.parse(session as string);
        setCurrentUserRole(parsed?.role || null);
      } catch (e) {
        setCurrentUserRole(null);
      }
    }
  }, []);

  // Reader mode persistence + initial navigation (clean add-on)
  // READER role users are forced into reader mode
  useEffect(() => {
    const isReaderUser = currentUserRole === 'READER';
    const moduleEnabled = readerModuleEnabled;

    const saved = typeof window !== 'undefined' ? localStorage.getItem('kaizen-reader-mode') : null;

    let targetMode: 'downloader' | 'reader' = 'downloader';

    if (isReaderUser) {
      targetMode = 'reader';
    } else if (!moduleEnabled) {
      targetMode = 'downloader';
    } else if (saved === 'reader' || saved === 'downloader') {
      targetMode = saved as 'downloader' | 'reader';
    }

    // Use functional setState to skip re-render when value hasn't changed
    setReaderMode((prev) => (prev === targetMode ? prev : targetMode));
  }, [currentUserRole, readerModuleEnabled]);

  // Synchronize readerMode with route changes
  // IMPORTANT: Use functional setState to avoid re-renders when value
  // hasn't changed — unnecessary re-renders here break Next.js page transitions
  useEffect(() => {
    const isReaderUser = currentUserRole === 'READER';
    const moduleEnabled = readerModuleEnabled;

    if (!moduleEnabled) {
      setReaderMode((prev) => {
        if (prev !== 'downloader') localStorage.setItem('kaizen-reader-mode', 'downloader');
        return 'downloader';
      });
      return;
    }

    if (isReaderUser) {
      setReaderMode((prev) => (prev === 'reader' ? prev : 'reader'));
      return;
    }

    if (router.pathname.startsWith('/reader')) {
      setReaderMode((prev) => {
        if (prev !== 'reader') localStorage.setItem('kaizen-reader-mode', 'reader');
        return 'reader';
      });
    } else {
      const downloaderPaths = ['/', '/library', '/scheduler', '/sources', '/users', '/settings'];
      const isDownloaderPath = downloaderPaths.includes(router.pathname);
      if (isDownloaderPath) {
        setReaderMode((prev) => {
          if (prev !== 'downloader') localStorage.setItem('kaizen-reader-mode', 'downloader');
          return 'downloader';
        });
      }
    }
  }, [router.pathname, currentUserRole, readerModuleEnabled]);

  const handleReaderModeChange = (mode: 'downloader' | 'reader') => {
    // READER role users cannot leave reader mode
    if (currentUserRole === 'READER' && mode === 'downloader') {
      return;
    }

    setReaderMode(mode);
    localStorage.setItem('kaizen-reader-mode', mode);

    if (mode === 'reader') {
      router.push('/reader/library');
    } else {
      router.push('/');
    }
  };

  return (
    <>
      <Head>
        <title>{readerMode === 'reader' ? 'Kaizen Manga Reader' : 'Kaizen Manga Downloader'}</title>
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
                navbar={
                  readerMode === 'reader' ? (
                    <ReaderNavbar opened={navOpened} setOpened={setNavOpened} />
                  ) : (
                    <KaizenNavbar opened={navOpened} setOpened={setNavOpened} />
                  )
                }
                header={
                  <KaizenHeader
                    opened={navOpened}
                    setOpened={setNavOpened}
                    readerMode={readerMode}
                    onReaderModeChange={handleReaderModeChange}
                    canSwitchReaderMode={currentUserRole !== 'READER'}
                  />
                }
                styles={(theme) => ({
                  main: { backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[8] : theme.colors.gray[0] },
                })}
              >
                <AuthGuard>
                  <Component {...pageProps} readerMode={readerMode} />
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
