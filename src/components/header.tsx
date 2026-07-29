import {
  ActionIcon,
  Box,
  Burger,
  Container,
  createStyles,
  Group,
  Header,
  MediaQuery,
  SegmentedControl,
  Stack,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
  Badge,
  useMantineTheme,
} from '@mantine/core';
import { useState } from 'react';
import { IconBook, IconLayoutDashboard, IconCalendarStats, IconUser } from '@tabler/icons-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { trpc } from '../utils/trpc';
import { CheckOutOfSyncChaptersButton } from './checkOutOfSyncChaptersButton';
import { FixOutOfSyncChaptersButton } from './fixOutOfSyncChaptersButton';
import { SearchControl } from './headerSearch';
import { LanguageSwitcher } from './kaizen/LanguageSwitcher';
import { SettingsMenuButton } from './settingsMenu';
import { useAppTheme } from '../theme/ThemeContext';
import { UpdateInfoModal } from './kaizen/UpdateInfoModal';
import { UserSettingsModal } from './user/UserSettingsModal';
import { getCookie } from 'cookies-next';

const useStyles = createStyles(
  (
    theme,
    {
      headerBgLight,
      headerBgDark,
      headerTextColor,
      versionTextColor,
    }: {
      headerBgLight: string;
      headerBgDark: string;
      headerTextColor: string;
      versionTextColor: string;
    },
  ) => ({
    header: {
      backgroundColor: theme.colorScheme === 'dark' ? headerBgDark : headerBgLight,
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderBottom: theme.colorScheme === 'dark' ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
      boxShadow: theme.colorScheme === 'dark' ? '0 1px 20px rgba(0,0,0,0.3)' : '0 1px 20px rgba(0,0,0,0.05)',
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
      color: headerTextColor,
    },

    version: {
      fontSize: '10px',
      color: versionTextColor,
      opacity: 0.8,
      fontWeight: 500,
    },

    iconButton: {
      color: headerTextColor,
      '&:hover': {
        backgroundColor: theme.colorScheme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
      },
    },
  }),
);

interface KaizenHeaderProps {
  opened: boolean;
  setOpened: (opened: boolean) => void;
  readerMode: 'downloader' | 'reader';
  onReaderModeChange: (mode: 'downloader' | 'reader') => void;
  canSwitchReaderMode?: boolean;
}

