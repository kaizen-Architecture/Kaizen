import { Alert, Box, Button, Group, SegmentedControl, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconAlertCircle, IconLock, IconUsers } from '@tabler/icons-react';
import { setCookie } from 'cookies-next';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { trpc } from '../../utils/trpc';

export function AuthSettings() {
  const { t } = useTranslation('settings');

  const settings = trpc.settings.query.useQuery();
  const update = trpc.settings.update.useMutation({
    onSuccess: () => {
      settings.refetch().then(() => {
        window.location.reload();
      });
    },
  });

  const authEnabledValue = (settings.data?.appConfig as any)?.authEnabled === true ? 'yes' : 'no';

  const handleAuthToggle = (val: string) => {
    const isEnabled = val === 'yes';
    if (isEnabled) {
      // Inyectar sesión inmediatamente para que el administrador activo no sea expulsado a Login
      setCookie('kaizen-session', JSON.stringify({ username: 'admin', role: 'admin' }), { path: '/' });
    }
    update.mutate({ updateType: 'app', key: 'authEnabled' as any, value: isEnabled });
  };

  if (settings.isLoading || !settings.data) return null;

  return (
    <Stack spacing="md" mt="xs">
      <Group spacing="sm">
        <ThemeIcon size={36} radius="md" color="violet" variant="light">
          <IconLock size={20} />
        </ThemeIcon>
        <Box>
          <Title order={5}>{t('auth.title', 'Authentication & Web Access Control')}</Title>
          <Text size="xs" color="dimmed">
            {t(
              'auth.desc',
              'Protect your web interface by requiring credentials and establish a secure environment with exclusive access.',
            )}
          </Text>
        </Box>
      </Group>

      <Stack spacing="xs">
        <Text size="xs" weight={500} color="dimmed">
          {t('auth.toggleLabel', 'Require Web Login')}
        </Text>
        <SegmentedControl
          fullWidth
          value={authEnabledValue}
          onChange={handleAuthToggle}
          disabled={update.isLoading}
          data={[
            { value: 'yes', label: t('auth.toggleEnabled', 'Enabled (Require Credentials)') },
            { value: 'no', label: t('auth.toggleDisabled', 'Disabled (Direct Access Without Login)') },
          ]}
        />
      </Stack>

      {authEnabledValue === 'yes' && (
        <Alert icon={<IconAlertCircle size={16} />} color="violet" radius="md" variant="light" mt="sm">
          <Text size="sm" weight={600} mb={4}>
            {t('auth.unlockedTitle', 'User Account Mode Unlocked!')}
          </Text>
          <Text size="xs">
            {t('auth.unlockedDesc', 'The Accounts section is now visible in the main navigation menu.')}
          </Text>
          <Text size="xs" mt={4}>
            💡{' '}
            {t('auth.unlockedDefault', 'Default User: {{user}} | Password: {{pass}}', {
              user: 'admin',
              pass: 'admin',
            })}
          </Text>
          <Text size="xs" color="dimmed" mt={6} sx={{ fontStyle: 'italic' }}>
            ⚠️{' '}
            {t(
              'auth.unlockedWarning',
              'We highly recommend visiting the Accounts section to change the default password upon first reload or add users with custom roles.',
            )}
          </Text>

          <Button
            component={Link}
            href="/users"
            variant="filled"
            color="violet"
            size="xs"
            mt="md"
            leftIcon={<IconUsers size={16} />}
          >
            {t('auth.manageUsersBtn', 'Manage User Accounts & Notifications')}
          </Button>
        </Alert>
      )}
    </Stack>
  );
}
