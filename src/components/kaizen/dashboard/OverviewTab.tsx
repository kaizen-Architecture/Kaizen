import { Grid, Stack, Paper, Group, ThemeIcon, Text, Badge, Button } from '@mantine/core';
import { IconBell, IconArrowRight } from '@tabler/icons-react';
import { trpc } from '../../../utils/trpc';
import { DashboardStats } from '../DashboardStats';
import { DownloadsChart } from '../DownloadsChart';
import { SourceFailureChart } from '../SourceFailureChart';
import { RecentActivityFeed } from '../RecentActivityFeed';
import { SourceStatsChart } from '../SourceStatsChart';

interface OverviewTabProps {
  activity: any;
  historyQuery: any;
  activityHistoryQuery: any;
  setIsQueueModalOpen: (val: boolean) => void;
  setIsFailedModalOpen: (val: boolean) => void;
  onSelectTab?: (tab: string) => void;
  t: any;
}

export function OverviewTab({
  activity,
  historyQuery,
  activityHistoryQuery,
  setIsQueueModalOpen,
  setIsFailedModalOpen,
  onSelectTab,
  t,
}: OverviewTabProps) {
  const notifQuery = trpc.settings.getNotificationStats.useQuery(undefined, {
    refetchInterval: 10000,
  });
  const notifData = notifQuery.data;

  return (
    <Stack spacing="xl">
      <DashboardStats
        activity={activity}
        notificationTodayCount={notifData?.todaySent}
        onNotificationsClick={() => onSelectTab?.('notifications')}
        t={t}
        setIsQueueModalOpen={setIsQueueModalOpen}
        setIsFailedModalOpen={setIsFailedModalOpen}
      />

      {/* Compact Notifications Glance Banner */}
      <Paper
        withBorder
        p="xs"
        px="md"
        radius="md"
        sx={(theme) => ({
          backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[0],
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: theme.spacing.xs,
        })}
      >
        <Group spacing="sm">
          <ThemeIcon size={26} radius="sm" color="indigo" variant="light">
            <IconBell size={15} />
          </ThemeIcon>
          <Text size="sm">
            <Text component="span" weight={600}>
              {t('dashboard.stats.notifications', 'Notifications')}:
            </Text>{' '}
            <Text component="span" color="dimmed">
              {t('dashboard.notifications.compactBanner', {
                today: notifData?.todaySent ?? 0,
                defaultValue: `Notifications: ${notifData?.todaySent ?? 0} sent today across WhatsApp, Discord, and Telegram.`,
              })}
            </Text>
          </Text>
        </Group>

        <Group spacing="xs">
          {(notifData?.digest?.pendingCount ?? 0) > 0 && (
            <Badge size="sm" color="orange" variant="light">
              {notifData?.digest.pendingCount} {t('dashboard.notifications.pendingItems', 'pending')}
            </Badge>
          )}
          {onSelectTab && (
            <Button
              variant="subtle"
              size="xs"
              color="indigo"
              compact
              rightIcon={<IconArrowRight size={13} />}
              onClick={() => onSelectTab('notifications')}
            >
              {t('dashboard.notifications.viewDetails', 'View Notifications Tab')}
            </Button>
          )}
        </Group>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <SourceStatsChart />
      </Paper>

      <Grid>
        <Grid.Col md={8}>
          <Stack>
            <DownloadsChart activityHistoryQuery={activityHistoryQuery} />
            <SourceFailureChart />
          </Stack>
        </Grid.Col>
        <Grid.Col md={4}>
          <RecentActivityFeed historyQuery={historyQuery} />
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