export function KaizenHeader({
  opened,
  setOpened,
  readerMode,
  onReaderModeChange,
  canSwitchReaderMode = true,
}: KaizenHeaderProps) {
  const { currentThemeConfig } = useAppTheme();
  const mantineTheme = useMantineTheme();
  const { classes } = useStyles({
    headerBgLight: currentThemeConfig.colors.headerBg.light,
    headerBgDark: currentThemeConfig.colors.headerBg.dark,
    headerTextColor:
      mantineTheme.colorScheme === 'dark'
        ? currentThemeConfig.colors.headerText.dark
        : currentThemeConfig.colors.headerText.light,
    versionTextColor:
      mantineTheme.colorScheme === 'dark'
        ? currentThemeConfig.colors.versionText.dark
        : currentThemeConfig.colors.versionText.light,
  });
  const router = useRouter();
  const { t } = useTranslation('common');

  const settings = trpc.settings.query.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  const readerModuleEnabled = (settings.data?.appConfig as any)?.readerEnabled !== false;

  const [updateModalOpened, setUpdateModalOpened] = useState(false);
  const [userSettingsOpened, setUserSettingsOpened] = useState(false);
  const updateCheck = trpc.settings.checkForUpdates.useQuery(undefined, {
    staleTime: 12 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const session = getCookie('kaizen-session');
  const currentUser = session ? JSON.parse(session as string) : null;
  const currentUserId = currentUser?.id || 1;

  const isReader = readerMode === 'reader';
  const appTitle = isReader ? 'Kaizen Manga Reader' : t('app.title');
  const appShortTitle = isReader ? 'Reader' : t('app.shortTitle');

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
                color={
                  mantineTheme.colorScheme === 'dark'
                    ? currentThemeConfig.colors.burgerColor.dark
                    : currentThemeConfig.colors.burgerColor.light
                }
                aria-label="Toggle navigation"
              />
            </MediaQuery>

            <Link href={isReader ? '/reader/library' : '/'}>
              <UnstyledButton component="a">
                <Group spacing={12}>
                  <Image alt="header" src="/kaizen.png" height={40} width={40} style={{ borderRadius: '8px' }} />
                  <Stack
                    spacing={0}
                    sx={(theme) => ({ [`@media (max-width: ${theme.breakpoints.md}px)`]: { display: 'none' } })}
                  >
                    <Title order={3} className={classes.title}>
                      {appTitle}
                    </Title>
                    <Tooltip
                      withArrow
                      position="bottom"
                      label={`Build: ${process.env.NEXT_PUBLIC_GIT_COMMIT_SHORT || 'dev'} | ${
                        process.env.NEXT_PUBLIC_BUILD_DATE
                          ? new Date(process.env.NEXT_PUBLIC_BUILD_DATE).toLocaleDateString()
                          : 'local'
                      }`}
                    >
                      <Group spacing={6} align="center">
                        <Text className={classes.version}>
                          v{process.env.NEXT_PUBLIC_APP_VERSION}
                          {process.env.NEXT_PUBLIC_GIT_COMMIT_SHORT && (
                            <> | {process.env.NEXT_PUBLIC_GIT_COMMIT_SHORT}</>
                          )}
                        </Text>
                        {updateCheck.data?.updateAvailable && (
                          <Badge
                            color="orange"
                            variant="filled"
                            size="xs"
                            sx={{
                              cursor: 'pointer',
                              textTransform: 'none',
                              height: '16px',
                              fontSize: '9px',
                              fontWeight: 700,
                            }}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setUpdateModalOpened(true);
                            }}
                          >
                            Update
                          </Badge>
                        )}
                      </Group>
                    </Tooltip>
                  </Stack>
                  <Title
                    order={3}
                    className={classes.title}
                    sx={(theme) => ({
                      display: 'none',
                      [`@media (max-width: ${theme.breakpoints.md}px)`]: { display: 'block' },
                    })}
                  >
                    {appShortTitle}
                  </Title>
                </Group>
              </UnstyledButton>
            </Link>
          </Group>

          <Group position="right" spacing={4} noWrap sx={{ flexShrink: 1, minWidth: 0 }}>
            <SearchControl readerMode={readerMode} />

            {canSwitchReaderMode && readerModuleEnabled && (
              <SegmentedControl
                value={readerMode}
                onChange={(value) => onReaderModeChange(value as 'downloader' | 'reader')}
                size="xs"
                radius="sm"
                data={[
                  {
                    value: 'downloader',
                    label: (
                      <Group spacing={6} noWrap position="center">
                        <IconLayoutDashboard size={13} stroke={2} />
                        <span>{t('nav.panelDownloading', 'Gestión') as string}</span>
                      </Group>
                    ),
                  },
                  {
                    value: 'reader',
                    label: (
                      <Group spacing={6} noWrap position="center">
                        <IconBook size={13} stroke={2} />
                        <span>{t('nav.panelReading', 'Lectura') as string}</span>
                      </Group>
                    ),
                  },
                ]}
                styles={{
                  root: {
                    backgroundColor:
                      mantineTheme.colorScheme === 'dark'
                        ? 'rgba(255,255,255,0.08)'
                        : currentThemeConfig.name === 'kaizen'
                        ? 'rgba(0, 0, 0, 0.05)'
                        : 'rgba(255,255,255,0.15)',
                    border:
                      mantineTheme.colorScheme === 'dark'
                        ? '1px solid rgba(255,255,255,0.15)'
                        : currentThemeConfig.name === 'kaizen'
                        ? '1px solid rgba(0, 0, 0, 0.1)'
                        : '1px solid rgba(255,255,255,0.2)',
                  },
                  label: {
                    color:
                      mantineTheme.colorScheme === 'dark'
                        ? '#cbd5e1'
                        : currentThemeConfig.name === 'kaizen'
                        ? '#334155'
                        : '#ffffff',
                    fontSize: 10,
                    fontWeight: 600,
                    paddingLeft: 6,
                    paddingRight: 6,
                  },
                  indicator: {
                    backgroundColor: isReader ? '#7c3aed' : '#00d2c4',
                    borderRadius: mantineTheme.radius.xs,
                  },
                  labelActive: {
                    color: isReader ? '#ffffff !important' : '#0a0c10 !important',
                    fontWeight: 700,
                  },
                }}
              />
            )}

            {readerMode !== 'reader' && (
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
            )}
            <LanguageSwitcher />
            {readerMode !== 'reader' && <SettingsMenuButton />}
          </Group>
        </Box>
      </Container>
      <UpdateInfoModal
        opened={updateModalOpened}
        onClose={() => setUpdateModalOpened(false)}
        updateInfo={updateCheck.data || null}
      />
      <UserSettingsModal
        opened={userSettingsOpened}
        onClose={() => setUserSettingsOpened(false)}
        userId={currentUserId}
      />
    </Header>
  );
}

KaizenHeader.defaultProps = {
  canSwitchReaderMode: true,
};
