import {
  Accordion,
  ActionIcon,
  Badge,
  Button,
  Center,
  Code,
  Group,
  Loader,
  Modal,
  Pagination,
  Paper,
  Stack,
  Table,
  Tabs,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconCheck,
  IconClock,
  IconRefresh,
  IconStack2,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { trpc } from '../../../utils/trpc';

export type JobStatusType = 'active' | 'waiting' | 'delayed' | 'failed' | 'completed';

interface QueueJobsModalProps {
  opened: boolean;
  onClose: () => void;
  queueName: string;
  label: string;
  initialStatus?: JobStatusType;
}

export function QueueJobsModal({
  opened,
  onClose,
  queueName,
  label,
  initialStatus = 'failed',
}: QueueJobsModalProps) {
  const { t } = useTranslation('common');
  const [status, setStatus] = useState<JobStatusType>(initialStatus);
  const [page, setPage] = useState(1);
  const utils = trpc.useContext();

  const { data, isLoading, refetch, isRefetching } = trpc.queues.getQueueJobs.useQuery(
    {
      queueName,
      status,
      page,
      pageSize: 10,
    },
    {
      enabled: opened && Boolean(queueName),
      refetchInterval: 5000,
    }
  );

  const retryJobMutation = trpc.queues.retryJob.useMutation({
    onSuccess: () => {
      refetch();
      utils.queues.getMetrics.invalidate();
    },
  });

  const removeJobMutation = trpc.queues.removeJob.useMutation({
    onSuccess: () => {
      refetch();
      utils.queues.getMetrics.invalidate();
    },
  });

  const retryAllMutation = trpc.queues.retryAllFailed.useMutation({
    onSuccess: () => {
      refetch();
      utils.queues.getMetrics.invalidate();
    },
  });

  const cleanMutation = trpc.queues.cleanQueue.useMutation({
    onSuccess: () => {
      refetch();
      utils.queues.getMetrics.invalidate();
    },
  });

  const handleStatusChange = (val: string) => {
    setStatus(val as JobStatusType);
    setPage(1);
  };

  const getStatusBadge = (st: JobStatusType) => {
    switch (st) {
      case 'active':
        return <Badge color="teal">{t('dashboard.queues.colActive', 'Active')}</Badge>;
      case 'waiting':
        return <Badge color="cyan">{t('dashboard.queues.colWaiting', 'Waiting')}</Badge>;
      case 'delayed':
        return <Badge color="grape">{t('dashboard.queues.colDelayed', 'Delayed')}</Badge>;
      case 'failed':
        return <Badge color="red">{t('dashboard.queues.colFailed', 'Failed')}</Badge>;
      case 'completed':
        return <Badge color="gray">{t('dashboard.queues.colCompleted', 'Completed')}</Badge>;
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group spacing="xs">
          <ThemeIcon color="indigo" variant="light" radius="md">
            <IconStack2 size={18} />
          </ThemeIcon>

          <div>
            <Text weight={700} size="md">
              {t(`dashboard.queues.labels.${queueName}`, label || queueName)}
            </Text>
            <Text size="xs" color="dimmed" sx={{ fontFamily: 'monospace' }}>
              {queueName}
            </Text>
          </div>
        </Group>
      }
      size="xl"
      radius="md"
    >
      <Stack spacing="md">
        {/* State Tabs & Actions */}
        <Group position="apart">
          <Tabs value={status} onTabChange={handleStatusChange} variant="pills" radius="md" size="xs">
            <Tabs.List>
              <Tabs.Tab value="failed" color="red">
                {t('dashboard.queues.colFailed', 'Failed')}
              </Tabs.Tab>
              <Tabs.Tab value="delayed" color="grape">
                {t('dashboard.queues.colDelayed', 'Delayed')}
              </Tabs.Tab>
              <Tabs.Tab value="active" color="teal">
                {t('dashboard.queues.colActive', 'Active')}
              </Tabs.Tab>
              <Tabs.Tab value="waiting" color="cyan">
                {t('dashboard.queues.colWaiting', 'Waiting')}
              </Tabs.Tab>
              <Tabs.Tab value="completed" color="gray">
                {t('dashboard.queues.colCompleted', 'Completed')}
              </Tabs.Tab>
            </Tabs.List>
          </Tabs>

          <Group spacing="xs">
            {status === 'failed' && (
              <Button
                size="xs"
                variant="light"
                color="orange"
                leftIcon={<IconRefresh size={14} />}
                onClick={() => retryAllMutation.mutate({ queueName })}
                loading={retryAllMutation.isLoading}
              >
                Reintentar Fallidos
              </Button>
            )}

            {(status === 'failed' || status === 'completed') && (
              <Button
                size="xs"
                variant="subtle"
                color="red"
                leftIcon={<IconTrash size={14} />}
                onClick={() => cleanMutation.mutate({ queueName, type: status as 'completed' | 'failed' })}
                loading={cleanMutation.isLoading}
              >
                {status === 'failed'
                  ? t('dashboard.queues.cleanFailed', 'Clear failed history')
                  : t('dashboard.queues.cleanCompleted', 'Clear completed')}
              </Button>
            )}

            <ActionIcon variant="light" size="sm" onClick={() => refetch()} loading={isRefetching}>
              <IconRefresh size={14} />
            </ActionIcon>
          </Group>
        </Group>

        {/* Content */}
        {isLoading ? (
          <Center my="xl">
            <Loader size="md" />
          </Center>
        ) : !data?.jobs || data.jobs.length === 0 ? (
          <Paper withBorder p="xl" radius="md">
            <Center>
              <Stack align="center" spacing="xs">
                <IconCheck size={32} color="gray" />
                <Text size="sm" color="dimmed">
                  No hay trabajos en estado &quot;{status}&quot; en esta cola.
                </Text>
              </Stack>
            </Center>
          </Paper>
        ) : (
          <Stack spacing="xs">
            <Table verticalSpacing="xs" highlightOnHover>
              <thead>
                <tr>
                  <th>ID / Nombre</th>
                  <th>Payload / Datos</th>
                  <th>Detalle / Error</th>
                  <th>Intentos</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {data.jobs.map((job) => {
                  const payloadStr = JSON.stringify(job.data, null, 2);
                  const shortPayload = payloadStr.length > 100 ? `${payloadStr.slice(0, 100)}...` : payloadStr;

                  return (
                    <tr key={job.id}>
                      <td>
                        <Stack spacing={2}>
                          <Text size="xs" weight={700} sx={{ fontFamily: 'monospace' }}>
                            #{job.id}
                          </Text>
                          <Text size="xs" color="dimmed">
                            {job.name}
                          </Text>
                        </Stack>
                      </td>

                      <td>
                        <Tooltip label={<Code block>{payloadStr}</Code>} multiline width={300} withArrow>
                          <Code color="blue" sx={{ fontSize: '11px', display: 'block', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {shortPayload}
                          </Code>
                        </Tooltip>
                      </td>

                      <td>
                        {job.failedReason ? (
                          <Accordion variant="separated" radius="xs" chevronPosition="left" sx={{ width: 280 }}>
                            <Accordion.Item value="error">
                              <Accordion.Control p={4}>
                                <Text size="xs" color="red" weight={600} truncate sx={{ maxWidth: 220 }}>
                                  {job.failedReason}
                                </Text>
                              </Accordion.Control>
                              <Accordion.Panel>
                                <Stack spacing="xs">
                                  <Code block color="red" sx={{ fontSize: '10px', maxHeight: 150, overflow: 'auto' }}>
                                    {job.failedReason}
                                  </Code>
                                  {job.stacktrace && job.stacktrace.length > 0 && (
                                    <Code block sx={{ fontSize: '9px', maxHeight: 120, overflow: 'auto' }}>
                                      {job.stacktrace.join('\n')}
                                    </Code>
                                  )}
                                </Stack>
                              </Accordion.Panel>
                            </Accordion.Item>
                          </Accordion>
                        ) : (
                          <Text size="xs" color="dimmed">
                            {job.timestamp ? new Date(job.timestamp).toLocaleString() : 'OK'}
                          </Text>
                        )}
                      </td>

                      <td>
                        <Badge size="xs" variant="light" color={job.attemptsMade > 1 ? 'orange' : 'gray'}>
                          {job.attemptsMade}
                        </Badge>
                      </td>

                      <td>
                        <Group spacing={4}>
                          {(status === 'failed' || status === 'delayed') && (
                            <Tooltip label="Reintentar este trabajo">
                              <ActionIcon
                                size="sm"
                                color="orange"
                                variant="light"
                                onClick={() => retryJobMutation.mutate({ queueName, jobId: job.id })}
                                loading={retryJobMutation.isLoading}
                              >
                                <IconRefresh size={14} />
                              </ActionIcon>
                            </Tooltip>
                          )}

                          <Tooltip label="Eliminar trabajo de la cola">
                            <ActionIcon
                              size="sm"
                              color="red"
                              variant="light"
                              onClick={() => removeJobMutation.mutate({ queueName, jobId: job.id })}
                              loading={removeJobMutation.isLoading}
                            >
                              <IconTrash size={14} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>

            {data.totalPages > 1 && (
              <Center mt="sm">
                <Pagination page={page} onChange={setPage} total={data.totalPages} size="sm" />
              </Center>
            )}
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}
