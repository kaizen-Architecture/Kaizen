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
  Divider,
  Paper,
  Select,
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
  IconBell,
  IconBrandWhatsapp,
  IconBrandDiscord,
  IconBrandTelegram,
  IconCopy,
  IconLanguage,
  IconSend,
} from '@tabler/icons-react';
import { useTranslation } from 'next-i18next';
import { showNotification } from '@mantine/notifications';
import { useState, useEffect } from 'react';
import { trpc } from '../../utils/trpc';
import { useAppTheme } from '../../theme/ThemeContext';

interface UserSettingsModalProps {
  opened: boolean;
  onClose: () => void;
  userId: number;
  initialTab?: string;
}

export function UserSettingsModal({ opened, onClose, userId, initialTab }: UserSettingsModalProps) {
  const { t } = useTranslation(['settings', 'common']);
  const { appTheme, setAppTheme } = useAppTheme();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();

  const userQuery = trpc.auth.getUserSettings.useQuery({ userId }, { enabled: opened && !!userId });
  const updateMutation = trpc.auth.updateUserSettings.useMutation();
  const updatePasswordMutation = trpc.auth.updateUserPassword.useMutation();
  const testMutation = trpc.auth.testUserAniListIntegration.useMutation();
  const syncMutation = trpc.auth.syncUserAniListProgress.useMutation();
  const testChannelMutation = trpc.auth.testUserNotificationChannel.useMutation();
  const copyServerMutation = trpc.auth.copyServerNotificationSettings.useMutation();

  const [password, setPassword] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [clientIdInput, setClientIdInput] = useState('');

  // Notification local inputs
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [whatsappApiKey, setWhatsappApiKey] = useState('');
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');

  const user = userQuery.data;

  useEffect(() => {
    if (user) {
      setTokenInput(user.anilistToken || '');
      setClientIdInput(user.anilistClientId || '');
      setWhatsappPhone(user.whatsappPhone || '');
      setWhatsappApiKey(user.whatsappApiKey || '');
      setDiscordWebhookUrl(user.discordWebhookUrl || '');
      setTelegramChatId(user.telegramChatId || '');
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

  const handleTestChannel = async (channel: 'whatsapp' | 'discord' | 'telegram', config: any) => {
    try {
      const res = await testChannelMutation.mutateAsync({ channel, config });
      if (res.success) {
        showNotification({
          title: t('common:success', 'Éxito'),
          message: res.message,
          color: 'teal',
          icon: <IconCheck size={16} />,
        });
      } else {
        showNotification({
          title: t('common:error', 'Error'),
          message: res.message,
          color: 'red',
          icon: <IconAlertCircle size={16} />,
        });
      }
    } catch (err: any) {
      showNotification({
        title: t('common:error', 'Error'),
        message: err.message,
        color: 'red',
      });
    }
  };

  const handleToggleEvent = async (eventKey: string) => {
    const currentEvents: string[] = user?.notifyEvents || [];
    const nextEvents = currentEvents.includes(eventKey)
      ? currentEvents.filter((e) => e !== eventKey)
      : [...currentEvents, eventKey];
    await handleUpdate('notifyEvents', nextEvents);
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
        <Tabs defaultValue={initialTab || 'anilist'} radius="md">
          <Tabs.List
            mb="md"
            sx={{
              flexWrap: 'nowrap',
              overflowX: 'auto',
              maxWidth: '100%',
              '& .mantine-Tabs-tab': {
                whiteSpace: 'nowrap',
                flexShrink: 0,
              },
            }}
          >
            <Tabs.Tab value="anilist" icon={<IconPlug size={16} />}>
              {t('userSettings.tabs.anilist', 'AniList Integration')}
            </Tabs.Tab>
            <Tabs.Tab value="notifications" icon={<IconBell size={16} />}>
              {t('userSettings.tabs.notifications', 'Notifications')}
            </Tabs.Tab>
            <Tabs.Tab value="appearance" icon={<IconPalette size={16} />}>
              {t('tabs.appearance', 'Appearance')}
            </Tabs.Tab>
            <Tabs.Tab value="security" icon={<IconLock size={16} />}>
              {t('userSettings.tabs.security', 'Account & Security')}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="notifications" pt="xs">
            <Stack spacing="md">
              {user.notificationsEnabled === false && (
                <Alert
                  icon={<IconAlertCircle size={18} />}
                  color="orange"
                  variant="filled"
                  radius="md"
                  title={t('userSettings.notifications.disabledByAdminTitle', 'Notifications Disabled by Administration')}
                >
                  <Text size="xs">
                    {t(
                      'userSettings.notifications.disabledByAdminDesc',
                      'An administrator has disabled notifications for your account in user management. You will not receive alerts until re-enabled.',
                    )}
                  </Text>
                </Alert>
              )}
              {/* Superadmin Server Credentials Sync Helper */}
              {user.role === 'SUPERADMIN' && (
                <Paper p="xs" withBorder radius="md" sx={{ background: 'rgba(99, 102, 241, 0.05)' }}>
                  <Group position="apart" noWrap align="center">
                    <Box sx={{ flex: 1, minWidth: 0, pr: 'xs' }}>
                      <Text size="xs" weight={600} color="indigo">
                        {t('userSettings.notifications.serverSyncTitle', 'Global Server Sync')}
                      </Text>
                      <Text size="11px" color="dimmed">
                        {t(
                          'userSettings.notifications.serverSyncDesc',
                          'As a Superadmin, you can import channels already configured in Management.',
                        )}
                      </Text>
                    </Box>
                    <Button
                      size="xs"
                      variant="light"
                      color="indigo"
                      sx={{ flexShrink: 0 }}
                      leftIcon={<IconCopy size={14} />}
                      loading={copyServerMutation.isLoading}
                      onClick={async () => {
                        await copyServerMutation.mutateAsync({ userId });
                        await userQuery.refetch();
                        showNotification({
                          title: t('common:success', 'Success'),
                          message: t(
                            'userSettings.notifications.serverSyncSuccess',
                            'Server notification settings copied to your profile.',
                          ),
                          color: 'teal',
                        });
                      }}
                    >
                      {t('userSettings.notifications.serverSyncBtn', 'Copy Server Settings')}
                    </Button>
                  </Group>
                </Paper>
              )}

              {/* Language Preference */}
              <Group
                position="apart"
                noWrap
                align="center"
                p="xs"
                sx={{
                  width: '100%',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <Box sx={{ flex: 1, minWidth: 200, pr: 'xs' }}>
                  <Text size="xs" weight={600}>
                    {t('userSettings.notifications.langLabel', 'Notification Language')}
                  </Text>
                  <Text size="xs" color="dimmed">
                    {t(
                      'userSettings.notifications.langDesc',
                      'Choose which language you prefer for personal alerts and digests.',
                    )}
                  </Text>
                </Box>
                <Select
                  size="xs"
                  sx={{ width: 140, flexShrink: 0 }}
                  value={(user as any).language || 'es'}
                  onChange={(val) => val && handleUpdate('language', val)}
                  data={[
                    { value: 'es', label: '🇪🇸 Español' },
                    { value: 'en', label: '🇬🇧 English' },
                  ]}
                  icon={<IconLanguage size={14} />}
                />
              </Group>

              <Box>
                <Text size="sm" weight={600}>
                  {t('userSettings.notifications.channelsTitle', 'Your Communication Channels')}
                </Text>
                <Text size="xs" color="dimmed">
                  {t('userSettings.notifications.desc', 'Receive direct mobile alerts when important events occur in Kaizen.')}
                </Text>
              </Box>

              {/* WhatsApp CallMeBot Card */}
              <Paper p="sm" withBorder radius="md" sx={{ background: 'rgba(34, 197, 94, 0.03)' }}>
                <Group position="apart" noWrap align="center" mb="xs">
                  <Group spacing="xs" noWrap sx={{ flex: 1, minWidth: 0 }}>
                    <IconBrandWhatsapp size={18} color="#22C55E" />
                    <Text size="sm" weight={600} sx={{ whiteSpace: 'nowrap' }}>
                      {t('userSettings.notifications.whatsappTitle', 'WhatsApp (CallMeBot)')}
                    </Text>
                    {user.role === 'SUPERADMIN' && !user.whatsappPhone && (user as any).serverConfig?.whatsappPhone && (
                      <Badge size="xs" color="teal" variant="light" sx={{ flexShrink: 0 }}>
                        {t('userSettings.notifications.inheritingServer', 'Inherits from Server:')} {(user as any).serverConfig.whatsappPhone}
                      </Badge>
                    )}
                  </Group>
                  <Switch
                    sx={{ flexShrink: 0 }}
                    checked={user.whatsappEnabled}
                    onChange={(e) => handleUpdate('whatsappEnabled', e.currentTarget.checked)}
                  />
                </Group>
                <Text size="xs" color="dimmed" mb="sm">
                  {t('userSettings.notifications.whatsappDesc', 'Send direct alerts to your personal WhatsApp without configuring servers.')}
                </Text>

                {user.whatsappEnabled && (
                  <Stack spacing="xs">
                    <TextInput
                      size="xs"
                      label={t('userSettings.notifications.whatsappPhone', 'Phone Number (+34...)')}
                      placeholder="+34600000000"
                      value={whatsappPhone}
                      onChange={(e) => setWhatsappPhone(e.currentTarget.value)}
                      onBlur={() => handleUpdate('whatsappPhone', whatsappPhone.trim())}
                    />
                    <PasswordInput
                      size="xs"
                      label={t('userSettings.notifications.whatsappApiKey', 'CallMeBot API Key')}
                      placeholder="apikey..."
                      value={whatsappApiKey}
                      onChange={(e) => setWhatsappApiKey(e.currentTarget.value)}
                      onBlur={() => handleUpdate('whatsappApiKey', whatsappApiKey.trim())}
                    />
                    <Button
                      size="xs"
                      variant="light"
                      color="teal"
                      leftIcon={<IconSend size={14} />}
                      loading={testChannelMutation.isLoading}
                      onClick={() => handleTestChannel('whatsapp', { phone: whatsappPhone, apiKey: whatsappApiKey })}
                    >
                      {t('userSettings.notifications.testBtn', 'Test Channel')}
                    </Button>
                  </Stack>
                )}
              </Paper>

              {/* Discord Webhook Card */}
              <Paper p="sm" withBorder radius="md" sx={{ background: 'rgba(99, 102, 241, 0.03)' }}>
                <Group position="apart" noWrap align="center" mb="xs">
                  <Group spacing="xs" noWrap sx={{ flex: 1, minWidth: 0 }}>
                    <IconBrandDiscord size={18} color="#6366F1" />
                    <Text size="sm" weight={600} sx={{ whiteSpace: 'nowrap' }}>
                      {t('userSettings.notifications.discordTitle', 'Discord Webhook')}
                    </Text>
                    {user.role === 'SUPERADMIN' && !user.discordWebhookUrl && (user as any).serverConfig?.discordWebhookUrl && (
                      <Badge size="xs" color="indigo" variant="light" sx={{ flexShrink: 0 }}>
                        {t('userSettings.notifications.inheritingServerDiscord', 'Inherits Server Discord Webhook')}
                      </Badge>
                    )}
                  </Group>
                  <Switch
                    sx={{ flexShrink: 0 }}
                    checked={user.discordEnabled}
                    onChange={(e) => handleUpdate('discordEnabled', e.currentTarget.checked)}
                  />
                </Group>
                <Text size="xs" color="dimmed" mb="sm">
                  {t('userSettings.notifications.discordDesc', 'Receive styled embeds in your private Discord channel.')}
                </Text>

                {user.discordEnabled && (
                  <Stack spacing="xs">
                    <TextInput
                      size="xs"
                      label={t('userSettings.notifications.discordWebhookUrl', 'Discord Webhook URL')}
                      placeholder="https://discord.com/api/webhooks/..."
                      value={discordWebhookUrl}
                      onChange={(e) => setDiscordWebhookUrl(e.currentTarget.value)}
                      onBlur={() => handleUpdate('discordWebhookUrl', discordWebhookUrl.trim())}
                    />
                    <Button
                      size="xs"
                      variant="light"
                      color="indigo"
                      leftIcon={<IconSend size={14} />}
                      loading={testChannelMutation.isLoading}
                      onClick={() => handleTestChannel('discord', { webhookUrl: discordWebhookUrl })}
                    >
                      {t('userSettings.notifications.testBtn', 'Test Channel')}
                    </Button>
                  </Stack>
                )}
              </Paper>

              {/* Telegram Card */}
              <Paper p="sm" withBorder radius="md" sx={{ background: 'rgba(14, 165, 233, 0.03)' }}>
                <Group position="apart" noWrap align="center" mb="xs">
                  <Group spacing="xs" noWrap sx={{ flex: 1, minWidth: 0 }}>
                    <IconBrandTelegram size={18} color="#0EA5E9" />
                    <Text size="sm" weight={600} sx={{ whiteSpace: 'nowrap' }}>
                      {t('userSettings.notifications.telegramTitle', 'Telegram Bot')}
                    </Text>
                  </Group>
                  <Switch
                    sx={{ flexShrink: 0 }}
                    checked={user.telegramEnabled}
                    onChange={(e) => handleUpdate('telegramEnabled', e.currentTarget.checked)}
                  />
                </Group>
                <Text size="xs" color="dimmed" mb="sm">
                  {t('userSettings.notifications.telegramDesc', "Receive notifications through the server's Telegram bot.")}
                </Text>

                {user.telegramEnabled && (
                  <Stack spacing="xs">
                    <TextInput
                      size="xs"
                      label={t('userSettings.notifications.telegramChatId', 'Your Telegram Chat ID')}
                      placeholder="123456789"
                      value={telegramChatId}
                      onChange={(e) => setTelegramChatId(e.currentTarget.value)}
                      onBlur={() => handleUpdate('telegramChatId', telegramChatId.trim())}
                    />
                  </Stack>
                )}
              </Paper>

              <Divider my="xs" />

              {/* Event Subscriptions */}
              <Box>
                <Text size="sm" weight={600} mb={4}>
                  {t('userSettings.notifications.eventsTitle', 'Subscribed Events')}
                </Text>
                <Text size="xs" color="dimmed" mb="md">
                  {t('userSettings.notifications.eventsDesc', 'Select which notifications you want to receive on your active channels.')}
                </Text>
              </Box>

              <Stack spacing="xs">
                {/* Manga Request Available */}
                <Group position="apart" noWrap align="center" p="xs" sx={{ borderBottom: '1px solid rgba(255,255,255,0.06)', width: '100%' }}>
                  <Box sx={{ flex: 1, minWidth: 0, pr: 'sm' }}>
                    <Text size="xs" weight={600}>
                      {t('userSettings.notifications.eventMangaRequest', 'Requested Manga Available')}
                    </Text>
                    <Text size="xs" color="dimmed">
                      {t('userSettings.notifications.eventMangaRequestDesc', 'Alerts you when a manga you requested is downloaded and ready to read.')}
                    </Text>
                  </Box>
                  <Switch
                    sx={{ flexShrink: 0 }}
                    checked={(user.notifyEvents || []).includes('MANGA_REQUEST_AVAILABLE')}
                    onChange={() => handleToggleEvent('MANGA_REQUEST_AVAILABLE')}
                  />
                </Group>

                {/* Favorite Chapter Downloaded */}
                <Group position="apart" noWrap align="center" p="xs" sx={{ borderBottom: '1px solid rgba(255,255,255,0.06)', width: '100%' }}>
                  <Box sx={{ flex: 1, minWidth: 0, pr: 'sm' }}>
                    <Text size="xs" weight={600}>
                      {t('userSettings.notifications.eventFavoriteChapter', 'New Chapter from Favorite Manga')}
                    </Text>
                    <Text size="xs" color="dimmed">
                      {t('userSettings.notifications.eventFavoriteChapterDesc', 'Alerts you when a new chapter of any of your favorited series is downloaded.')}
                    </Text>
                  </Box>
                  <Switch
                    sx={{ flexShrink: 0 }}
                    checked={(user.notifyEvents || []).includes('FAVORITE_CHAPTER_DOWNLOADED')}
                    onChange={() => handleToggleEvent('FAVORITE_CHAPTER_DOWNLOADED')}
                  />
                </Group>

                {/* Admin/Manager exclusive events */}
                {(user.role === 'SUPERADMIN' || user.role === 'MANAGER') && (
                  <>
                    <Text size="xs" weight={700} color="violet" mt="sm">
                      {t('userSettings.notifications.adminEventsTitle', 'Management & Server Events')}
                    </Text>

                    {/* Source Deactivated */}
                    <Group position="apart" noWrap align="center" p="xs" sx={{ borderBottom: '1px solid rgba(255,255,255,0.06)', width: '100%' }}>
                      <Box sx={{ flex: 1, minWidth: 0, pr: 'sm' }}>
                        <Text size="xs" weight={600} color="orange">
                          {t('userSettings.notifications.eventSourceDeactivated', 'Source Auto-Deactivated')}
                        </Text>
                        <Text size="xs" color="dimmed">
                          {t('userSettings.notifications.eventSourceDeactivatedDesc', 'Immediate alert if a scraper fails 5 consecutive times and gets disabled.')}
                        </Text>
                      </Box>
                      <Switch
                        sx={{ flexShrink: 0 }}
                        checked={(user.notifyEvents || []).includes('SOURCE_DEACTIVATED')}
                        onChange={() => handleToggleEvent('SOURCE_DEACTIVATED')}
                      />
                    </Group>

                    {/* Download Failed */}
                    <Group position="apart" noWrap align="center" p="xs" sx={{ borderBottom: '1px solid rgba(255,255,255,0.06)', width: '100%' }}>
                      <Box sx={{ flex: 1, minWidth: 0, pr: 'sm' }}>
                        <Text size="xs" weight={600} color="red">
                          {t('userSettings.notifications.eventDownloadFailed', 'Chapter Download Failed')}
                        </Text>
                        <Text size="xs" color="dimmed">
                          {t('userSettings.notifications.eventDownloadFailedDesc', 'Alert if a chapter fails download or archive integrity is corrupted.')}
                        </Text>
                      </Box>
                      <Switch
                        sx={{ flexShrink: 0 }}
                        checked={(user.notifyEvents || []).includes('CHAPTER_DOWNLOAD_FAILED')}
                        onChange={() => handleToggleEvent('CHAPTER_DOWNLOAD_FAILED')}
                      />
                    </Group>

                    {/* New Manga Request */}
                    <Group position="apart" noWrap align="center" p="xs" sx={{ borderBottom: '1px solid rgba(255,255,255,0.06)', width: '100%' }}>
                      <Box sx={{ flex: 1, minWidth: 0, pr: 'sm' }}>
                        <Text size="xs" weight={600}>
                          {t('userSettings.notifications.eventNewMangaRequest', 'New Manga Request')}
                        </Text>
                        <Text size="xs" color="dimmed">
                          {t('userSettings.notifications.eventNewMangaRequestDesc', 'Alert when a reader creates a new manga request.')}
                        </Text>
                      </Box>
                      <Switch
                        sx={{ flexShrink: 0 }}
                        checked={(user.notifyEvents || []).includes('NEW_MANGA_REQUEST')}
                        onChange={() => handleToggleEvent('NEW_MANGA_REQUEST')}
                      />
                    </Group>

                    {/* Server Error */}
                    <Group position="apart" noWrap align="center" p="xs" sx={{ width: '100%' }}>
                      <Box sx={{ flex: 1, minWidth: 0, pr: 'sm' }}>
                        <Text size="xs" weight={600}>
                          {t('userSettings.notifications.eventServerError', 'Critical Server Errors')}
                        </Text>
                        <Text size="xs" color="dimmed">
                          {t('userSettings.notifications.eventServerErrorDesc', 'Alerts about severe system exceptions.')}
                        </Text>
                      </Box>
                      <Switch
                        sx={{ flexShrink: 0 }}
                        checked={(user.notifyEvents || []).includes('SERVER_CRITICAL_ERROR')}
                        onChange={() => handleToggleEvent('SERVER_CRITICAL_ERROR')}
                      />
                    </Group>
                  </>
                )}
              </Stack>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="appearance" pt="xs">
            <Stack spacing="md">
              <Box>
                <Text size="sm" weight={600} mb={4}>
                  Color Scheme
                </Text>
                <SegmentedControl
                  value={colorScheme}
                  onChange={(val: any) => toggleColorScheme(val)}
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
              <Group position="apart" noWrap align="center" sx={{ width: '100%' }}>
                <Box sx={{ flex: 1, minWidth: 200, pr: 'xs' }}>
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

                  <Group position="apart" noWrap align="center" sx={{ width: '100%' }}>
                    <Box sx={{ flex: 1, minWidth: 200, pr: 'xs' }}>
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
