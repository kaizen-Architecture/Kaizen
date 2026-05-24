import {
  ActionIcon,
  Box,
  Burger,
  Container,
  createStyles,
  Group,
  Header,
  MediaQuery,
  Stack,
  Switch,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { useState, useEffect } from 'react';
import { getCookie } from 'cookies-next';
import { IconCalendarStats } from '@tabler/icons-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { CheckOutOfSyncChaptersButton } from './checkOutOfSyncChaptersButton';
import { FixOutOfSyncChaptersButton } from './fixOutOfSyncChaptersButton';
import { SearchControl } from './headerSearch';
import { LanguageSwitcher } from './kaizen/LanguageSwitcher';
import { SettingsMenuButton } from './settingsMenu';

const useStyles = createStyles((theme) => ({
  header: {
    backgroundColor: theme.colorScheme === 'dark' ? 'rgba(30, 27, 75, 0.85)' : 'rgba(67, 56, 202, 0.85)', // indigo.9 (dark) or indigo.7 (light)
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    boxShadow: '0 1px 20px rgba(0,0,0,0.3)',
  },

  inner: {
    height: '56px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  title: {
    [`@media (max-width: ${theme.breakpoints.xs}px)`]: {
      display: 'none',
    },
    fontFamily: 'Inter, sans-serif',
    lineHeight: '1.2',
    fontWeight: 700,
    color: theme.colors.gray[0],
  },

  version: {
    fontSize: '10px',
    color: theme.colors.indigo[1],
    opacity: 0.8,
    fontWeight: 500,
  },

  iconButton: {
    color: theme.white,
    '&:hover': {
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
  },
}));

interface KaizenHeaderProps {
  opened: boolean;
  setOpened: (opened: boolean) => void;
  panelMode: 'downloading' | 'reading';
  setPanelMode: (mode: 'downloading' | 'reading') => void;
}

export function KaizenHeader({ opened, setOpened, panelMode, setPanelMode }: KaizenHeaderProps) {
  const { classes } = useStyles();
  const router = useRouter();
  const { t } = useTranslation('common');

  const [currentUser, setCurrentUser] = useState<{ username: string; role: string } | null>(null);

  useEffect(() => {
    const session = getCookie('kaizen-session');
    if (session) {
      try {
        setCurrentUser(JSON.parse(session as string));
      } catch (e) {
        // ignore
      }
    }
  }, []);

  const handlePanelModeChange = (value: 'downloading' | 'reading') => {
    setPanelMode(value);
    localStorage.setItem('kaizen-panel-mode', value);
    if (value === 'reading') {
      router.push('/reader/library').finally(() => setOpened(false));
    } else {
      router.push('/').finally(() => setOpened(false));
    }
  };

  return (
    <Header height={56} className={classes.header}>
      <Container fluid>
        <Box className={classes.inner}>
          <Group spacing={8} noWrap sx={{ flexShrink: 0 }}>
            {/* Burger para móvil */}
            <MediaQuery largerThan="md" styles={{ display: 'none' }}>
              <Burger
                opened={opened}
                onClick={() => setOpened(!opened)}
                size="sm"
                color="white"
                aria-label="Toggle navigation"
              />
            </MediaQuery>

            <Link href={panelMode === 'reading' ? '/reader/library' : '/'}>
              <UnstyledButton component="a">
                <Image alt="header" src="/kaizen.png" height={40} width={40} style={{ borderRadius: '8px' }} />
              </UnstyledButton>
            </Link>

            <Stack
              spacing={0}
              sx={(theme) => ({ [`@media (max-width: ${theme.breakpoints.md}px)`]: { display: 'none' } })}
            >
              <Title order={3} className={classes.title}>
                {panelMode === 'reading' ? 'Kaizen Manga Reader' : 'Kaizen Manga Downloader'}
              </Title>
              {currentUser?.role !== 'READER' ? (
                <Group spacing={8} mt={2}>
                  <Switch
                    checked={panelMode === 'reading'}
                    onChange={(event) => handlePanelModeChange(event.currentTarget.checked ? 'reading' : 'downloading')}
                    size="xs"
                    onLabel="LECTURA"
                    offLabel="GESTIÓN"
                    styles={{
                      track: {
                        cursor: 'pointer',
                        width: 68,
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        borderColor: 'rgba(255, 255, 255, 0.15)',
                        '&:hover': {
                          backgroundColor: 'rgba(255, 255, 255, 0.12)',
                        },
                      },
                      thumb: {
                        backgroundColor: panelMode === 'reading' ? '#a855f7' : '#4f46e5',
                      },
                      label: {
                        color: '#fff',
                        fontSize: '8px',
                        fontWeight: 700,
                      },
                    }}
                  />
                  <Tooltip
                    withArrow
                    position="bottom"
                    label={`Build: ${process.env.NEXT_PUBLIC_GIT_COMMIT_SHORT || 'dev'} | ${
                      process.env.NEXT_PUBLIC_BUILD_DATE
                        ? new Date(process.env.NEXT_PUBLIC_BUILD_DATE).toLocaleDateString()
                        : 'local'
                    }`}
                  >
                    <Text className={classes.version} sx={{ cursor: 'help' }}>
                      v{process.env.NEXT_PUBLIC_APP_VERSION}
                    </Text>
                  </Tooltip>
                </Group>
              ) : (
                <Tooltip
                  withArrow
                  position="bottom"
                  label={`Build: ${process.env.NEXT_PUBLIC_GIT_COMMIT_SHORT || 'dev'} | ${
                    process.env.NEXT_PUBLIC_BUILD_DATE
                      ? new Date(process.env.NEXT_PUBLIC_BUILD_DATE).toLocaleDateString()
                      : 'local'
                  }`}
                >
                  <Text className={classes.version}>
                    v{process.env.NEXT_PUBLIC_APP_VERSION}
                    {process.env.NEXT_PUBLIC_GIT_COMMIT_SHORT && <> | {process.env.NEXT_PUBLIC_GIT_COMMIT_SHORT}</>}
                  </Text>
                </Tooltip>
              )}
            </Stack>

            <Link href={panelMode === 'reading' ? '/reader/library' : '/'}>
              <UnstyledButton component="a">
                <Title
                  order={3}
                  className={classes.title}
                  sx={(theme) => ({
                    display: 'none',
                    [`@media (max-width: ${theme.breakpoints.md}px)`]: { display: 'block' },
                  })}
                >
                  {panelMode === 'reading' ? 'Reader' : 'Downloader'}
                </Title>
              </UnstyledButton>
            </Link>
          </Group>

          <Group position="right" spacing={4} noWrap sx={{ flexShrink: 1, minWidth: 0 }}>
            {currentUser?.role !== 'READER' && (
              <MediaQuery largerThan="md" styles={{ display: 'none' }}>
                <Group spacing={6} noWrap sx={{ marginRight: 8 }}>
                  <Switch
                    checked={panelMode === 'reading'}
                    onChange={(event) => handlePanelModeChange(event.currentTarget.checked ? 'reading' : 'downloading')}
                    size="sm"
                    styles={{
                      track: {
                        cursor: 'pointer',
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        borderColor: 'rgba(255, 255, 255, 0.15)',
                      },
                      thumb: {
                        backgroundColor: panelMode === 'reading' ? '#a855f7' : '#4f46e5',
                      },
                    }}
                  />
                </Group>
              </MediaQuery>
            )}
            <SearchControl />
            <Group
              spacing={2}
              noWrap
              sx={(theme) => ({ [`@media (max-width: ${theme.breakpoints.md}px)`]: { display: 'none' } })}
            >
              <Tooltip label={t('header.tooltip.planner')} withArrow>
                <ActionIcon size="lg" className={classes.iconButton} onClick={() => router.push('/scheduler')}>
                  <IconCalendarStats size={20} strokeWidth={1.5} />
                </ActionIcon>
              </Tooltip>
              <FixOutOfSyncChaptersButton />
              <CheckOutOfSyncChaptersButton />
            </Group>
            <LanguageSwitcher />
            <SettingsMenuButton />
          </Group>
        </Box>
      </Container>
    </Header>
  );
}
