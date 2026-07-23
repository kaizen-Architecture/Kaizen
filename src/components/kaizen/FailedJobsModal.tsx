import {
  ActionIcon,
  Button,
  Group,
  Menu,
  Modal,
  ScrollArea,
  Select,
  Table,
  Text,
  Title,
  Tooltip,
  Stack,
  Box,
} from '@mantine/core';
import { IconRefresh, IconDotsVertical, IconDownload, IconSwitchHorizontal } from '@tabler/icons-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { trpc } from '../../utils/trpc';

dayjs.extend(relativeTime);

function RecoveryOptionsModal({
  job,
  availableSources,
  onClose,
  onDownloadAlternative,
  onSwitchSource,
  isLoadingDownload,
  isLoadingSwitch,
  t,
}: {
  job: any | null;
  availableSources: string[];
  onClose: () => void;
  onDownloadAlternative: (source: string) => void;
  onSwitchSource: (source: string) => void;
  isLoadingDownload: boolean;
  isLoadingSwitch: boolean;
  t: any;
}) {
  const configuredSources: string[] = job?.configuredSources || [];
  const otherSources: string[] = availableSources.filter((s) => !configuredSources.includes(s));

  const [selectedSource, setSelectedSource] = useState<string>('');

  useEffect(() => {
    if (job) {
      const configured: string[] = job.configuredSources || [];
      // Find a configured source that is NOT the currently failing source
      const validConfigured = configured.find((s) => s !== job.source);
      if (validConfigured) {
        setSelectedSource(validConfigured);
      } else if (availableSources.length > 0) {
        // Fallback to any available system source that is NOT the failing source
        const alt = availableSources.find((s) => s !== job.source) || availableSources[0];
        setSelectedSource(alt || '');
      }
    }
  }, [job, availableSources]);

  if (!job) return null;

  const selectData = [
    ...configuredSources.map((s) => ({
      value: s,
      label: s === job.source ? `✅ ${s}` : `✅ ${s}`,
      group: t('failedJobs.groupVerified', 'Verified Sources for this Manga'),
    })),
    ...otherSources.map((s) => ({
      value: s,
      label: s,
      group: t('failedJobs.groupOther', 'Other System Sources (Unverified)'),
    })),
  ];

  return (
    <Modal
      opened={!!job}
      onClose={onClose}
      title={<Title order={4}>{t('failedJobs.recoveryTitle', 'Recovery Options & Sources')}</Title>}
      centered
      size="md"
      overlayOpacity={0.55}
      overlayBlur={3}
      zIndex={300}
    >
      <Stack spacing="md">
        <Box
          sx={(theme) => ({
            padding: theme.spacing.sm,
            backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[0],
            borderRadius: theme.radius.md,
          })}
        >
          <Text size="sm" weight={600} lineClamp={1}>
            📖 {t('common.manga', 'Manga')}: {job.mangaTitle}
          </Text>
          <Text size="xs" color="dimmed" mt={4}>
            🔖 {t('failedJobs.failedChapter', 'Failed chapter:')} #{job.chapterIndex}
          </Text>
          <Text size="xs" color="dimmed" mt={2}>
            🔌 {t('failedJobs.failedSource', 'Current failing source:')}{' '}
            <Text component="span" weight={600} color="red">
              {job.source}
            </Text>
          </Text>
        </Box>

        <Select
          label={t('failedJobs.selectLabel', 'Select Alternative Source')}
          description={t(
            'failedJobs.recoveryDesc',
            'Sources marked with ✅ have been configured/verified for this manga',
          )}
          data={selectData}
          value={selectedSource}
          onChange={(val) => setSelectedSource(val || '')}
          searchable
          maxDropdownHeight={250}
        />

        <Group position="apart" grow mt="md">
          <Button
            color="teal"
            variant="light"
            leftIcon={<IconDownload size={16} />}
            onClick={() => onDownloadAlternative(selectedSource)}
            loading={isLoadingDownload}
            disabled={!selectedSource}
          >
            {t('failedJobs.downloadBtn', 'Download Chapter')}
          </Button>
          <Button
            color="indigo"
            variant="filled"
            leftIcon={<IconSwitchHorizontal size={16} />}
            onClick={() => onSwitchSource(selectedSource)}
            loading={isLoadingSwitch}
            disabled={!selectedSource}
          >
            {t('failedJobs.switchBtn', 'Switch Source')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export interface FailedJobsModalProps {
  opened: boolean;
  onClose: () => void;
}

export function FailedJobsModal({ opened, onClose }: FailedJobsModalProps) {
  const { t } = useTranslation('common');
  const [failedSourceFilter, setFailedSourceFilter] = useState<string | null>(null);
  const [selectedRecoveryJob, setSelectedRecoveryJob] = useState<any | null>(null);

  const utils = trpc.useContext();

  const failedJobsQuery = trpc.manga.failedJobs.useQuery(undefined, {
    enabled: opened,
  });

  const retryJobMutation = trpc.manga.retryJob.useMutation({
    onSuccess: () => {
      utils.manga.failedJobs.invalidate();
      utils.manga.activity.invalidate();
      utils.manga.failureStatsBySource.invalidate();
    },
  });

  const retryAllJobsMutation = trpc.manga.retryAllFailedJobs.useMutation({
    onSuccess: () => {
      utils.manga.failedJobs.invalidate();
      utils.manga.activity.invalidate();
      utils.manga.failureStatsBySource.invalidate();
    },
  });

  const sourcesQuery = trpc.manga.sources.useQuery(undefined, {
    enabled: opened,
  });
  const availableSources = sourcesQuery.data || [];

  const downloadAlternativeMutation = trpc.manga.downloadChapterFromAlternativeSource.useMutation({
    onSuccess: () => {
      utils.manga.failedJobs.invalidate();
      utils.manga.activity.invalidate();
      utils.manga.failureStatsBySource.invalidate();
    },
  });

  const switchSourceMutation = trpc.manga.switchMangaPrimarySource.useMutation({
    onSuccess: () => {
      utils.manga.failedJobs.invalidate();
      utils.manga.activity.invalidate();
      utils.manga.failureStatsBySource.invalidate();
    },
  });

  const filteredJobs =
    failedJobsQuery.data?.filter((job) => (failedSourceFilter ? job.source === failedSourceFilter : true)) || [];

  const sourcesList = [...new Set(failedJobsQuery.data?.map((j) => j.source) || [])].map((s) => ({
    value: s,
    label: s,
  }));

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Title order={3}>{t('failedJobs.title', 'Kaizen Failed Download Jobs')}</Title>}
      size="75%"
      overlayOpacity={0.5}
      overlayBlur={3}
    >
      <Group mb="md" position="apart">
        <Select
          placeholder={t('failedJobs.filterPlaceholder', 'Filter by Source')}
          data={sourcesList}
          value={failedSourceFilter}
          onChange={setFailedSourceFilter}
          clearable
        />
        <Button
          leftIcon={<IconRefresh size={16} />}
          onClick={() => retryAllJobsMutation.mutate({ source: failedSourceFilter })}
          loading={retryAllJobsMutation.isLoading}
          disabled={!failedJobsQuery.data || filteredJobs.length === 0}
        >
          {failedSourceFilter
            ? t('failedJobs.retrySelected', {
                defaultValue: `Retry ${failedSourceFilter} Failed`,
                source: failedSourceFilter,
              })
            : t('failedJobs.retryAll', 'Retry All Failed')}
        </Button>
      </Group>

      <ScrollArea sx={{ height: 400, overflowX: 'auto' }}>
        <Table highlightOnHover verticalSpacing="sm" sx={{ minWidth: 600 }}>
          <thead>
            <tr>
              <th>{t('common.manga', 'Manga')}</th>
              <th>{t('dashboard.queue.col.chapter', 'Chapter')}</th>
              <th>{t('common.source', 'Source')}</th>
              <th>{t('dashboard.queue.col.reason', 'Error')}</th>
              <th>{t('dashboard.queue.col.time', 'Time')}</th>
              <th>{t('common.actions', 'Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredJobs.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <Text align="center" color="dimmed" py="md">
                    {t('failedJobs.noFailed', 'No failed jobs found.')}
                  </Text>
                </td>
              </tr>
            ) : (
              filteredJobs.map((job) => (
                <tr key={job.id}>
                  <td>{job.mangaTitle}</td>
                  <td>{job.chapterIndex}</td>
                  <td>{job.source}</td>
                  <td style={{ maxWidth: 300 }}>
                    <Tooltip label={job.failedReason || 'Unknown error'} multiline width={400} withArrow>
                      <Text size="sm" lineClamp={2}>
                        {job.failedReason || 'Unknown error'}
                      </Text>
                    </Tooltip>
                  </td>
                  <td>{dayjs(job.timestamp).fromNow()}</td>
                  <td>
                    <Group spacing={4} noWrap>
                      <Button
                        size="xs"
                        compact
                        color="indigo"
                        variant="light"
                        leftIcon={<IconRefresh size={14} />}
                        onClick={() => retryJobMutation.mutate({ jobId: job.id! })}
                        loading={retryJobMutation.isLoading && retryJobMutation.variables?.jobId === job.id}
                      >
                        {t('failedJobs.retry', 'Retry')}
                      </Button>

                      <Button
                        size="xs"
                        compact
                        color="teal"
                        variant="light"
                        leftIcon={<IconSwitchHorizontal size={14} />}
                        onClick={() => setSelectedRecoveryJob(job)}
                      >
                        {t('failedJobs.alternatives', 'Alternatives')}
                      </Button>
                    </Group>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </ScrollArea>

      <RecoveryOptionsModal
        job={selectedRecoveryJob}
        availableSources={availableSources}
        onClose={() => setSelectedRecoveryJob(null)}
        onDownloadAlternative={(src) => {
          if (selectedRecoveryJob) {
            downloadAlternativeMutation.mutate({
              jobId: selectedRecoveryJob.id!,
              mangaId: selectedRecoveryJob.mangaId,
              chapterIndex: selectedRecoveryJob.chapterIndex,
              newSource: src,
            });
            setSelectedRecoveryJob(null);
          }
        }}
        onSwitchSource={(src) => {
          if (selectedRecoveryJob) {
            switchSourceMutation.mutate({
              mangaId: selectedRecoveryJob.mangaId,
              newSource: src,
            });
            setSelectedRecoveryJob(null);
          }
        }}
        isLoadingDownload={downloadAlternativeMutation.isLoading}
        isLoadingSwitch={switchSourceMutation.isLoading}
        t={t}
      />
    </Modal>
  );
}
