import { Badge, Button, Divider, Group, Progress, Select, Stack, Table, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { IconCheck, IconPlayerStop, IconSparkles } from '@tabler/icons-react';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';
import { trpc } from '../../utils/trpc';

export function BetterSourceAdvisor() {
  const { t } = useTranslation('settings');
  const utils = trpc.useContext();
  const [batchSize, setBatchSize] = useState<string>('15');
  const [switchedIds, setSwitchedIds] = useState<number[]>([]);

  const statusQuery = trpc.manga.getBetterSourceScanStatus.useQuery(undefined, {
    refetchInterval: (data) => (data?.isRunning ? 2000 : false),
    refetchOnWindowFocus: false,
  });

  const startScanMutation = trpc.manga.startBetterSourceScan.useMutation({
    onSuccess: async () => {
      setSwitchedIds([]);
      await utils.manga.getBetterSourceScanStatus.invalidate();
    },
  });

  const cancelScanMutation = trpc.manga.cancelBetterSourceScan.useMutation({
    onSuccess: async () => {
      await utils.manga.getBetterSourceScanStatus.invalidate();
    },
  });

  const switchPrimarySourceMutation = trpc.manga.switchMangaPrimarySource.useMutation({
    onSuccess: async (_res, vars) => {
      setSwitchedIds((prev) => (prev.includes(vars.mangaId) ? prev : [...prev, vars.mangaId]));
      showNotification({
        title: t('maintenance.betterSourceSwitchedTitle', 'Source Switched'),
        message: t('maintenance.betterSourceSwitchedDesc', 'Primary source updated to the better source.'),
        color: 'teal',
        icon: <IconCheck size={16} />,
      });
      await Promise.all([utils.manga.query.invalidate(), utils.manga.getBetterSourceScanStatus.invalidate()]);
    },
  });

  const scan = statusQuery.data;
  const isRunning = scan?.isRunning ?? false;
  const processed = scan?.processedCount ?? 0;
  const total = scan?.totalCount ?? 0;
  const totalReleasing = scan?.totalReleasingInLibrary ?? 0;
  const percent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
  const recommendations = scan?.recommendations || [];
  const hasFinished = !isRunning && !!scan?.finishedAt;

  const handleStart = () => {
    const limit = batchSize === 'all' ? undefined : parseInt(batchSize, 10);
    startScanMutation.mutate({ limit });
  };

  return (
    <Stack spacing="sm">
      <Group position="apart" align="flex-start">
        <div style={{ flex: 1 }}>
          <Group spacing="xs">
            <Title order={4}>{t('maintenance.betterSourceTitle', 'Better Source Advisor (Releasing Mangas)')}</Title>
            <Badge color="teal" variant="light">
              {totalReleasing} RELEASING
            </Badge>
          </Group>
          <Text size="sm" color="dimmed" mt={4}>
            {t(
              'maintenance.betterSourceDesc',
              'Scans your RELEASING mangas in background comparing real whole chapter numbers (ignoring split .1/.2 chapter inflation) and streams recommendations live.',
            )}
          </Text>
        </div>

        <Group spacing="xs">
          <Select
            size="xs"
            w={170}
            disabled={isRunning}
            value={batchSize}
            onChange={(val) => val && setBatchSize(val)}
            data={[
              { value: '15', label: t('maintenance.betterSourceBatch15', 'Latest 15 releasing') },
              { value: '30', label: t('maintenance.betterSourceBatch30', 'Latest 30 releasing') },
              { value: '50', label: t('maintenance.betterSourceBatch50', 'Latest 50 releasing') },
              {
                value: 'all',
                label: t('maintenance.betterSourceBatchAll', {
                  count: totalReleasing,
                  defaultValue: `All releasing (${totalReleasing})`,
                }),
              },
            ]}
          />

          {isRunning ? (
            <Button
              size="xs"
              color="red"
              variant="light"
              leftIcon={<IconPlayerStop size={14} />}
              loading={cancelScanMutation.isLoading}
              onClick={() => cancelScanMutation.mutate()}
            >
              {t('maintenance.betterSourceCancelBtn', 'Cancel Scan')}
            </Button>
          ) : (
            <Button
              size="xs"
              color="teal"
              variant="filled"
              leftIcon={<IconSparkles size={14} />}
              loading={startScanMutation.isLoading}
              disabled={totalReleasing === 0}
              onClick={handleStart}
            >
              {t('maintenance.betterSourceBtn', 'Scan Releasing Mangas')}
            </Button>
          )}
        </Group>
      </Group>

      {/* Live Progress Bar */}
      {(isRunning || hasFinished) && (
        <Stack spacing={6}>
          <Group position="apart">
            <Text size="xs" weight={600} color={isRunning ? 'teal' : scan?.cancelled ? 'orange' : 'dimmed'}>
              {isRunning
                ? t('maintenance.betterSourceScanning', {
                    current: Math.min(processed + 1, total),
                    total,
                    title: scan?.currentMangaTitle || '...',
                    defaultValue: `Scanning ${Math.min(processed + 1, total)} / ${total}: ${
                      scan?.currentMangaTitle || '...'
                    }`,
                  })
                : scan?.cancelled
                ? t('maintenance.betterSourceCancelled', {
                    processed,
                    total,
                    found: recommendations.length,
                    defaultValue: `Scan cancelled at ${processed} / ${total} mangas (${recommendations.length} better source(s) found)`,
                  })
                : t('maintenance.betterSourceCompleted', {
                    processed,
                    total,
                    found: recommendations.length,
                    defaultValue: `Completed: scanned ${processed} / ${total} releasing mangas (${recommendations.length} better source(s) found)`,
                  })}
            </Text>
            <Text size="xs" weight={600} color="dimmed">
              {percent}%
            </Text>
          </Group>
          <Progress
            value={percent}
            color={scan?.cancelled ? 'orange' : 'teal'}
            size="md"
            radius="xl"
            striped={isRunning}
            animate={isRunning}
          />
        </Stack>
      )}

      {/* Streaming / Completed Recommendations Table */}
      {(recommendations.length > 0 || hasFinished) && (
        <>
          <Divider />
          {recommendations.length === 0 && hasFinished ? (
            <Text size="xs" color="teal">
              {t('maintenance.betterSourceAllUpToDate', {
                count: processed,
                defaultValue: `✓ Scanned ${processed} releasing mangas — all are already on the most up-to-date source!`,
              })}
            </Text>
          ) : (
            <Table striped highlightOnHover verticalSpacing="xs">
              <thead>
                <tr>
                  <th>{t('maintenance.betterSourceColManga', 'Manga')}</th>
                  <th>{t('maintenance.betterSourceColCurrent', 'Current Source')}</th>
                  <th>{t('maintenance.betterSourceColBetter', 'Better Source')}</th>
                  <th>{t('maintenance.betterSourceColGain', 'Gain')}</th>
                  <th style={{ textAlign: 'right' }}>{t('maintenance.betterSourceColAction', 'Action')}</th>
                </tr>
              </thead>
              <tbody>
                {recommendations.map((rec) => {
                  const alreadySwitched = switchedIds.includes(rec.mangaId);
                  return (
                    <tr key={rec.mangaId}>
                      <td>
                        <Text size="xs" weight={600}>
                          {rec.title}
                        </Text>
                      </td>
                      <td>
                        <Badge variant="outline" color="gray" size="sm">
                          {rec.currentSource} (Ch. {rec.currentMaxChapter})
                        </Badge>
                      </td>
                      <td>
                        <Badge color="teal" variant="light" size="sm">
                          {rec.bestSource} (Ch. {rec.bestMaxChapter})
                        </Badge>
                      </td>
                      <td>
                        <Badge color="teal" variant="filled" size="sm">
                          +{rec.delta} ch.
                        </Badge>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {alreadySwitched ? (
                          <Badge color="green" variant="light" size="sm">
                            {t('maintenance.betterSourceSwitchedBadge', '✓ Switched')}
                          </Badge>
                        ) : (
                          <Button
                            size="xs"
                            color="teal"
                            loading={switchPrimarySourceMutation.isLoading}
                            onClick={() =>
                              switchPrimarySourceMutation.mutate({
                                mangaId: rec.mangaId,
                                newSource: rec.bestSource,
                                newSourceTitle: rec.bestMatchedTitle,
                              })
                            }
                          >
                            {t('maintenance.betterSourceSwitchBtn', {
                              source: rec.bestSource,
                              defaultValue: `Switch to ${rec.bestSource}`,
                            })}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </>
      )}
    </Stack>
  );
}
