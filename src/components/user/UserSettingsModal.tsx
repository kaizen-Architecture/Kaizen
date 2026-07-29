import {
  Modal,
  Title,
  Text,
  Group,
  Button,
  Stack,
  Tabs,
  Switch,
  TextInput,
  PasswordInput,
  Anchor,
  Alert,
  Badge,
  Box,
  Breadcrumbs,
  Loader,
  SegmentedControl,
  Center,
  useMantineColorScheme,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconCheck,
  IconDownload,
  IconKey,
  IconLink,
  IconLock,
  IconPlug,
  IconUpload,
  IconUser,
  IconPalette,
} from '@tabler/icons-react';
import { useTranslation } from 'next-i18next';
import { setCookie } from 'cookies-next';
import { showNotification } from '@mantine/notifications';
import { useState, useEffect } from 'react';
import { trpc } from '../../utils/trpc';
import { useAppTheme } from '../../theme/ThemeContext';

interface UserSettingsModalProps {
  opened: boolean;
  onClose: () => void;
  userId: number;
}

export function UserSettingsModal({ opened, onClose, userId }: UserSettingsModalProps) {
  const { t } = useTranslation(['settings', 'common']);
  const { appTheme, setAppTheme } = useAppTheme();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();

  const userQuery = trpc.auth.getUserSettings.useQuery({ userId }, { enabled: opened && !!userId });
  const updateMutation = trpc.auth.updateUserSettings.useMutation();
  const updatePasswordMutation = trpc.auth.updateUserPassword.useMutation();
  const testMutation = trpc.auth.testUserAniListIntegration.useMutation();
  const syncMutation = trpc.auth.syncUserAniListProgress.useMutation();

  const [password, setPassword] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [clientIdInput, setClientIdInput] = useState('');

  const user = userQuery.data;

  useEffect(() => {
    if (user) {
      setTokenInput(user.anilistToken || '');
      setClientIdInput(user.anilistClientId || '');
    }
  }, [user]);

  const handleUpdate = async (key: string, value: any) => {
    try {
      await updateMutation.mutateAsync({ userId, key, value });
      await userQuery.refetch();
    } catch (err: any) {
      showNotification({
        title: t('common:error', 'Error'),
        message: err?.message || 'Failed to update setting',
        color: 'red',
      });
    }
  };

  const currentClientId = clientIdInput.trim() || '26692';
  const anilistOAuthUrl = `https://anilist.co/api/v2/oauth/authorize?client_id=${currentClientId}&response_type=token`;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group spacing="xs">
          <IconUser size={20} color="#339af0" />
          <Title order={4}>{t('userSettings.title', 'User Settings')}</Title>
        </Group>
      }
      size="lg"
      radius="md"
    >
      {userQuery.isLoading ? (
        <Center py="xl">
          <Loader size="md" color="indigo" />
        </Center>
      ) : !user ? (
        <Alert color="red" title="Error">
          User data not found
        </Alert>
      ) : (
        <Tabs defaultValue="anilist" radius="md">
          <Tabs.List mb="md">
            <Tabs.Tab value="anilist" icon={<IconPlug size={16} />}>
              {t('userSettings.tabs.anilist', 'AniList Integration')}
            </Tabs.Tab>
            <Tabs.Tab value="appearance" icon={<IconPalette size={16} />}>
              {t('tabs.appearance', 'Appearance')}
            </Tabs.Tab>
            <Tabs.Tab value="security" icon={<IconLock size={16} />}>
              {t('userSettings.tabs.security', 'Account & Security')}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="appearance" pt="xs">
            <Stack spacing="md">
              <Box>
                <Text size="sm" weight={600} mb={4}>
                  Color Scheme
                </Text>
                <SegmentedControl
                  value={colorScheme}
                  onChange={(val: any) => {
                    setCookie('follow-system', '0');
                    toggleColorScheme(val);
                  }}
                  data={[
                    { label: 'Light', value: 'light' },
                    { label: 'Dark', value: 'dark' },
                  ]}
                />
              </Box>
              <Box>
                <Text size="sm" weight={600} mb={4}>
                  App Theme
                </Text>
                <SegmentedControl
                  value={appTheme}
                  onChange={(val: any) => setAppTheme(val)}
                  data={[
                    { label: 'Kaizen', value: 'kaizen' },
                    { label: 'Default', value: 'default' },
                  ]}
                />
              </Box>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="anilist" pt="xs">
            <Stack spacing="md">
              <Group position="apart">
                <Box>
                  <Text size="sm" weight={600}>
                    {t('integrations.anilist.enabledLabel', 'Enable AniList Integration')}
                  </Text>
                  <Text size="xs" color="dimmed">
                    {t('integrations.anilist.enabledDesc', 'Track read progress across devices for your personal account')}
                  </Text>
                </Box>
                <Switch
                  checked={user.anilistEnabled}
                  onChange={(e) => handleUpdate('anilistEnabled', e.currentTarget.checked)}
                />
              </Group>

              {user.anilistEnabled && (
                <>
                  <TextInput
                    label={t('integrations.anilist.clientIdLabel', 'Client ID (Optional)')}
                    description={t('integrations.anilist.clientIdDesc', 'Your custom AniList API Client ID')}
                    placeholder="e.g. 26692"
                    value={clientIdInput}
                    onChange={(e) => setClientIdInput(e.currentTarget.value)}
                    onBlur={() => handleUpdate('anilistClientId', clientIdInput.trim())}
                  />

                  <PasswordInput
                    label={t('integrations.anilist.tokenLabel', 'Personal Access Token')}
                    description={
                      <span>
                        {t('integrations.anilist.tokenDesc', 'Generate a token on AniList.')}{' '}
                        <Anchor href={anilistOAuthUrl} target="_blank" rel="noopener noreferrer" size="xs">
                          {t('integrations.anilist.getTokenLink', 'Click here to generate your token')}
                        </Anchor>
                      </span>
                    }
                    placeholder="Paste token..."
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.currentTarget.value)}
                    onBlur={() => handleUpdate('anilistToken', tokenInput.replace(/\s+/g, ''))}
                  />

                  <Group position="apart">
                    <Box>
                      <Text size="sm" weight={600}>
                        {t('integrations.anilist.autoSyncLabel', 'Automatic Scrobbling')}
                      </Text>
                      <Text size="xs" color="dimmed">
                        {t('integrations.anilist.autoSyncDesc', 'Auto-update AniList when reading chapters in Kaizen')}
                      </Text>
                    </Box>
                    <Switch
                      checked={user.anilistAutoSync}
                      onChange={(e) => handleUpdate('anilistAutoSync', e.currentTarget.checked)}
                    />
                  </Group>

                  <Group spacing="xs" pt="xs">
                    <Button
                      size="xs"
                      variant="light"
                      color="blue"
                      loading={testMutation.isLoading}
                      onClick={async () => {
                        try {
                          const res = await testMutation.mutateAsync({ userId, customToken: tokenInput });
                          if (res.status === 'healthy' && res.username) {
                            await handleUpdate('anilistUsername', res.username);
                            showNotification({
                              title: t('integrations.anilist.testSuccessTitle', 'Connection Successful'),
                              message: t('integrations.anilist.testSuccessMsg', { username: res.username }),
                              color: 'teal',
                              icon: <IconCheck size={16} />,
                            });
                          } else {
                            showNotification({
                              title: t('integrations.anilist.testFailedTitle', 'Connection Failed'),
                              message: res.message || 'Error connecting to AniList',
                              color: 'red',
                            });
                          }
                        } catch (err: any) {
                          showNotification({
                            title: t('integrations.anilist.testFailedTitle', 'Connection Failed'),
                            message: err?.message || 'Connection test failed',
                            color: 'red',
                          });
                        }
                      }}
                    >
                      {t('integrations.anilist.testBtn', 'Test Connection')}
                    </Button>

                    <Button
                      size="xs"
                      variant="outline"
                      color="teal"
                      leftIcon={<IconDownload size={14} />}
                      loading={syncMutation.isLoading}
                      disabled={!user.anilistUsername}
                      onClick={async () => {
                        try {
                          const res = await syncMutation.mutateAsync({ userId, mode: 'import' });
                          showNotification({
                            title: t('integrations.anilist.syncSuccessTitle', 'Sync Complete'),
                            message: res.message,
                            color: 'teal',
                            icon: <IconCheck size={16} />,
                          });
                        } catch (err: any) {
                          showNotification({
                            title: t('integrations.anilist.syncFailedTitle', 'Sync Failed'),
                            message: err?.message || 'Failed to import progress',
                            color: 'red',
                          });
                        }
                      }}
                    >
                      {t('integrations.anilist.importBtn', 'Import Progress')}
                    </Button>

                    <Button
                      size="xs"
                      variant="outline"
                      color="indigo"
                      leftIcon={<IconUpload size={14} />}
                      loading={syncMutation.isLoading}
                      disabled={!user.anilistUsername}
                      onClick={async () => {
                        try {
                          const res = await syncMutation.mutateAsync({ userId, mode: 'export' });
                          showNotification({
                            title: t('integrations.anilist.syncSuccessTitle', 'Sync Complete'),
                            message: res.message,
                            color: 'teal',
                            icon: <IconCheck size={16} />,
                          });
                        } catch (err: any) {
                          showNotification({
                            title: t('integrations.anilist.syncFailedTitle', 'Sync Failed'),
                            message: err?.message || 'Failed to export progress',
                            color: 'red',
                          });
                        }
                      }}
                    >
                      {t('integrations.anilist.exportBtn', 'Export Progress')}
                    </Button>
                  </Group>

                  {user.anilistUsername && (
                    <Text size="xs" color="dimmed" pt={4}>
                      {t('integrations.anilist.usernameLabel', 'Username')}: <strong>@{user.anilistUsername}</strong>
                    </Text>
                  )}
                </>
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="security" pt="xs">
            <Stack spacing="md">
              <TextInput label={t('userSettings.username', 'Username')} value={user.username} disabled />
              <Badge color="violet" size="sm">
                Role: {user.role}
              </Badge>

              <PasswordInput
                label={t('userSettings.newPassword', 'New Password')}
                placeholder="Enter new password..."
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
              />

              <Button
                size="xs"
                color="indigo"
                disabled={!password || password.length < 3}
                loading={updatePasswordMutation.isLoading}
                onClick={async () => {
                  try {
                    await updatePasswordMutation.mutateAsync({ id: userId, newPassword: password });
                    setPassword('');
                    showNotification({
                      title: t('userSettings.passwordUpdated', 'Password Updated'),
                      message: 'Your password has been changed successfully.',
                      color: 'teal',
                      icon: <IconCheck size={16} />,
                    });
                  } catch (err: any) {
                    showNotification({
                      title: t('common:error', 'Error'),
                      message: err?.message || 'Failed to update password',
                      color: 'red',
                    });
                  }
                }}
              >
                {t('userSettings.updatePasswordBtn', 'Update Password')}
              </Button>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      )}
    </Modal>
  );
}
