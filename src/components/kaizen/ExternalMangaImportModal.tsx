import {
  Modal,
  Title,
  Text,
  Group,
  Button,
  Stack,
  Card,
  Image,
  Badge,
  Grid,
  Loader,
  Center,
  Alert,
  Tooltip,
} from '@mantine/core';
import { IconCheck, IconDownload, IconExternalLink, IconRefresh, IconSparkles } from '@tabler/icons-react';
import { useTranslation } from 'next-i18next';
import { showNotification } from '@mantine/notifications';
import { trpc } from '../../utils/trpc';

interface ExternalMangaImportModalProps {
  opened: boolean;
  onClose: () => void;
}

export function ExternalMangaImportModal({ opened, onClose }: ExternalMangaImportModalProps) {
  const { t } = useTranslation(['common', 'settings']);
  const utils = trpc.useContext();
  const query = trpc.settings.getUnaddedExternalMangas.useQuery(undefined, {
    enabled: opened,
  });

  const importMutation = trpc.settings.importExternalManga.useMutation({
    onSuccess: () => {
      utils.manga.query.invalidate();
      utils.settings.getUnaddedExternalMangas.invalidate();
    },
  });

  const items = query.data || [];

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group spacing="xs">
          <IconSparkles size={20} color="#339af0" />
          <Title order={4}>{t('externalImport.title', 'Import from External Reading Lists')}</Title>
        </Group>
      }
      size="xl"
      radius="md"
    >
      <Stack spacing="md">
        <Text size="sm" color="dimmed">
          {t(
            'externalImport.description',
            'These titles were found in your external reading trackers (AniList) but are not in your Kaizen library yet. You can add them with one click to start downloading.',
          )}
        </Text>

        <Group position="apart">
          <Badge size="lg" variant="light" color="blue">
            {t('externalImport.pendingCount', '{{count}} pending titles', { count: items.length })}
          </Badge>
          <Button
            size="xs"
            variant="subtle"
            leftIcon={<IconRefresh size={14} />}
            loading={query.isFetching}
            onClick={() => query.refetch()}
          >
            {t('externalImport.refresh', 'Refresh')}
          </Button>
        </Group>

        {query.isLoading ? (
          <Center py="xl">
            <Loader size="md" color="indigo" />
          </Center>
        ) : query.isError ? (
          <Alert color="red" title="Error">
            {query.error?.message || 'Failed to fetch recommendations'}
          </Alert>
        ) : items.length === 0 ? (
          <Alert color="teal" icon={<IconCheck size={16} />} title={t('externalImport.emptyTitle', 'All synced!')}>
            {t(
              'externalImport.emptyDesc',
              'No unadded titles found on your external trackers. All your reading list titles are already in Kaizen!',
            )}
          </Alert>
        ) : (
          <Grid>
            {items.map((item) => {
              const providerColor = item.provider === 'anilist' ? 'blue' : 'purple';
              const statusColor = item.status === 'READING' ? 'teal' : item.status === 'PLAN_TO_READ' ? 'orange' : 'gray';

              return (
                <Grid.Col key={`${item.provider}-${item.id}`} span={12} sm={6} md={4}>
                  <Card withBorder p="sm" radius="md" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <Card.Section p="xs" sx={{ position: 'relative' }}>
                      <Image
                        src={item.coverUrl || '/cover-not-found.jpg'}
                        height={180}
                        fit="cover"
                        alt={item.title}
                        radius="sm"
                        withPlaceholder
                      />
                      <Badge
                        color={providerColor}
                        variant="filled"
                        size="xs"
                        sx={{ position: 'absolute', top: 12, right: 12 }}
                      >
                        {item.provider.toUpperCase()}
                      </Badge>
                    </Card.Section>

                    <Stack spacing="xs" mt="xs" sx={{ flex: 1, justifyContent: 'space-between' }}>
                      <div>
                        <Tooltip label={item.title} withinPortal>
                          <Text weight={600} size="sm" lineClamp={2}>
                            {item.title}
                          </Text>
                        </Tooltip>
                        <Group spacing={4} mt={4}>
                          <Badge color={statusColor} size="xs" variant="light">
                            {item.status.replace('_', ' ')}
                          </Badge>
                          {item.progress !== undefined && item.progress > 0 && (
                            <Badge color="gray" size="xs" variant="outline">
                              Ch. {item.progress}
                            </Badge>
                          )}
                        </Group>
                      </div>

                      <Group position="apart" pt="xs">
                        {item.providerUrl && (
                          <Button
                            component="a"
                            href={item.providerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            size="xs"
                            variant="subtle"
                            compact
                            leftIcon={<IconExternalLink size={12} />}
                          >
                            Link
                          </Button>
                        )}
                        <Button
                          size="xs"
                          color="indigo"
                          variant="filled"
                          leftIcon={<IconDownload size={14} />}
                          loading={importMutation.isLoading}
                          onClick={async () => {
                            try {
                              const res = await importMutation.mutateAsync({
                                title: item.title,
                                externalUrl: item.providerUrl,
                                externalProgress: item.progress,
                              });
                              showNotification({
                                title: t('externalImport.successTitle', 'Added to Kaizen'),
                                message: res.message,
                                color: 'teal',
                                icon: <IconCheck size={16} />,
                              });
                            } catch (err: any) {
                              showNotification({
                                title: t('externalImport.errorTitle', 'Failed to add'),
                                message: err?.message || 'Error adding manga',
                                color: 'red',
                              });
                            }
                          }}
                        >
                          {t('externalImport.addBtn', 'Add & Download')}
                        </Button>
                      </Group>
                    </Stack>
                  </Card>
                </Grid.Col>
              );
            })}
          </Grid>
        )}
      </Stack>
    </Modal>
  );
}
