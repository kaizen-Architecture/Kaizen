import { Grid, Stack, Paper } from '@mantine/core';
import { DashboardStats } from '../DashboardStats';
import { DownloadsChart } from '../DownloadsChart';
import { SourceFailureChart } from '../SourceFailureChart';
import { RecentActivityFeed } from '../RecentActivityFeed';
import { SourceStatsChart } from '../SourceStatsChart';

interface OverviewTabProps {
  activity: any;
  historyQuery: any;
  activityHistoryQuery: any;
  setIsQueueModalOpen: (val: boolean, tab?: 'active' | 'recent') => void;
  setIsFailedModalOpen: (val: boolean) => void;
  onOpenQueueModal?: (tab: 'active' | 'recent') => void;
  t: any;
}

export function OverviewTab({
  activity,
  historyQuery,
  activityHistoryQuery,
  setIsQueueModalOpen,
  setIsFailedModalOpen,
  onOpenQueueModal,
  t,
}: OverviewTabProps) {
  return (
    <Stack spacing="xl">
      <DashboardStats
        activity={activity}
        t={t}
        setIsQueueModalOpen={setIsQueueModalOpen}
        setIsFailedModalOpen={setIsFailedModalOpen}
        onOpenQueueModal={onOpenQueueModal}
      />

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
