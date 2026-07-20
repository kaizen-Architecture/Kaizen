import 'swagger-ui-react/swagger-ui.css';
import { AppShell, ColorScheme, ColorSchemeProvider, MantineProvider } from '@mantine/core';
import { useColorScheme, useHotkeys } from '@mantine/hooks';
import { ModalsProvider } from '@mantine/modals';
import { NotificationsProvider } from '@mantine/notifications';
import { getCookie, setCookie } from 'cookies-next';
import App, { AppProps, AppContext } from 'next/app';
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
  const router = useRouter();
  const [readerMode, setReaderMode] = useState<'downloader' | 'reader'>('downloader');
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const settings = trpc.settings.query.useQuery();
  const readerModuleEnabled = (settings.data?.appConfig as any)?.readerEnabled !== false;

  const { currentThemeConfig } = useAppTheme();

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
      const downloaderPaths = ['/', '/library', '/scheduler', '/sources', '/users'];
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
        <meta
          name="description"
          content="Kaizen is a modern, premium self-hosted manga downloader and manager. A powerful alternative and successor to Kaizoku, featuring an integrated reader and automated scheduler."
        />
        <meta
          name="keywords"
          content="kaizen, manga downloader, manga manager, self-hosted, kaizoku alternative, kaizoku successor, mangal"
        />
        <link rel="shortcut icon" href="/favicon.ico?v=kaizen-v3" />
        <link rel="icon" type="image/png" href="/kaizen.png?v=kaizen-v3" />
      </Head>

      <ColorSchemeProvider colorScheme={colorScheme} toggleColorScheme={toggleColorScheme}>
        <MantineProvider
          withGlobalStyles
          withNormalizeCSS
          theme={{
            ...currentThemeConfig.mantineTheme,
            colorScheme,
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
                padding={router.pathname === '/reader/[mangaId]/[chapterId]' ? 0 : 'md'}
                navbar={
                  router.pathname === '/reader/[mangaId]/[chapterId]' ? undefined : readerMode === 'reader' ? (
                    <ReaderNavbar opened={navOpened} setOpened={setNavOpened} />
                  ) : (
                    <KaizenNavbar opened={navOpened} setOpened={setNavOpened} />
                  )
                }
                header={
                  router.pathname === '/reader/[mangaId]/[chapterId]' ? undefined : (
                    <KaizenHeader
                      opened={navOpened}
                      setOpened={setNavOpened}
                      readerMode={readerMode}
                      onReaderModeChange={handleReaderModeChange}
                      canSwitchReaderMode={currentUserRole !== 'READER'}
                    />
                  )
                }
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

function MyApp(props: AppProps) {
  const initialColorScheme = ((props as any).colorScheme as ColorScheme) || 'light';
  const preferredColorScheme = useColorScheme(initialColorScheme);
  const [colorScheme, setColorScheme] = useState<ColorScheme>(initialColorScheme);
  const [navOpened, setNavOpened] = useState(false);

  useEffect(() => {
    let followSystem = getCookie('follow-system');
    if (followSystem === undefined) {
      followSystem = true;
      setCookie('follow-system', '1');
    }
    let nextScheme: ColorScheme;
    if (followSystem === '1') {
      nextScheme = preferredColorScheme;
    } else {
      nextScheme = (getCookie('mantine-color-scheme') as ColorScheme) || preferredColorScheme;
    }
    setColorScheme(nextScheme);
    setCookie('mantine-color-scheme', nextScheme, { maxAge: 60 * 60 * 24 * 30 });
  }, [preferredColorScheme]);

  const toggleColorScheme = (value?: ColorScheme) => {
    const nextColorScheme = value || (colorScheme === 'dark' ? 'light' : 'dark');
    setColorScheme(nextColorScheme);
    setCookie('mantine-color-scheme', nextColorScheme, { maxAge: 60 * 60 * 24 * 30 });
  };

  useHotkeys([['shift+t', () => toggleColorScheme()]]);

  const initialTheme = (props as any).appTheme || 'kaizen';

  return (
    <AppThemeProvider initialTheme={initialTheme}>
      <MainApp
        {...props}
        colorScheme={colorScheme}
        toggleColorScheme={toggleColorScheme}
        navOpened={navOpened}
        setNavOpened={setNavOpened}
      />
    </AppThemeProvider>
  );
}

MyApp.getInitialProps = async (appContext: AppContext) => {
  const appProps = await App.getInitialProps(appContext);
  const colorScheme = getCookie('mantine-color-scheme', appContext.ctx) || 'light';
  const appTheme = getCookie('kaizen-theme', appContext.ctx) || 'kaizen';
  return {
    ...appProps,
    colorScheme,
    appTheme,
  };
};

export default trpc.withTRPC(appWithTranslation(MyApp));
