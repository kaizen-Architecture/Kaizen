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
  IconLayoutDashboard,
  IconBooks,
  IconCalendarStats,
  IconPuzzle,
  IconSettings,
  IconUsers,
  IconLogout,
  IconChevronDown,
  IconChevronUp,
  IconPalette,
  IconBell,
  IconWorld,
  IconAdjustments,
  IconDownload,
  IconDatabaseImport,
  IconCode,
  IconCalendarPlus,
  IconBook,
  IconLinkOff,
} from '@tabler/icons-react';
import { getCookie, deleteCookie } from 'cookies-next';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppTheme } from '../theme/ThemeContext';
import { MadeWith } from './madeWith';
import { trpc } from '../utils/trpc';

interface KaizenNavbarProps {
  opened: boolean;
  setOpened: (opened: boolean) => void;
}

export function KaizenNavbar({ opened, setOpened }: KaizenNavbarProps) {
  const router = useRouter();
  const { t } = useTranslation('common');
  const { t: tSettings } = useTranslation('settings');
  const modals = useModals();
  const settings = trpc.settings.query.useQuery();

  const isAuthEnabled = (settings.data?.appConfig as any)?.authEnabled === true;
  const isApiEnabled = (settings.data?.appConfig as any)?.apiEnabled === true;
  const showUsersMenu = isAuthEnabled || isApiEnabled;

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

  const [settingsOpened, setSettingsOpened] = useState(false);

  useEffect(() => {
    if (router.pathname.startsWith('/settings')) {
      setSettingsOpened(true);
    }
  }, [router.pathname]);

  const navItems = [
    { label: t('nav.dashboard'), icon: IconLayoutDashboard, href: '/' },
    { label: t('nav.library'), icon: IconBooks, href: '/library' },
    { label: t('nav.planToRead', 'Plan para Leer'), icon: IconCalendarPlus, href: '/library?filter=planToRead' },
    { label: t('nav.planner'), icon: IconCalendarStats, href: '/scheduler' },
    { label: t('nav.sources'), icon: IconPuzzle, href: '/sources' },
    ...(showUsersMenu ? [{ label: t('nav.users', 'Cuentas'), icon: IconUsers, href: '/users' }] : []),
    { label: t('nav.guide', 'Guía de Usuario'), icon: IconBook, href: '/guide' },
  ];

  const settingsSubItems = [
    { value: 'general', label: tSettings('tabs.appearance'), icon: IconPalette },
    { value: 'notifications', label: tSettings('tabs.notifications'), icon: IconBell },
    { value: 'integrations', label: tSettings('tabs.integrations'), icon: IconWorld },
    { value: 'sources', label: tSettings('tabs.sourceRepository'), icon: IconPuzzle },
    { value: 'mangal', label: tSettings('tabs.mangalCore'), icon: IconAdjustments },
    { value: 'downloads', label: tSettings('tabs.downloads'), icon: IconDownload },
    { value: 'accounts', label: tSettings('tabs.accounts'), icon: IconUsers },
    { value: 'developer', label: tSettings('tabs.developer'), icon: IconCode },
    { value: 'maintenance', label: tSettings('tabs.maintenance'), icon: IconDatabaseImport },
  ];

  const handleNav = (href: string) => {
    router.push(href);
    setOpened(false); // cerrar al navegar en móvil
  };

  const handleSubNav = (tab: string) => {
    router.push(`/settings?tab=${tab}`);
    setOpened(false);
  };

  const handleSettingsToggle = () => {
    setSettingsOpened(!settingsOpened);
    if (!router.pathname.startsWith('/settings')) {
      router.push('/settings?tab=general');
    }
  };

  const isSettingsActive = router.pathname.startsWith('/settings');
  const activeTab = (router.query.tab as string) || 'general';
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
            const isActive = item.href === '/' ? router.pathname === '/' : router.pathname.startsWith(item.href);
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

          {/* Settings Collapsible Link */}
          <UnstyledButton
            onClick={handleSettingsToggle}
            sx={(theme) => ({
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              borderRadius: theme.radius.md,
              color: isSettingsActive
                ? theme.colorScheme === 'dark'
                  ? currentThemeConfig.colors.navbarItemActiveText.dark
                  : currentThemeConfig.colors.navbarItemActiveText.light
                : theme.colorScheme === 'dark'
                ? currentThemeConfig.colors.navbarText.dark
                : currentThemeConfig.colors.navbarText.light,
              backgroundColor: isSettingsActive
                ? theme.colorScheme === 'dark'
                  ? currentThemeConfig.colors.navbarItemActiveBg.dark
                  : currentThemeConfig.colors.navbarItemActiveBg.light
                : 'transparent',
              fontWeight: isSettingsActive ? 600 : 400,
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
            <Group spacing={12}>
              <IconSettings size={20} strokeWidth={isSettingsActive ? 2 : 1.5} />
              <Text>{t('nav.settings')}</Text>
            </Group>
            {settingsOpened ? <IconChevronUp size={16} opacity={0.7} /> : <IconChevronDown size={16} opacity={0.7} />}
          </UnstyledButton>

          {/* Settings Sub-items with smooth sliding motion */}
          <AnimatePresence initial={false}>
            {settingsOpened && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                style={{ overflow: 'hidden', paddingLeft: 12 }}
              >
                <Stack
                  spacing={2}
                  sx={(theme) => ({
                    borderLeft:
                      theme.colorScheme === 'dark'
                        ? '1px solid rgba(255, 255, 255, 0.15)'
                        : '1px solid rgba(0, 0, 0, 0.1)',
                    paddingLeft: 8,
                    marginTop: 4,
                    marginBottom: 4,
                  })}
                >
                  {settingsSubItems.map((subItem) => {
                    const isSubActive = isSettingsActive && activeTab === subItem.value;
                    return (
                      <UnstyledButton
                        key={subItem.value}
                        onClick={() => handleSubNav(subItem.value)}
                        sx={(theme) => ({
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '6px 10px',
                          borderRadius: theme.radius.sm,
                          color: isSubActive
                            ? theme.colorScheme === 'dark'
                              ? currentThemeConfig.colors.navbarItemActiveText.dark
                              : currentThemeConfig.colors.navbarItemActiveText.light
                            : theme.colorScheme === 'dark'
                            ? currentThemeConfig.colors.navbarTextDimmed.dark
                            : currentThemeConfig.colors.navbarTextDimmed.light,
                          backgroundColor: isSubActive
                            ? theme.colorScheme === 'dark'
                              ? 'rgba(255,255,255,0.08)'
                              : 'rgba(0,0,0,0.04)'
                            : 'transparent',
                          fontWeight: isSubActive ? 600 : 400,
                          fontSize: '13px',
                          transition: 'all 0.1s ease',
                          '&:hover': {
                            backgroundColor:
                              theme.colorScheme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                            color:
                              theme.colorScheme === 'dark'
                                ? currentThemeConfig.colors.navbarItemActiveText.dark
                                : currentThemeConfig.colors.navbarItemActiveText.light,
                          },
                        })}
                      >
                        <subItem.icon size={16} strokeWidth={isSubActive ? 2 : 1.5} />
                        <Text>{subItem.label}</Text>
                      </UnstyledButton>
                    );
                  })}
                </Stack>
              </motion.div>
            )}
          </AnimatePresence>
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
            <Group spacing="xs" sx={{ overflow: 'hidden', flex: 1 }}>
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
        </Navbar.Section>
      )}

      <Divider opacity={0.2} />
      <Navbar.Section sx={{ display: 'flex', justifyContent: 'center', paddingTop: 12 }}>
        <MadeWith minimized={false} />
      </Navbar.Section>
    </Navbar>
  );
}
