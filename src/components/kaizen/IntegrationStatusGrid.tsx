import {
  Grid,
  Title,
  Stack,
  Button,
  Collapse,
  Paper,
  Group,
  ThemeIcon,
  RingProgress,
  Center,
  Text,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';
import { IconCheck } from '@tabler/icons-react';
import { IntegrationHealthCard } from './IntegrationHealthCard';
import { FailedIntegrationsModal } from './FailedIntegrationsModal';
import { trpc } from '../../utils/trpc';
import { ApiExplorer } from './ApiExplorer';

export function IntegrationStatusGrid() {
  const { t } = useTranslation('settings');
  const utils = trpc.useContext();
  const settingsQuery = trpc.settings.query.useQuery();
  const mangaQuery = trpc.manga.query.useQuery();
  const failedQuery = trpc.manga.failedIntegrations.useQuery();
  const usersQuery = trpc.auth.getUsers.useQuery();
  const [showDocs, setShowDocs] = useState(false);
  const [showFailedModal, setShowFailedModal] = useState(false);

  const scanMutation = trpc.manga.scanLibrary.useMutation({
    onSuccess: () => {
      utils.manga.query.invalidate();
      utils.manga.failedIntegrations.invalidate();
    },
  });

  if (!settingsQuery.data) return null;

  const { appConfig } = settingsQuery.data;
  const mangas = mangaQuery.data || [];
  const totalMangas = mangas.length;
  const failedCount = failedQuery.data?.length || 0;

  // Optimized sync check using the non-injected query constraint
  const syncedMangas = mangas.filter(
    (m) => m._count && m._count.chapters > 0 && m.chapters && m.chapters.length === 0,
  ).length;

  const apiUsers = usersQuery.data || [];
  const serviceUsers = apiUsers.filter((u) => u.role === 'SERVICE');
  const totalApiConnections = serviceUsers.reduce((sum, u) => sum + (u.apiCallCount || 0), 0);

  // Only show Paperback card if at least one SERVICE user has ever connected via Paperback client
  const paperbackUsers = serviceUsers.filter((u) => u.lastUserAgent?.toLowerCase().includes('paperback'));
  const hasPaperbackConnected = paperbackUsers.length > 0;

  const lastConnectionUser = paperbackUsers
    .filter((u) => u.lastActiveAt)
    .sort((a, b) => new Date(b.lastActiveAt!).getTime() - new Date(a.lastActiveAt!).getTime())[0];
  const lastConnectionTime = lastConnectionUser?.lastActiveAt;

  // "Connected" = seen within the last 2 hours; "Seen" = seen but older; "Never" = no connection yet
  const now = Date.now();
  const paperbackStatus: 'connected' | 'seen' | 'never' = lastConnectionTime
    ? now - new Date(lastConnectionTime).getTime() < 2 * 60 * 60 * 1000
      ? 'connected'
      : 'seen'
    : 'never';

  const readMangas = mangas.filter((m) => m.isFullyRead).length;

  return (
    <Stack mb="xl">
      <Title order={4}>Integrations Status</Title>
      <Grid>
        {appConfig.kavitaEnabled && (
          <Grid.Col md={4}>
            <IntegrationHealthCard
              name="Kavita"
              status="healthy"
              syncedCount={syncedMangas}
              totalCount={totalMangas}
              failedCount={failedCount}
              onViewFailed={() => setShowFailedModal(true)}
              onSync={() => scanMutation.mutate()}
              isLoading={scanMutation.isLoading}
            />
          </Grid.Col>
        )}

        {appConfig.komgaEnabled && (
          <Grid.Col md={4}>
            <IntegrationHealthCard
              name="Komga"
              status="healthy"
              syncedCount={0}
              totalCount={totalMangas}
              onSync={() => scanMutation.mutate()}
              isLoading={scanMutation.isLoading}
            />
          </Grid.Col>
        )}

        {appConfig.telegramEnabled && (
          <Grid.Col md={4}>
            <IntegrationHealthCard
              name="Telegram Bot"
              status="healthy"
              syncedCount={totalMangas}
              totalCount={totalMangas}
            />
          </Grid.Col>
        )}

        {appConfig.apiEnabled && hasPaperbackConnected && (
          <Grid.Col md={4}>
            <Paper withBorder p="md" radius="md">
              <Group position="apart">
                <Stack spacing={0}>
                  <Title order={5}>Paperback</Title>
                  <Group spacing={5}>
                    <ThemeIcon
                      color={paperbackStatus === 'connected' ? 'teal' : paperbackStatus === 'seen' ? 'yellow' : 'gray'}
                      size="xs"
                      radius="xl"
                    >
                      <IconCheck size={10} />
                    </ThemeIcon>
                    <Text size="xs" color="dimmed">
                      {paperbackStatus === 'connected'
                        ? t('integrations.paperback.connected', 'Connected')
                        : paperbackStatus === 'seen'
                        ? t('integrations.paperback.seen', 'Last seen')
                        : t('integrations.paperback.never', 'Never connected')}
                    </Text>
                  </Group>
                </Stack>
                <RingProgress
                  size={80}
                  roundCaps
                  thickness={8}
                  sections={[
                    { value: totalMangas > 0 ? Math.round((readMangas / totalMangas) * 100) : 0, color: 'teal' },
                  ]}
                  label={
                    <Center>
                      <Text size="xs" weight={700}>
                        {totalMangas > 0 ? Math.round((readMangas / totalMangas) * 100) : 0}%
                      </Text>
                    </Center>
                  }
                />
              </Group>

              <Stack spacing="xs" mt="md">
                <Group position="apart">
                  <Text size="sm" color="dimmed">
                    {t('integrations.paperback.readProgress', 'Reading progress')}
                  </Text>
                  <Text size="sm" weight={500}>
                    {readMangas} / {totalMangas} {t('integrations.paperback.mangasRead', 'read')}
                  </Text>
                </Group>

                <Group position="apart">
                  <Text size="sm" color="dimmed">
                    {t('integrations.paperback.apiRequests', 'API requests')}
                  </Text>
                  <Text size="sm" weight={500}>
                    {totalApiConnections}
                  </Text>
                </Group>

                {lastConnectionTime && (
                  <Group position="apart">
                    <Text size="sm" color="dimmed">
                      {t('integrations.paperback.lastConnection', 'Last connection')}
                    </Text>
                    <Text size="xs" weight={500} color="dimmed" sx={{ whiteSpace: 'nowrap' }}>
                      {new Date(lastConnectionTime).toLocaleString()}
                    </Text>
                  </Group>
                )}
              </Stack>
            </Paper>
          </Grid.Col>
        )}

        {appConfig.apiEnabled && (
          <Grid.Col md={4}>
            <IntegrationHealthCard
              name="REST API"
              status="healthy"
              syncedCount={totalMangas}
              totalCount={totalMangas}
              action={
                <Button
                  variant="light"
                  color={showDocs ? 'red' : 'indigo'}
                  size="xs"
                  compact
                  onClick={() => setShowDocs(!showDocs)}
                >
                  {showDocs ? t('common.close', 'Cerrar') : t('auth.docsButton', 'Ver Docs')}
                </Button>
              }
            />
          </Grid.Col>
        )}
      </Grid>

      <Collapse in={showDocs}>
        <Paper
          p="md"
          mt="md"
          radius="md"
          shadow="md"
          withBorder
          sx={(theme) => ({
            backgroundColor: theme.colorScheme === 'dark' ? '#1e293b' : '#ffffff',
            borderColor: theme.colorScheme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
          })}
        >
          <ApiExplorer />
        </Paper>
      </Collapse>

      <FailedIntegrationsModal opened={showFailedModal} onClose={() => setShowFailedModal(false)} />
    </Stack>
  );
}
