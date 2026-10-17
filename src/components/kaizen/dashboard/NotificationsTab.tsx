import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core';
import {
  IconBell,
  IconBrandDiscord,
  IconBrandTelegram,
  IconBrandWhatsapp,
  IconCalendarTime,
  IconCheck,
  IconPlayerPlay,
  IconRefresh,
  IconSettings,
  IconX,
} from '@tabler/icons-react';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { showNotification } from '@mantine/notifications';
import { trpc } from '../../../utils/trpc';

export function NotificationsTab() {
  const { t } = useTranslation(['common', 'settings']);
  const utils = trpc.useContext();

  const statsQuery = trpc.settings.getNotificationStats.useQuery(undefined, {
    refetchInterval: 5000,
  });

  const triggerDigestMutation = trpc.settings.triggerNotificationDigest.useMutation({
    onSuccess: (res) => {
      showNotification({
        title: t('dashboard.notifications.digestTriggered', 'Digest Processed'),
        message:
          res.count > 0
            ? t('dashboard.notifications.digestItemsSent', {
                count: res.count,
                defaultValue: `${res.count} grouped events were dispatched.`,
              })
            : t('dashboard.notifications.digestNoPending', 'No pending events to summarize.'),
        color: 'teal',
        icon: <IconCheck size={16} />,
      });
      utils.settings.getNotificationStats.invalidate();
    },
    onError: (err) => {
      showNotification({
        title: t('common.error', 'Error'),
        message: err.message,
        color: 'red',
      });
    },
  });

  if (statsQuery.isLoading && !statsQuery.data) {
    return (
      <Paper withBorder p="xl" radius="md">
        <Group position="center" my="xl">
          <Loader size="lg" />
          <Text size="sm" color="dimmed">
            {t('dashboard.notifications.loading', 'Loading notification statistics...')}
          </Text>
        </Group>
      </Paper>
    );
  }

  if (statsQuery.isError && !statsQuery.data) {
    return (
      <Paper withBorder p="xl" radius="md">
        <Stack align="center" spacing="sm" my="xl">
          <Text size="sm" color="red">
            {statsQuery.error?.message || t('common.error', 'Error loading notifications')}
          </Text>
          <Button size="xs" variant="light" onClick={() => statsQuery.refetch()}>
            {t('common.retry', 'Retry')}
          </Button>
        </Stack>
      </Paper>
    );
  }

  const data = statsQuery.data;
  const recentLogs = data?.recentLogs || [];
  const byChannel = data?.byChannel || { whatsapp: 0, discord: 0, telegram: 0 };
  const digest = data?.digest || { mode: 'HOURLY', hour: 20, pendingCount: 0 };
  const todaySent = data?.todaySent ?? 0;
  const totalSent = data?.totalSent ?? 0;
  const totalFailed = data?.totalFailed ?? 0;

  const getDigestLabel = (mode?: string, hour?: number) => {
    switch (mode) {
      case 'IMMEDIATE':
        return t('settings:adminNotifications.modeImmediate', 'Immediate (With auto-cooldown)');
      case 'EVERY_6_HOURS':
        return t('settings:adminNotifications.modeEvery6Hours', 'Every 6 Hours');
      case 'DAILY':
        return `${t('settings:adminNotifications.modeDaily', 'Daily Digest')} (${String(hour ?? 20).padStart(2, '0')}:00)`;
      case 'HOURLY':
      default:
        return t('settings:adminNotifications.modeHourly', 'Every 1 Hour (Recommended)');
    }
  };

  const getChannelBadge = (channel: string) => {
    switch (channel.toLowerCase()) {
      case 'whatsapp':
        return (
          <Badge color="teal" variant="light" leftSection={<IconBrandWhatsapp size={12} />}>
            WhatsApp
          </Badge>
        );
      case 'discord':
        return (
          <Badge color="indigo" variant="light" leftSection={<IconBrandDiscord size={12} />}>
            Discord
          </Badge>
        );
      case 'telegram':
        return (
          <Badge color="blue" variant="light" leftSection={<IconBrandTelegram size={12} />}>
            Telegram
          </Badge>
        );
      default:
        return (
          <Badge color="gray" variant="light">
            {channel}
          </Badge>
        );
    }
  };

  const formatTimestamp = (dateStr: string | Date) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return String(dateStr);
    }
  };

  return (
    <Stack spacing="xl">
      {/* Header */}
      <Paper withBorder p="md" radius="md" sx={{ backdropFilter: 'blur(10px)' }}>
        <Group position="apart">
          <Group spacing="sm">
            <ThemeIcon size={38} radius="md" color="indigo" variant="light">
              <IconBell size={22} />
            </ThemeIcon>
            <div>
              <Title order={4}>
                {t('dashboard.notifications.title', 'Notification Activity')}
              </Title>
              <Text size="xs" color="dimmed">
                {t('dashboard.notifications.subtitle', 'Push dispatch status, channel metrics, and scheduled digest summaries')}
              </Text>
            </div>
          </Group>

          <Group spacing="xs">
            <Button
              component={Link}
              href="/settings?tab=notifications"
              variant="light"
              color="indigo"
              size="xs"
              leftIcon={<IconSettings size={14} />}
            >
              {t('dashboard.notifications.viewSettings', 'Notification Settings')}
            </Button>
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={() => statsQuery.refetch()}
              loading={statsQuery.isFetching}
              size="sm"
            >
              <IconRefresh size={16} />
            </ActionIcon>
          </Group>
        </Group>
      </Paper>

      {/* Top Stat Cards */}
      <SimpleGrid
        cols={4}
        breakpoints={[
          { maxWidth: 'md', cols: 2 },
          { maxWidth: 'xs', cols: 1 },
        ]}
      >
        {/* Total Sent Today */}
        <Card withBorder p="md" radius="md">
          <Group position="apart">
            <Text size="xs" color="dimmed" weight={700} transform="uppercase">
              {t('dashboard.notifications.todaySent', 'Sent Today')}
            </Text>
            <ThemeIcon color="indigo" variant="light" radius="md" size={28}>
              <IconBell size={16} />
            </ThemeIcon>
          </Group>
          <Text size="xl" weight={700} mt="xs" color="indigo">
            {todaySent}
          </Text>
          <Group spacing={8} mt={4}>
            <Text size="11px" color="dimmed">
              {t('dashboard.notifications.totalAllTime', 'All-time total:')} {totalSent}
            </Text>
            {totalFailed > 0 && (
              <Badge size="xs" color="red" variant="light">
                {t('dashboard.notifications.totalFailed', 'Failed:')} {totalFailed}
              </Badge>
            )}
          </Group>
        </Card>

        {/* WhatsApp */}
        <Card withBorder p="md" radius="md">
          <Group position="apart">
            <Text size="xs" color="dimmed" weight={700} transform="uppercase">
              WhatsApp
            </Text>
            <ThemeIcon color="teal" variant="light" radius="md" size={28}>
              <IconBrandWhatsapp size={16} />
            </ThemeIcon>
          </Group>
          <Text size="xl" weight={700} mt="xs" color="teal">
            {byChannel.whatsapp ?? 0}
          </Text>
          <Text size="11px" color="dimmed" mt={4}>
            CallMeBot API
          </Text>
        </Card>

        {/* Discord */}
        <Card withBorder p="md" radius="md">
          <Group position="apart">
            <Text size="xs" color="dimmed" weight={700} transform="uppercase">
              Discord
            </Text>
            <ThemeIcon color="indigo" variant="light" radius="md" size={28}>
              <IconBrandDiscord size={16} />
            </ThemeIcon>
          </Group>
          <Text size="xl" weight={700} mt="xs" color="indigo">
            {byChannel.discord ?? 0}
          </Text>
          <Text size="11px" color="dimmed" mt={4}>
            Incoming Webhooks
          </Text>
        </Card>

        {/* Telegram */}
        <Card withBorder p="md" radius="md">
          <Group position="apart">
            <Text size="xs" color="dimmed" weight={700} transform="uppercase">
              Telegram
            </Text>
            <ThemeIcon color="blue" variant="light" radius="md" size={28}>
              <IconBrandTelegram size={16} />
            </ThemeIcon>
          </Group>
          <Text size="xl" weight={700} mt="xs" color="blue">
            {byChannel.telegram ?? 0}
          </Text>
          <Text size="11px" color="dimmed" mt={4}>
            Bot API
          </Text>
        </Card>
      </SimpleGrid>

      {/* Digest Scheduled Card */}
      <Paper withBorder p="md" radius="md">
        <Group position="apart">
          <Group spacing="sm">
            <ThemeIcon size={32} radius="md" color="violet" variant="light">
              <IconCalendarTime size={18} />
            </ThemeIcon>
            <div>
              <Group spacing="xs">
                <Text size="sm" weight={600}>
                  {t('dashboard.notifications.digestActive', 'Scheduled digest:')}
                </Text>
                <Badge size="sm" variant="light" color="indigo">
                  {getDigestLabel(digest.mode, digest.hour)}
                </Badge>
                {digest.pendingCount > 0 ? (
                  <Badge size="sm" variant="filled" color="orange">
                    {digest.pendingCount} {t('dashboard.notifications.pendingItems', 'pending')}
                  </Badge>
                ) : null}
              </Group>
              <Text size="xs" color="dimmed">
                {t('settings:adminNotifications.digestDesc', 'Prevents API rate-limiting / ban (CallMeBot) and notification flooding by bundling batch scraper errors and downloads into a consolidated report.')}
              </Text>
            </div>
          </Group>

          <Button
            size="xs"
            variant="light"
            color="indigo"
            leftIcon={<IconPlayerPlay size={14} />}
            loading={triggerDigestMutation.isLoading}
            onClick={() => triggerDigestMutation.mutate()}
          >
            {t('dashboard.notifications.runDigestNow', 'Process Digest Now')}
          </Button>
        </Group>
      </Paper>

      {/* Recent Activity Table */}
      <Paper withBorder p="md" radius="md">
        <Group position="apart" mb="md">
          <Group spacing="xs">
            <Title order={5}>
              {t('dashboard.notifications.recentActivity', 'Recent Dispatched Notifications')}
            </Title>
            <Badge size="sm" variant="light" color="gray">
              {recentLogs.length}
            </Badge>
          </Group>
        </Group>

        {recentLogs.length === 0 ? (
          <Text size="sm" color="dimmed" align="center" py="xl">
            {t('dashboard.notifications.noRecentLogs', 'No notifications dispatched yet.')}
          </Text>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table highlightOnHover verticalSpacing="xs" sx={{ minWidth: 600 }}>
              <thead>
                <tr>
                  <th>{t('dashboard.notifications.time', 'Time')}</th>
                  <th>{t('dashboard.notifications.channel', 'Channel')}</th>
                  <th>{t('dashboard.notifications.event', 'Event')}</th>
                  <th>{t('dashboard.notifications.recipient', 'Recipient')}</th>
                  <th>{t('dashboard.notifications.status', 'Status')}</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.map((log: any) => (
                  <tr key={log.id}>
                    <td>
                      <Text size="xs" color="dimmed">
                        {formatTimestamp(log.createdAt)}
                      </Text>
                    </td>
                    <td>{getChannelBadge(log.channel)}</td>
                    <td>
                      <Badge size="xs" variant="outline" color="dark">
                        {log.event}
                      </Badge>
                    </td>
                    <td>
                      <Text size="xs" sx={{ fontFamily: 'monospace' }}>
                        {log.recipient || '—'}
                      </Text>
                    </td>
                    <td>
                      {log.success ? (
                        <Badge size="xs" color="teal" variant="light" leftSection={<IconCheck size={10} />}>
                          {t('dashboard.notifications.success', 'Success')}
                        </Badge>
                      ) : (
                        <Tooltip label={log.error || 'Failed'} withArrow>
                          <Badge size="xs" color="red" variant="filled" leftSection={<IconX size={10} />}>
                            {t('dashboard.notifications.failed', 'Failed')}
                          </Badge>
                        </Tooltip>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Box>
        )}
      </Paper>
    </Stack>
  );
}
