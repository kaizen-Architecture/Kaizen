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
} from '@mantine/core';
import { IconBook, IconLayoutDashboard, IconCalendarStats } from '@tabler/icons-react';
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
  const { classes } = useStyles();
  const router = useRouter();
  const { t } = useTranslation('common');

  const settings = trpc.settings.query.useQuery({ staleTime: 5 * 60 * 1000 });
  const readerModuleEnabled = (settings.data?.appConfig as any)?.readerEnabled !== false;

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
                color="white"
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
                      <Text className={classes.version}>
                        v{process.env.NEXT_PUBLIC_APP_VERSION}
                        {process.env.NEXT_PUBLIC_GIT_COMMIT_SHORT && <> | {process.env.NEXT_PUBLIC_GIT_COMMIT_SHORT}</>}
                      </Text>
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
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.15)',
                  },
                  label: {
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 600,
                    paddingLeft: 6,
                    paddingRight: 6,
                  },
                  control: {
                    '&[data-active]': {
                      backgroundColor: isReader ? '#7c3aed' : '#4f46e5',
                    },
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
    </Header>
  );
}

KaizenHeader.defaultProps = {
  canSwitchReaderMode: true,
};
