import { Button, Group, Modal, ScrollArea, Table, Text, Title, Tooltip } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useTranslation } from 'next-i18next';
import { trpc } from '../../utils/trpc';

dayjs.extend(relativeTime);

export interface FailedIntegrationsModalProps {
  opened: boolean;
  onClose: () => void;
}

export function FailedIntegrationsModal({ opened, onClose }: FailedIntegrationsModalProps) {
  const { t } = useTranslation('common');
  const utils = trpc.useContext();

  const failedQuery = trpc.manga.failedIntegrations.useQuery(undefined, {
    enabled: opened,
  });

  const retryMutation = trpc.manga.retryFailedIntegration.useMutation({
    onSuccess: () => {
      utils.manga.failedIntegrations.invalidate();
      utils.manga.query.invalidate();
    },
  });

  const retryAllMutation = trpc.manga.retryAllFailedIntegrations.useMutation({
    onSuccess: () => {
      utils.manga.failedIntegrations.invalidate();
      utils.manga.query.invalidate();
    },
  });

  const failedList = failedQuery.data || [];

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Title order={3}>{t('failedIntegrations.title', 'Failed Metadata Integrations')}</Title>}
      size="75%"
      overlayOpacity={0.5}
      overlayBlur={3}
    >
      <Group mb="md" position="apart">
        <Text size="sm" color="dimmed">
          {t('failedIntegrations.subtitle', 'Manually retry failed chapter metadata injections.')}
        </Text>
        <Button
          leftIcon={<IconRefresh size={16} />}
          onClick={() => retryAllMutation.mutate()}
          loading={retryAllMutation.isLoading}
          disabled={failedList.length === 0}
          color="red"
        >
          {t('failedIntegrations.retryAll', 'Retry All Failed')}
        </Button>
      </Group>

      <ScrollArea sx={{ height: 400 }}>
        <Table highlightOnHover verticalSpacing="sm">
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
            {failedList.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <Text align="center" color="dimmed" py="md">
                    {t('failedIntegrations.noFailed', 'No failed integrations found.')}
                  </Text>
                </td>
              </tr>
            ) : (
              failedList.map((ch) => (
                <tr key={ch.id}>
                  <td>{ch.manga.title}</td>
                  <td>
                    #{ch.index} - {ch.fileName}
                  </td>
                  <td>{ch.manga.source}</td>
                  <td style={{ maxWidth: 300 }}>
                    <Tooltip label={ch.metadataError || 'Unknown error'} multiline width={400} withArrow>
                      <Text size="sm" lineClamp={2} color="red">
                        {ch.metadataError || 'Unknown error'}
                      </Text>
                    </Tooltip>
                  </td>
                  <td>{dayjs(ch.createdAt).fromNow()}</td>
                  <td>
                    <Button
                      size="xs"
                      compact
                      color="indigo"
                      variant="light"
                      leftIcon={<IconRefresh size={14} />}
                      onClick={() => retryMutation.mutate({ chapterId: ch.id })}
                      loading={retryMutation.isLoading && retryMutation.variables?.chapterId === ch.id}
                    >
                      {t('common.retry', 'Retry')}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </ScrollArea>
    </Modal>
  );
}
