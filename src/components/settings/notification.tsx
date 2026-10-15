import {
  Accordion,
  Alert,
  Anchor,
  Badge,
  Box,
  Breadcrumbs,
  Button,
  createStyles,
  Group,
  PasswordInput,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconBell,
  IconBrandDiscord,
  IconBrandTelegram,
  IconBrandWhatsapp,
  IconCheck,
  IconInfoCircle,
  IconSend,
} from '@tabler/icons-react';
import Image from 'next/image';
import { useTranslation } from 'next-i18next';
import { showNotification } from '@mantine/notifications';
import { useState } from 'react';
import { trpc } from '../../utils/trpc';
import { ArrayItem } from './mangal';

const useStyles = createStyles((theme) => ({
  item: {
    paddingTop: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    borderTop: `1px solid ${theme.colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[2]}`,
  },

  switch: {
    '& *': {
      cursor: 'pointer',
    },
  },

  textInput: {
    minWidth: 260,
    maxWidth: 450,
    width: '100%',
  },

  title: {
    lineHeight: 1,
  },
}));

export function NotificationSettings() {
  const { classes } = useStyles();
  const { t } = useTranslation('settings');
  const update = trpc.settings.update.useMutation();
  const settings = trpc.settings.query.useQuery();
  const testMutation = trpc.settings.testNotification.useMutation();

  const [testingChannel, setTestingChannel] = useState<'whatsapp' | 'discord' | 'telegram' | null>(null);

  // Local state for responsive text editing before blur
  const [whatsappPhone, setWhatsappPhone] = useState<string>('');
  const [whatsappApiKey, setWhatsappApiKey] = useState<string>('');
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState<string>('');
  const [telegramToken, setTelegramToken] = useState<string>('');
  const [telegramChatId, setTelegramChatId] = useState<string>('');
  const [appriseHost, setAppriseHost] = useState<string>('');

  // Sync state once query data loads
  const appConfig = settings.data?.appConfig;

  const handleUpdate = async (key: string, value: boolean | string | number | string[]) => {
    try {
      await update.mutateAsync({
        key: key as any,
        value,
        updateType: 'app',
      });
      await settings.refetch();
    } catch (err: any) {
      showNotification({
        title: 'Error',
        message: err?.message || 'Error updating settings',
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
    }
  };

  const handleTestChannel = async (channel: 'whatsapp' | 'discord' | 'telegram') => {
    setTestingChannel(channel);
    try {
      const configPayload: Record<string, any> = {};
      if (channel === 'whatsapp') {
        configPayload.phone = whatsappPhone || appConfig?.whatsappPhone;
        configPayload.apiKey = whatsappApiKey || appConfig?.whatsappApiKey;
      } else if (channel === 'discord') {
        configPayload.webhookUrl = discordWebhookUrl || appConfig?.discordWebhookUrl;
      } else if (channel === 'telegram') {
        configPayload.token = telegramToken || appConfig?.telegramToken;
        configPayload.chatId = telegramChatId || appConfig?.telegramChatId;
      }

      const res = await testMutation.mutateAsync({
        channel,
        config: configPayload,
      });

      if (res && res.success) {
        showNotification({
          title: t('adminNotifications.testSuccess', 'Test notification sent successfully!'),
          message: res.message || 'Check your device to verify delivery.',
          color: 'teal',
          icon: <IconCheck size={16} />,
        });
      } else {
        showNotification({
          title: t('adminNotifications.testFailed', 'Failed to send test notification'),
          message: res?.message || 'Check credentials and retry.',
          color: 'red',
          icon: <IconAlertCircle size={16} />,
        });
      }
    } catch (err: any) {
      showNotification({
        title: t('adminNotifications.testFailed', 'Failed to send test notification'),
        message: err?.message || 'Unknown network error.',
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
    } finally {
      setTestingChannel(null);
    }
  };

  if (settings.isLoading || !settings.data) {
    return null;
  }

  return (
    <Stack spacing="md">
      <Alert icon={<IconInfoCircle size={18} />} title={t('adminNotifications.bannerTitle', 'System Alerts & Remote Dispatch')} color="indigo" variant="light" radius="md">
        <Text size="xs" sx={{ lineHeight: 1.5 }}>
          {t(
            'adminNotifications.bannerDesc',
            'Configure global server notification channels to receive real-time alerts when scrapers fail 5 consecutive times, chapter downloads fail, or critical system events occur. Readers and managers can also configure personalized notifications in User Settings.',
          )}
        </Text>
      </Alert>

      <Accordion variant="contained" radius="md" defaultValue="whatsapp">
        {/* ─── WHATSAPP (CALLMEBOT) ─── */}
        <Accordion.Item value="whatsapp">
          <Accordion.Control icon={<IconBrandWhatsapp size={22} color="#25D366" />}>
            <Group position="apart" pr="md">
              <Group spacing="xs">
                <Text weight={500}>{t('adminNotifications.whatsappTitle', 'WhatsApp (CallMeBot)')}</Text>
                {appConfig?.whatsappEnabled ? (
                  <Badge color="teal" size="xs" variant="filled">
                    {t('adminNotifications.statusActive', 'Active')}
                  </Badge>
                ) : (
                  <Badge color="gray" size="xs" variant="outline">
                    {t('adminNotifications.statusInactive', 'Disabled')}
                  </Badge>
                )}
              </Group>
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <Text size="xs" color="dimmed" mb="md">
              {t('adminNotifications.whatsappDesc', 'Send direct alerts to WhatsApp without running dedicated bots.')}
            </Text>

            <Group position="apart" className={classes.item} spacing="xl" noWrap>
              <Box>
                <Breadcrumbs separator="/" styles={{ breadcrumb: { fontSize: 13, fontWeight: 500 } }}>
                  {t('adminNotifications.enabled', 'Enabled')}
                </Breadcrumbs>
                <Text size="xs" color="dimmed">
                  {t('adminNotifications.whatsappDesc', 'Enable WhatsApp notifications')}
                </Text>
              </Box>
              <Switch
                className={classes.switch}
                checked={appConfig?.whatsappEnabled ?? false}
                onChange={(e) => handleUpdate('whatsappEnabled', e.currentTarget.checked)}
              />
            </Group>

            <Group position="apart" className={classes.item} spacing="xl" noWrap>
              <Box>
                <Breadcrumbs separator="/" styles={{ breadcrumb: { fontSize: 13, fontWeight: 500 } }}>
                  {t('adminNotifications.whatsappPhone', 'Phone Number')}
                </Breadcrumbs>
                <Text size="xs" color="dimmed">
                  {t('adminNotifications.whatsappPhoneDesc', 'Phone number with international country code (e.g. +34...)')}
                </Text>
              </Box>
              <TextInput
                size="xs"
                className={classes.textInput}
                placeholder={t('adminNotifications.whatsappPhonePlaceholder', '+34612345678')}
                value={whatsappPhone || appConfig?.whatsappPhone || ''}
                onChange={(e) => setWhatsappPhone(e.currentTarget.value)}
                onBlur={() => {
                  if (whatsappPhone !== (appConfig?.whatsappPhone || '')) {
                    handleUpdate('whatsappPhone', whatsappPhone);
                  }
                }}
              />
            </Group>

            <Group position="apart" className={classes.item} spacing="xl" noWrap>
              <Box>
                <Breadcrumbs separator="/" styles={{ breadcrumb: { fontSize: 13, fontWeight: 500 } }}>
                  {t('adminNotifications.whatsappApiKey', 'CallMeBot API Key')}
                </Breadcrumbs>
                <Text size="xs" color="dimmed">
                  {t('adminNotifications.whatsappApiKeyDesc', 'API key obtained from CallMeBot on WhatsApp')}
                </Text>
              </Box>
              <PasswordInput
                size="xs"
                className={classes.textInput}
                placeholder="CallMeBot API Key"
                value={whatsappApiKey || appConfig?.whatsappApiKey || ''}
                onChange={(e) => setWhatsappApiKey(e.currentTarget.value)}
                onBlur={() => {
                  if (whatsappApiKey !== (appConfig?.whatsappApiKey || '')) {
                    handleUpdate('whatsappApiKey', whatsappApiKey);
                  }
                }}
              />
            </Group>

            <Group position="apart" className={classes.item} pt="md">
              <Anchor
                href="https://www.callmebot.com/blog/free-api-whatsapp-messages/"
                target="_blank"
                rel="noreferrer"
                size="xs"
                color="dimmed"
              >
                {t('adminNotifications.whatsappHelp', 'Get free CallMeBot API Key (open tutorial)')}
              </Anchor>
              <Button
                size="xs"
                variant="light"
                color="teal"
                leftIcon={<IconSend size={14} />}
                loading={testingChannel === 'whatsapp'}
                disabled={!appConfig?.whatsappPhone && !whatsappPhone}
                onClick={() => handleTestChannel('whatsapp')}
              >
                {t('adminNotifications.testBtn', 'Test WhatsApp Channel')}
              </Button>
            </Group>
          </Accordion.Panel>
        </Accordion.Item>

        {/* ─── DISCORD (WEBHOOK) ─── */}
        <Accordion.Item value="discord">
          <Accordion.Control icon={<IconBrandDiscord size={22} color="#5865F2" />}>
            <Group position="apart" pr="md">
              <Group spacing="xs">
                <Text weight={500}>{t('adminNotifications.discordTitle', 'Discord Webhook')}</Text>
                {appConfig?.discordEnabled ? (
                  <Badge color="indigo" size="xs" variant="filled">
                    {t('adminNotifications.statusActive', 'Active')}
                  </Badge>
                ) : (
                  <Badge color="gray" size="xs" variant="outline">
                    {t('adminNotifications.statusInactive', 'Disabled')}
                  </Badge>
                )}
              </Group>
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <Text size="xs" color="dimmed" mb="md">
              {t('adminNotifications.discordDesc', 'Send structured alert cards to a Discord channel via webhook.')}
            </Text>

            <Group position="apart" className={classes.item} spacing="xl" noWrap>
              <Box>
                <Breadcrumbs separator="/" styles={{ breadcrumb: { fontSize: 13, fontWeight: 500 } }}>
                  {t('adminNotifications.enabled', 'Enabled')}
                </Breadcrumbs>
                <Text size="xs" color="dimmed">
                  {t('adminNotifications.discordDesc', 'Enable Discord notifications')}
                </Text>
              </Box>
              <Switch
                className={classes.switch}
                checked={appConfig?.discordEnabled ?? false}
                onChange={(e) => handleUpdate('discordEnabled', e.currentTarget.checked)}
              />
            </Group>

            <Group position="apart" className={classes.item} spacing="xl" noWrap>
              <Box>
                <Breadcrumbs separator="/" styles={{ breadcrumb: { fontSize: 13, fontWeight: 500 } }}>
                  {t('adminNotifications.discordWebhookUrl', 'Discord Webhook URL')}
                </Breadcrumbs>
                <Text size="xs" color="dimmed">
                  {t('adminNotifications.discordWebhookUrlDesc', 'Incoming webhook URL created in your Discord channel integration settings')}
                </Text>
              </Box>
              <TextInput
                size="xs"
                className={classes.textInput}
                placeholder={t('adminNotifications.discordWebhookUrlPlaceholder', 'https://discord.com/api/webhooks/...')}
                value={discordWebhookUrl || appConfig?.discordWebhookUrl || ''}
                onChange={(e) => setDiscordWebhookUrl(e.currentTarget.value)}
                onBlur={() => {
                  if (discordWebhookUrl !== (appConfig?.discordWebhookUrl || '')) {
                    handleUpdate('discordWebhookUrl', discordWebhookUrl);
                  }
                }}
              />
            </Group>

            <Group position="right" className={classes.item} pt="md">
              <Button
                size="xs"
                variant="light"
                color="indigo"
                leftIcon={<IconSend size={14} />}
                loading={testingChannel === 'discord'}
                disabled={!appConfig?.discordWebhookUrl && !discordWebhookUrl}
                onClick={() => handleTestChannel('discord')}
              >
                {t('adminNotifications.testBtn', 'Test Discord Webhook')}
              </Button>
            </Group>
          </Accordion.Panel>
        </Accordion.Item>

        {/* ─── TELEGRAM ─── */}
        <Accordion.Item value="telegram">
          <Accordion.Control icon={<IconBrandTelegram size={22} color="#0088cc" />}>
            <Group position="apart" pr="md">
              <Group spacing="xs">
                <Text weight={500}>{t('adminNotifications.telegramTitle', 'Telegram Bot')}</Text>
                {appConfig?.telegramEnabled ? (
                  <Badge color="blue" size="xs" variant="filled">
                    {t('adminNotifications.statusActive', 'Active')}
                  </Badge>
                ) : (
                  <Badge color="gray" size="xs" variant="outline">
                    {t('adminNotifications.statusInactive', 'Disabled')}
                  </Badge>
                )}
              </Group>
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <Text size="xs" color="dimmed" mb="md">
              {t('adminNotifications.telegramDesc', 'Send notifications using a dedicated Telegram bot.')}
            </Text>

            <Group position="apart" className={classes.item} spacing="xl" noWrap>
              <Box>
                <Breadcrumbs separator="/" styles={{ breadcrumb: { fontSize: 13, fontWeight: 500 } }}>
                  {t('adminNotifications.enabled', 'Enabled')}
                </Breadcrumbs>
                <Text size="xs" color="dimmed">
                  {t('adminNotifications.telegramDesc', 'Enable Telegram notifications')}
                </Text>
              </Box>
              <Switch
                className={classes.switch}
                checked={appConfig?.telegramEnabled ?? false}
                onChange={(e) => handleUpdate('telegramEnabled', e.currentTarget.checked)}
              />
            </Group>

            <Group position="apart" className={classes.item} spacing="xl" noWrap>
              <Box>
                <Breadcrumbs separator="/" styles={{ breadcrumb: { fontSize: 13, fontWeight: 500 } }}>
                  {t('adminNotifications.telegramToken', 'Bot Token')}
                </Breadcrumbs>
                <Text size="xs" color="dimmed">
                  {t('adminNotifications.telegramTokenDesc', 'Token from @BotFather')}
                </Text>
              </Box>
              <PasswordInput
                size="xs"
                className={classes.textInput}
                placeholder="Telegram Bot Token"
                value={telegramToken || appConfig?.telegramToken || ''}
                onChange={(e) => setTelegramToken(e.currentTarget.value)}
                onBlur={() => {
                  if (telegramToken !== (appConfig?.telegramToken || '')) {
                    handleUpdate('telegramToken', telegramToken);
                  }
                }}
              />
            </Group>

            <Group position="apart" className={classes.item} spacing="xl" noWrap>
              <Box>
                <Breadcrumbs separator="/" styles={{ breadcrumb: { fontSize: 13, fontWeight: 500 } }}>
                  {t('adminNotifications.telegramChatId', 'Chat ID')}
                </Breadcrumbs>
                <Text size="xs" color="dimmed">
                  {t('adminNotifications.telegramChatIdDesc', 'Target Chat ID or Channel ID')}
                </Text>
              </Box>
              <TextInput
                size="xs"
                className={classes.textInput}
                placeholder="123456789"
                value={telegramChatId || appConfig?.telegramChatId || ''}
                onChange={(e) => setTelegramChatId(e.currentTarget.value)}
                onBlur={() => {
                  if (telegramChatId !== (appConfig?.telegramChatId || '')) {
                    handleUpdate('telegramChatId', telegramChatId);
                  }
                }}
              />
            </Group>

            <Group position="apart" className={classes.item} spacing="xl" noWrap>
              <Box>
                <Breadcrumbs separator="/" styles={{ breadcrumb: { fontSize: 13, fontWeight: 500 } }}>
                  {t('adminNotifications.telegramSendSilently', 'Send Silently')}
                </Breadcrumbs>
                <Text size="xs" color="dimmed">
                  {t('adminNotifications.telegramSendSilentlyDesc', 'Send notifications without ringing / sound')}
                </Text>
              </Box>
              <Switch
                className={classes.switch}
                checked={appConfig?.telegramSendSilently ?? false}
                onChange={(e) => handleUpdate('telegramSendSilently', e.currentTarget.checked)}
              />
            </Group>

            <Group position="right" className={classes.item} pt="md">
              <Button
                size="xs"
                variant="light"
                color="blue"
                leftIcon={<IconSend size={14} />}
                loading={testingChannel === 'telegram'}
                disabled={(!appConfig?.telegramToken && !telegramToken) || (!appConfig?.telegramChatId && !telegramChatId)}
                onClick={() => handleTestChannel('telegram')}
              >
                {t('adminNotifications.testBtn', 'Test Telegram Bot')}
              </Button>
            </Group>
          </Accordion.Panel>
        </Accordion.Item>

        {/* ─── APPRISE ─── */}
        <Accordion.Item value="apprise">
          <Accordion.Control icon={<Image src="/brand/apprise.png" alt="Apprise" width={22} height={22} />}>
            <Group position="apart" pr="md">
              <Group spacing="xs">
                <Text weight={500}>{t('adminNotifications.appriseTitle', 'Apprise')}</Text>
                {appConfig?.appriseEnabled ? (
                  <Badge color="orange" size="xs" variant="filled">
                    {t('adminNotifications.statusActive', 'Active')}
                  </Badge>
                ) : (
                  <Badge color="gray" size="xs" variant="outline">
                    {t('adminNotifications.statusInactive', 'Disabled')}
                  </Badge>
                )}
              </Group>
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <Text size="xs" color="dimmed" mb="md">
              {t('adminNotifications.appriseDesc', 'Universal notification push via Apprise gateway.')}
            </Text>

            <Group position="apart" className={classes.item} spacing="xl" noWrap>
              <Box>
                <Breadcrumbs separator="/" styles={{ breadcrumb: { fontSize: 13, fontWeight: 500 } }}>
                  {t('adminNotifications.enabled', 'Enabled')}
                </Breadcrumbs>
                <Text size="xs" color="dimmed">
                  Enable Apprise notifications
                </Text>
              </Box>
              <Switch
                className={classes.switch}
                checked={appConfig?.appriseEnabled ?? false}
                onChange={(e) => handleUpdate('appriseEnabled', e.currentTarget.checked)}
              />
            </Group>

            <Group position="apart" className={classes.item} spacing="xl" noWrap>
              <Box>
                <Breadcrumbs separator="/" styles={{ breadcrumb: { fontSize: 13, fontWeight: 500 } }}>
                  Host
                </Breadcrumbs>
                <Text size="xs" color="dimmed">
                  Apprise host name or ip
                </Text>
              </Box>
              <TextInput
                size="xs"
                className={classes.textInput}
                value={appriseHost || appConfig?.appriseHost || ''}
                onChange={(e) => setAppriseHost(e.currentTarget.value)}
                onBlur={() => {
                  if (appriseHost !== (appConfig?.appriseHost || '')) {
                    handleUpdate('appriseHost', appriseHost);
                  }
                }}
              />
            </Group>

            <Group position="apart" className={classes.item} spacing="xl" noWrap>
              <Box>
                <Breadcrumbs separator="/" styles={{ breadcrumb: { fontSize: 13, fontWeight: 500 } }}>
                  Urls
                </Breadcrumbs>
                <Text size="xs" color="dimmed">
                  Apprise urls
                </Text>
              </Box>
              <ArrayItem
                configKey="appriseUrls"
                onUpdate={handleUpdate}
                initialValue={appConfig?.appriseUrls || []}
                itemName="URL"
              />
            </Group>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}
