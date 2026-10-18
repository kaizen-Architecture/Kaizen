import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Grid,
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
  UnstyledButton,
} from '@mantine/core';
import {
  IconActivity,
  IconAlertTriangle,
  IconCheck,
  IconClock,
  IconExternalLink,
  IconRefresh,
  IconStack2,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { trpc } from '../../../utils/trpc';
import { JobStatusType, QueueJobsModal } from './QueueJobsModal';

export function QueuesTab() {
  const { t } = useTranslation('common');
  const utils = trpc.useContext();
  const [modalState, setModalState] = useState<{
    opened: boolean;
    queueName: string;
    label: string;
    status: JobStatusType;
  }>({
    opened: false,
    queueName: '',
    label: '',
    status: 'failed',
  });

  const { data, isLoading, isError, error, refetch, isRefetching } = trpc.queues.getMetrics.useQuery(undefined, {
    refetchInterval: 5000,
  });

  const cleanMutation = trpc.queues.cleanQueue.useMutation({
    onSuccess: () => {
      utils.queues.getMetrics.invalidate();
    },
  });

  const openDrillDown = (queueName: string, label: string, status: JobStatusType) => {
    setModalState({
      opened: true,
      queueName,
      label,
      status,
    });
  };

  if (isLoading && !data) {
    return (
      <Paper withBorder p="xl" radius="md">
        <Group position="center" my="xl">
          <Loader size="lg" />
          <Text size="sm" color="dimmed">
            {t('dashboard.queues.loading', 'Loading Kaizen queue status...')}
          </Text>
        </Group>
      </Paper>
    );
  }

  if (isError && !data) {
    return (
      <Paper withBorder p="xl" radius="md">
        <Stack align="center" spacing="sm" my="xl">
          <Text size="sm" color="red">
            {error?.message || t('common.error', 'Error loading queues')}
          </Text>
          <Button size="xs" variant="light" onClick={() => refetch()}>
            {t('common.retry', 'Retry')}
          </Button>
        </Stack>
      </Paper>
    );
  }

  const summary = data?.summary || { totalActive: 0, totalWaiting: 0, totalDelayed: 0, totalFailed: 0 };
  const queues = data?.queues || [];

  return (
    <Stack spacing="xl">
      {/* Stat Cards */}
      <SimpleGrid cols={4} breakpoints={[{ maxWidth: 'md', cols: 2 }, { maxWidth: 'xs', cols: 1 }]}>
        <Paper withBorder p="md" radius="md" sx={{ backdropFilter: 'blur(10px)' }}>
          <Group position="apart">
            <Text size="xs" color="dimmed" weight={700} transform="uppercase">
              {t('dashboard.queues.activeJobs', 'Active Jobs')}
            </Text>
            <ThemeIcon color="teal" variant="light" radius="md">
              <IconActivity size={18} />
            </ThemeIcon>
          </Group>
          <Text size="xl" weight={700} mt="xs">
            {summary.totalActive}
          </Text>
          <Text size="xs" color="dimmed" mt={4}>
            {t('dashboard.queues.activeJobsDesc', 'Processing in background')}
          </Text>
        </Paper>

        <Paper withBorder p="md" radius="md" sx={{ backdropFilter: 'blur(10px)' }}>
          <Group position="apart">
            <Text size="xs" color="dimmed" weight={700} transform="uppercase">
              {t('dashboard.queues.waitingJobs', 'Waiting')}
            </Text>
            <ThemeIcon color="cyan" variant="light" radius="md">
              <IconClock size={18} />
            </ThemeIcon>
          </Group>
          <Text size="xl" weight={700} mt="xs">
            {summary.totalWaiting}
          </Text>
          <Text size="xs" color="dimmed" mt={4}>
            {t('dashboard.queues.waitingJobsDesc', 'Pending in execution queue')}
          </Text>
        </Paper>

        <Paper withBorder p="md" radius="md" sx={{ backdropFilter: 'blur(10px)' }}>
          <Group position="apart">
            <Text size="xs" color="dimmed" weight={700} transform="uppercase">
              {t('dashboard.queues.delayedJobs', 'Scheduled / Delayed')}
            </Text>
            <ThemeIcon color="grape" variant="light" radius="md">
              <IconStack2 size={18} />
            </ThemeIcon>
          </Group>
          <Text size="xl" weight={700} mt="xs">
            {summary.totalDelayed}
          </Text>
          <Text size="xs" color="dimmed" mt={4}>
            {t('dashboard.queues.delayedJobsDesc', 'Timers and schedulers')}
          </Text>
        </Paper>

        <Paper withBorder p="md" radius="md" sx={{ backdropFilter: 'blur(10px)' }}>
          <Group position="apart">
            <Text size="xs" color="dimmed" weight={700} transform="uppercase">
              {t('dashboard.queues.failedJobs', 'Failed')}
            </Text>
            <ThemeIcon color={summary.totalFailed > 0 ? 'red' : 'gray'} variant="light" radius="md">
              <IconX size={18} />
            </ThemeIcon>
          </Group>
          <Text size="xl" weight={700} mt="xs" color={summary.totalFailed > 0 ? 'red' : undefined}>
            {summary.totalFailed}
          </Text>
          <Text size="xs" color="dimmed" mt={4}>
            {t('dashboard.queues.failedJobsDesc', 'Require review or retry')}
          </Text>
        </Paper>
      </SimpleGrid>

      {/* Main Queues Card */}
      <Paper withBorder p="md" radius="md">
        <Group position="apart" mb="md">
          <div>
            <Group spacing="xs">
              <Title order={4}>{t('dashboard.queues.monitorTitle', 'BullMQ Queue Monitor ({{count}})', { count: queues.length })}</Title>
              {isRefetching && <Loader size={16} />}
            </Group>
            <Text size="xs" color="dimmed">
              {t('dashboard.queues.liveSync', 'Live sync every 5 seconds')}
            </Text>
          </div>

          <Group spacing="xs">
            <Button
              variant="subtle"
              size="xs"
              leftIcon={<IconRefresh size={14} />}
              onClick={() => refetch()}
              loading={isRefetching}
            >
              {t('dashboard.queues.refresh', 'Refresh')}
            </Button>

            <Button
              variant="light"
              color="indigo"
              size="xs"
              leftIcon={<IconExternalLink size={14} />}
              onClick={() => window.open('/bull/queues', '_blank')}
            >
              {t('dashboard.queues.openBoard', 'Open Full Bull Board')}
            </Button>
          </Group>
        </Group>

        <Box sx={{ overflowX: 'auto' }}>
          <Table
            verticalSpacing="sm"
            highlightOnHover
            sx={{
              minWidth: 720,
              '& th': { whiteSpace: 'nowrap' },
            }}
          >
            <thead>
              <tr>
                <th>{t('dashboard.queues.colQueue', 'Work Queue')}</th>
                <th>{t('dashboard.queues.colActive', 'Active')}</th>
                <th>{t('dashboard.queues.colWaiting', 'Waiting')}</th>
                <th>{t('dashboard.queues.colDelayed', 'Delayed')}</th>
                <th>{t('dashboard.queues.colFailed', 'Failed')}</th>
                <th>{t('dashboard.queues.colCompleted', 'Completed')}</th>
                <th>{t('dashboard.queues.colActions', 'Actions')}</th>
              </tr>
            </thead>
          <tbody>
            {queues.map((q) => {
              const activeCount = q.active ?? 0;
              const waitingCount = q.waiting ?? 0;
              const delayedCount = q.delayed ?? 0;
              const failedCount = q.failed ?? 0;
              const completedCount = q.completed ?? 0;
              const isSaturated = waitingCount > 50;
              const hasErrors = failedCount > 0;

              return (
                <tr key={q.id}>
                  <td>
                    <Group spacing="xs">
                      {isSaturated ? (
                        <Tooltip label={t('dashboard.queues.tooltipSaturated', 'Queue saturated (>50 waiting)')}>
                          <ThemeIcon color="orange" variant="light" size="sm">
                            <IconAlertTriangle size={14} />
                          </ThemeIcon>
                        </Tooltip>
                      ) : (
                        <ThemeIcon color="blue" variant="light" size="sm">
                          <IconStack2 size={14} />
                        </ThemeIcon>
                      )}
                      <div>
                        <Text size="sm" weight={600}>
                          {t(`dashboard.queues.labels.${q.name}`, q.label)}
                        </Text>
                        <Text size="xs" color="dimmed" sx={{ fontFamily: 'monospace' }}>
                          {q.name}
                        </Text>
                      </div>
                    </Group>
                  </td>

                  <td>
                    <Tooltip label={t('dashboard.queues.viewActiveJobs', 'View active jobs')}>
                      <UnstyledButton onClick={() => openDrillDown(q.name, q.label, 'active')}>
                        <Badge color={activeCount > 0 ? 'teal' : 'gray'} variant={activeCount > 0 ? 'filled' : 'light'} sx={{ cursor: 'pointer' }}>
                          {activeCount}
                        </Badge>
                      </UnstyledButton>
                    </Tooltip>
                  </td>

                  <td>
                    <Tooltip label={t('dashboard.queues.viewWaitingJobs', 'View waiting jobs')}>
                      <UnstyledButton onClick={() => openDrillDown(q.name, q.label, 'waiting')}>
                        <Badge color={waitingCount > 0 ? 'cyan' : 'gray'} variant="light" sx={{ cursor: 'pointer' }}>
                          {waitingCount}
                        </Badge>
                      </UnstyledButton>
                    </Tooltip>
                  </td>

                  <td>
                    <Tooltip label={t('dashboard.queues.viewDelayedJobs', 'View scheduled / delayed jobs')}>
                      <UnstyledButton onClick={() => openDrillDown(q.name, q.label, 'delayed')}>
                        <Badge color={delayedCount > 0 ? 'grape' : 'gray'} variant="light" sx={{ cursor: 'pointer' }}>
                          {delayedCount}
                        </Badge>
                      </UnstyledButton>
                    </Tooltip>
                  </td>

                  <td>
                    <Tooltip label={t('dashboard.queues.viewFailedJobs', 'View failed jobs and inspect errors')}>
                      <UnstyledButton onClick={() => openDrillDown(q.name, q.label, 'failed')}>
                        <Badge color={hasErrors ? 'red' : 'gray'} variant={hasErrors ? 'filled' : 'light'} sx={{ cursor: 'pointer' }}>
                          {failedCount}
                        </Badge>
                      </UnstyledButton>
                    </Tooltip>
                  </td>

                  <td>
                    <Tooltip label={t('dashboard.queues.viewCompletedJobs', 'View completed jobs')}>
                      <UnstyledButton onClick={() => openDrillDown(q.name, q.label, 'completed')}>
                        <Text size="xs" color="dimmed" sx={{ cursor: 'pointer', textDecoration: 'underline' }}>
                          {completedCount}
                        </Text>
                      </UnstyledButton>
                    </Tooltip>
                  </td>

                  <td>
                    <Group spacing={4}>
                      {q.completed > 0 && (
                        <Tooltip label={t('dashboard.queues.cleanCompleted', 'Clear completed')}>
                          <ActionIcon
                            size="sm"
                            color="gray"
                            variant="light"
                            onClick={() => cleanMutation.mutate({ queueName: q.name, type: 'completed' })}
                            loading={cleanMutation.isLoading}
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                      {q.failed > 0 && (
                        <Tooltip label={t('dashboard.queues.cleanFailed', 'Clear failed history')}>
                          <ActionIcon
                            size="sm"
                            color="red"
                            variant="light"
                            onClick={() => cleanMutation.mutate({ queueName: q.name, type: 'failed' })}
                            loading={cleanMutation.isLoading}
                          >
                            <IconX size={14} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Group>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Box>
    </Paper>

      {/* Drill-down Modal */}
      <QueueJobsModal
        opened={modalState.opened}
        onClose={() => setModalState((prev) => ({ ...prev, opened: false }))}
        queueName={modalState.queueName}
        label={modalState.label}
        initialStatus={modalState.status}
      />
    </Stack>
  );
}
