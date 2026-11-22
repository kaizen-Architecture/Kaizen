import { Badge, Button, Divider, Group, Stack, Table, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { IconCheck, IconSparkles } from '@tabler/icons-react';
import { useTranslation } from 'next-i18next';
import { trpc } from '../../utils/trpc';

export function BetterSourceAdvisor() {
  const { t } = useTranslation('settings');
  const utils = trpc.useContext();

  const scanReleasingMutation = trpc.manga.scanReleasingBetterSources.useMutation();
  const switchPrimarySourceMutation = trpc.manga.switchMangaPrimarySource.useMutation({
    onSuccess: async () => {
      showNotification({
        title: t('maintenance.betterSourceSwitchedTitle', 'Source Switched'),
        message: t('maintenance.betterSourceSwitchedDesc', 'Primary source updated to the better source.'),
        color: 'teal',
        icon: <IconCheck size={16} />,
      });
      await Promise.all([utils.manga.all.invalidate(), utils.labs.listMangas.invalidate()]);
    },
  });

  return (
    <Stack spacing="sm">
      <Group position="apart">
        <div>
          <Group spacing="xs">
            <Title order={4}>{t('maintenance.betterSourceTitle', 'Better Source Advisor (Releasing Mangas)')}</Title>
            <Badge color="teal" variant="light">
              KAIZEN CORE
            </Badge>
          </Group>
          <Text size="sm" color="dimmed" mt={4}>
            {t(
              'maintenance.betterSourceDesc',
              'Scans your RELEASING mangas across active sources comparing real whole chapter numbers (ignoring split .1/.2 chapter inflation) and suggests sources with more chapters.',
            )}
          </Text>
        </div>
        <Button
          size="sm"
          color="teal"
          variant="light"
          leftIcon={<IconSparkles size={16} />}
          loading={scanReleasingMutation.isLoading}
          onClick={() => scanReleasingMutation.mutate({ limit: 15 })}
        >
          {t('maintenance.betterSourceBtn', 'Scan Releasing Mangas')}
        </Button>
      </Group>

      {scanReleasingMutation.data && (
        <>
          <Divider />
          {scanReleasingMutation.data.recommendations.length === 0 ? (
            <Text size="xs" color="teal">
              ✓ Scanned {scanReleasingMutation.data.scannedCount} releasing mangas — all are already on the most up-to-date source!
            </Text>
          ) : (
            <Table striped highlightOnHover verticalSpacing="xs">
              <thead>
                <tr>
                  <th>Manga</th>
                  <th>Current Source</th>
                  <th>Better Source</th>
                  <th>Gain</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {scanReleasingMutation.data.recommendations.map((rec) => (
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
                        Switch to {rec.bestSource}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </>
      )}
    </Stack>
  );
}
