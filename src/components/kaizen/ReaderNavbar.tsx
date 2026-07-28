import {
  Navbar,
  Stack,
  UnstyledButton,
  Text,
  Divider,
  Avatar,
  Group,
  Box,
  ActionIcon,
  Tooltip,
  ScrollArea,
  useMantineTheme,
} from '@mantine/core';
import { useModals } from '@mantine/modals';
import {
  IconBooks,
  IconStar,
  IconClock,
  IconBookmark,
  IconLogout,
  IconSettings,
  IconGitPullRequest,
  IconBook,
  IconCalendarPlus,
} from '@tabler/icons-react';
import { getCookie, deleteCookie } from 'cookies-next';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { MadeWith } from '../madeWith';
import { trpc } from '../../utils/trpc';
import { useAppTheme } from '../../theme/ThemeContext';

interface ReaderNavbarProps {
  opened: boolean;
  setOpened: (opened: boolean) => void;
}

import { UserSettingsModal } from '../user/UserSettingsModal';

export function ReaderNavbar({ opened, setOpened }: ReaderNavbarProps) {
  const router = useRouter();
  const { t } = useTranslation('common');
  const { t: tSettings } = useTranslation('settings');
  const modals = useModals();
  const settings = trpc.settings.query.useQuery({ staleTime: 5 * 60 * 1000 });

  const isAuthEnabled = (settings.data?.appConfig as any)?.authEnabled === true;
  const [currentUser, setCurrentUser] = useState<{ id?: number; username: string; role: string } | null>(null);
  const [userSettingsModalOpened, setUserSettingsModalOpened] = useState(false);
  const [currentPath, setCurrentPath] = useState(router.asPath);

  useEffect(() => {
    setCurrentPath(router.asPath);
  }, [router.asPath]);

  useEffect(() => {
    const session = getCookie('kaizen-session');
    if (session) {
      try {
        setCurrentUser(JSON.parse(session as string));
      } catch (e) {
        // ignore
      }
    }
  }, [isAuthEnabled]);

  const handleLogout = () => {
    modals.openConfirmModal({
      title: tSettings('auth.logout', 'Cerrar Sesión'),
      children: (
        <Text size="sm">{tSettings('auth.logoutConfirm', '¿Estás seguro de que deseas cerrar tu sesión actual?')}</Text>
      ),
      labels: { confirm: tSettings('auth.logout', 'Cerrar Sesión'), cancel: t('common.cancel', 'Cancelar') },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        deleteCookie('kaizen-session');
        window.location.reload();
      },
    });
  };

  const handleNav = (href: string) => {
    // Usar window.location.href para navegación confiable en reader mode
    window.location.href = href;
    setOpened(false);
  };

  const isReaderRole = currentUser?.role === 'READER';

  const navItems = [
    { label: t('nav.library'), icon: IconBooks, href: '/reader/library' },
    { label: t('nav.favorites'), icon: IconStar, href: '/reader/library?filter=favorites' },
    { label: t('nav.reading'), icon: IconClock, href: '/reader/library?filter=reading' },
    { label: t('nav.planToRead'), icon: IconCalendarPlus, href: '/reader/library?filter=planToRead' },
    { label: t('nav.requests', 'Solicitudes'), icon: IconGitPullRequest, href: '/reader/requests' },
    { label: t('nav.bookmarks'), icon: IconBookmark, href: '/reader/library?filter=bookmarks' },
    { label: t('nav.guide', 'Guía de Usuario'), icon: IconBook, href: '/guide' },
    ...(!isReaderRole ? [{ label: t('nav.settings'), icon: IconSettings, href: '/settings' }] : []),
  ];

  const { currentThemeConfig } = useAppTheme();
  const mantineTheme = useMantineTheme();

  return (
    <Navbar
      width={{ sm: 220 }}
      p="md"
      hiddenBreakpoint="md"
      hidden={!opened}
      sx={(theme) => ({
        backgroundColor:
          theme.colorScheme === 'dark'
            ? currentThemeConfig.colors.navbarBg.dark
            : currentThemeConfig.colors.navbarBg.light,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRight: theme.colorScheme === 'dark' ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
        boxShadow: theme.shadows.md,
        zIndex: 200,
      })}
    >
      <Navbar.Section grow component={ScrollArea} mx="-xs" px="xs">
        <Stack spacing={4} pb="xl">
          {navItems.map((item) => {
            const isActive =
              currentPath === item.href ||
              (item.href === '/reader/library' &&
                ((router.pathname === '/reader/library' && !currentPath.includes('?filter=')) ||
                  router.pathname === '/manga/[id]' ||
                  router.pathname === '/reader/[mangaId]/[chapterId]')) ||
              (item.href.startsWith('/reader/library?filter=') &&
                router.pathname === '/reader/library' &&
                currentPath.includes(item.href.split('?filter=')[1]));

            return (
              <UnstyledButton
                key={item.href}
                onClick={() => handleNav(item.href)}
                sx={(theme) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: theme.radius.md,
                  color: isActive
                    ? theme.colorScheme === 'dark'
                      ? currentThemeConfig.colors.navbarItemActiveText.dark
                      : currentThemeConfig.colors.navbarItemActiveText.light
                    : theme.colorScheme === 'dark'
                    ? currentThemeConfig.colors.navbarText.dark
                    : currentThemeConfig.colors.navbarText.light,
                  backgroundColor: isActive
                    ? theme.colorScheme === 'dark'
                      ? currentThemeConfig.colors.navbarItemActiveBg.dark
                      : currentThemeConfig.colors.navbarItemActiveBg.light
                    : 'transparent',
                  fontWeight: isActive ? 600 : 400,
                  fontSize: theme.fontSizes.sm,
                  transition: 'all 0.15s ease',
                  '&:hover': {
                    backgroundColor:
                      theme.colorScheme === 'dark'
                        ? currentThemeConfig.colors.navbarItemHoverBg.dark
                        : currentThemeConfig.colors.navbarItemHoverBg.light,
                    color:
                      theme.colorScheme === 'dark'
                        ? currentThemeConfig.colors.navbarItemActiveText.dark
                        : currentThemeConfig.colors.navbarItemActiveText.light,
                  },
                })}
              >
                <item.icon size={20} strokeWidth={isActive ? 2 : 1.5} />
                <Text>{item.label}</Text>
              </UnstyledButton>
            );
          })}
        </Stack>
      </Navbar.Section>

      {isAuthEnabled && currentUser && (
        <Navbar.Section
          p="xs"
          sx={(theme) => ({
            background: theme.colorScheme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
            borderRadius: 8,
            marginBottom: 12,
            border:
              theme.colorScheme === 'dark' ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.06)',
          })}
        >
          <Group position="apart" spacing="xs">
            <Group
              spacing="xs"
              sx={{ overflow: 'hidden', flex: 1, cursor: 'pointer' }}
              onClick={() => setUserSettingsModalOpened(true)}
              title={tSettings('userSettings.title', 'User Settings')}
            >
              <Avatar
                size="sm"
                radius="xl"
                color="violet"
                styles={{
                  placeholder: {
                    background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
                    color: '#fff',
                    fontWeight: 700,
                  },
                }}
              >
                {currentUser.username.substring(0, 2).toUpperCase()}
              </Avatar>
              <Box sx={{ overflow: 'hidden', flex: 1 }}>
                <Text
                  size="xs"
                  weight={600}
                  color={mantineTheme.colorScheme === 'dark' ? '#fff' : '#0f172a'}
                  sx={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}
                >
                  {currentUser.username}
                </Text>
                <Text
                  sx={{ fontSize: 10 }}
                  color={mantineTheme.colorScheme === 'dark' ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)'}
                >
                  {currentUser.role === 'SUPERADMIN'
                    ? tSettings('users.roles.superadmin', 'Admin')
                    : currentUser.role === 'MANAGER'
                    ? tSettings('users.roles.manager', 'Gestor')
                    : tSettings('users.roles.reader', 'Lector')}
                </Text>
              </Box>
            </Group>
            <Tooltip label={tSettings('auth.logout', 'Cerrar Sesión')} position="top" withArrow>
              <ActionIcon
                variant="subtle"
                color="red"
                onClick={handleLogout}
                sx={(theme) => ({
                  color: theme.colorScheme === 'dark' ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)',
                  '&:hover': {
                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                    color: '#ef4444',
                  },
                })}
              >
                <IconLogout size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
          <UserSettingsModal
            opened={userSettingsModalOpened}
            onClose={() => setUserSettingsModalOpened(false)}
            userId={currentUser.id || 1}
          />
        </Navbar.Section>
      )}

      <Divider opacity={0.2} />
      <Navbar.Section sx={{ display: 'flex', justifyContent: 'center', paddingTop: 12 }}>
        <MadeWith minimized={false} />
      </Navbar.Section>
    </Navbar>
  );
}
