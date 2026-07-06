import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  Progress,
  ScrollArea,
  Stack,
  Table,
  Tabs,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core';
import {
  IconActivity,
  IconCheck,
  IconClock,
  IconDownload,
  IconHistoryToggle,
  IconRefresh,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useTranslation } from 'next-i18next';
import { trpc } from '../../utils/trpc';

dayjs.extend(relativeTime);

export interface DownloadQueueModalProps {
  opened: boolean;
  onClose: () => void;
}

const STATUS_CONFIG = {
  active: { color: 'teal', icon: IconActivity },
  waiting: { color: 'cyan', icon: IconClock },
  completed: { color: 'green', icon: IconCheck },
  failed: { color: 'red', icon: IconX },
} as const;

type JobStatus = keyof typeof STATUS_CONFIG;

function StatusBadge({ status, t }: { status: JobStatus; t: (k: string) => string }) {
  const { color, icon: Icon } = STATUS_CONFIG[status];
  return (
    <Badge
      color={color}
      variant="light"
      leftSection={
        <ThemeIcon size={12} color={color} variant="transparent" p={0}>
          <Icon size={10} />
        </ThemeIcon>
      }
      size="sm"
    >
      {t(`dashboard.queue.status.${status}`)}
    </Badge>
  );
}

export function DownloadQueueModal({ opened, onClose }: DownloadQueueModalProps) {
  const { t } = useTranslation('common');

  const queueQuery = trpc.manga.downloadQueue.useQuery(undefined, {
    enabled: opened,
    refetchInterval: opened ? 3000 : false,
  });

  const retryMutation = trpc.manga.retryJob.useMutation({
    onSuccess: () => queueQuery.refetch(),
  });

  const cancelMutation = trpc.manga.cancelJob.useMutation({
    onSuccess: () => queueQuery.refetch(),
  });

  const cleanMutation = trpc.manga.cleanQueue.useMutation({
    onSuccess: () => queueQuery.refetch(),
  });

  const now = Date.now();
  const twoMinutesAgo = now - 2 * 60 * 1000;

  // Show active, waiting, and anything that finished in the last 2 minutes
  const activeAndWaiting =
    queueQuery.data?.filter(
      (j) => j.status === 'active' || j.status === 'waiting' || (j.timestamp && j.timestamp > twoMinutesAgo),
    ) ?? [];

  const recent = queueQuery.data?.filter((j) => j.status === 'completed' || j.status === 'failed') ?? [];

  const renderTable = (jobs: typeof activeAndWaiting, showProgress = false) => {
    if (jobs.length === 0) {
      return (
        <Center py="xl">
          <Stack align="center" spacing="xs">
            <ThemeIcon size={48} radius="xl" color="gray" variant="light">
              <IconDownload size={24} />
            </ThemeIcon>
            <Text color="dimmed" size="sm">
              {t('dashboard.queue.noJobs')}
            </Text>
          </Stack>
        </Center>
      );
    }

    return (
      <ScrollArea sx={{ maxHeight: 400, overflowX: 'auto' }}>
        <Table highlightOnHover verticalSpacing="sm" fontSize="sm" sx={{ minWidth: 600 }}>
          <thead>
            <tr>
              <th>{t('dashboard.queue.col.manga')}</th>
              <th>{t('dashboard.queue.col.chapter')}</th>
              <th>{t('dashboard.queue.col.source')}</th>
              <th>{t('dashboard.queue.col.status')}</th>
              {showProgress && <th>{t('dashboard.queue.col.progress')}</th>}
              <th>{t('dashboard.queue.col.time')}</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>
                  <Text size="sm" weight={500} lineClamp={1} sx={{ maxWidth: 200 }}>
                    {job.mangaTitle}
                  </Text>
                </td>
                <td>#{job.chapterIndex}</td>
                <td>
                  <Text size="xs" color="dimmed">
                    {job.source}
                  </Text>
                </td>
                <td>
                  <Group spacing={8} noWrap>
                    {job.failedReason ? (
                      <Tooltip label={job.failedReason} withArrow multiline width={300}>
                        <Box sx={{ cursor: 'help' }}>
                          <StatusBadge status={job.status as JobStatus} t={t} />
                        </Box>
                      </Tooltip>
                    ) : (
                      <StatusBadge status={job.status as JobStatus} t={t} />
                    )}

                    {job.status === 'failed' && (
                      <ActionIcon
                        variant="subtle"
                        color="indigo"
                        size="xs"
                        onClick={() => retryMutation.mutate({ jobId: job.id })}
                        loading={retryMutation.isLoading}
                      >
                        <IconRefresh size={12} />
                      </ActionIcon>
                    )}

                    {(job.status === 'active' || job.status === 'waiting') && (
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        size="xs"
                        title={t('dashboard.queue.action.cancel', 'Cancel')}
                        onClick={() => cancelMutation.mutate({ jobId: job.id })}
                        loading={cancelMutation.isLoading}
                      >
                        <IconTrash size={12} />
                      </ActionIcon>
                    )}
                  </Group>
                </td>
                {showProgress && (
                  <td style={{ minWidth: 100 }}>
                    {job.status === 'active' ? (
                      <Progress
                        value={job.progress === 0 ? 100 : job.progress}
                        size="sm"
                        radius="xl"
                        color="teal"
                        animate={job.progress < 100}
                        striped={job.progress === 0}
                        label={job.progress > 0 ? `${job.progress}%` : undefined}
                      />
                    ) : job.status === 'completed' ? (
                      <Progress value={100} size="sm" radius="xl" color="green" />
                    ) : (
                      <Text size="xs" color="dimmed">
                        —
                      </Text>
                    )}
                  </td>
                )}
                <td>
                  <Text size="xs" color="dimmed">
                    {dayjs(job.processedOn || job.timestamp).fromNow()}
                  </Text>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </ScrollArea>
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group spacing="sm">
          <ThemeIcon size={28} radius="md" color="teal" variant="light">
            <IconDownload size={16} />
          </ThemeIcon>
          <Title order={4}>{t('dashboard.queue.title')}</Title>
        </Group>
      }
      size="85%"
      overlayOpacity={0.5}
      overlayBlur={3}
    >
      {queueQuery.isLoading ? (
        <Center py="xl">
          <Loader variant="dots" />
        </Center>
      ) : (
        <Tabs defaultValue="active" variant="pills" radius="md">
          <Group position="apart" mb="md">
            <Tabs.List>
              <Tabs.Tab
                value="active"
                icon={<IconActivity size={14} />}
                rightSection={
                  activeAndWaiting.length > 0 ? (
                    <Badge size="xs" variant="filled" color="teal" p={4} sx={{ minWidth: 18 }}>
                      {activeAndWaiting.length}
                    </Badge>
                  ) : undefined
                }
              >
                {t('dashboard.queue.tab.active')}
              </Tabs.Tab>
              <Tabs.Tab
                value="recent"
                icon={<IconHistoryToggle size={14} />}
                rightSection={
                  recent.length > 0 ? (
                    <Badge size="xs" variant="filled" color="gray" p={4} sx={{ minWidth: 18 }}>
                      {recent.length}
                    </Badge>
                  ) : undefined
                }
              >
                {t('dashboard.queue.tab.recent')}
              </Tabs.Tab>
            </Tabs.List>

            <Button
              variant="subtle"
              color="gray"
              size="xs"
              leftIcon={<IconTrash size={14} />}
              onClick={() => cleanMutation.mutate()}
              loading={cleanMutation.isLoading}
            >
              {t('dashboard.queue.action.clean')}
            </Button>
          </Group>

          <Tabs.Panel value="active">{renderTable(activeAndWaiting, true)}</Tabs.Panel>
          <Tabs.Panel value="recent">{renderTable(recent, false)}</Tabs.Panel>
        </Tabs>
      )}
    </Modal>
  );
}
