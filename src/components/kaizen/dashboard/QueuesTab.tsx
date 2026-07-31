import {
  ActionIcon,
  Badge,
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
import { useTranslation } from 'next-i18next';
import { trpc } from '../../../utils/trpc';

export function QueuesTab() {
  const { t } = useTranslation('common');
  const utils = trpc.useContext();
  const { data, isLoading, refetch, isRefetching } = trpc.queues.getMetrics.useQuery(undefined, {
    refetchInterval: 5000,
  });

  const cleanMutation = trpc.queues.cleanQueue.useMutation({
    onSuccess: () => {
      utils.queues.getMetrics.invalidate();
    },
  });

  if (isLoading) {
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

        <Table verticalSpacing="sm" highlightOnHover>
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
              const isSaturated = q.waiting > 50;
              const hasErrors = q.failed > 0;

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
                          {q.label}
                        </Text>
                        <Text size="xs" color="dimmed" sx={{ fontFamily: 'monospace' }}>
                          {q.name}
                        </Text>
                      </div>
                    </Group>
                  </td>

                  <td>
                    <Badge color={q.active > 0 ? 'teal' : 'gray'} variant={q.active > 0 ? 'filled' : 'light'}>
                      {q.active}
                    </Badge>
                  </td>

                  <td>
                    <Badge color={q.waiting > 0 ? 'cyan' : 'gray'} variant="light">
                      {q.waiting}
                    </Badge>
                  </td>

                  <td>
                    <Badge color={q.delayed > 0 ? 'grape' : 'gray'} variant="light">
                      {q.delayed}
                    </Badge>
                  </td>

                  <td>
                    <Badge color={hasErrors ? 'red' : 'gray'} variant={hasErrors ? 'filled' : 'light'}>
                      {q.failed}
                    </Badge>
                  </td>

                  <td>
                    <Text size="xs" color="dimmed">
                      {q.completed}
                    </Text>
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
      </Paper>
    </Stack>
  );
}
