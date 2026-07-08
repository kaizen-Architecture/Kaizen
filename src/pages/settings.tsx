import { Container, Stack, Title, Text, Paper, Tabs, Box, Button, Alert, Group, Badge, ThemeIcon } from '@mantine/core';
import { IconCheck, IconAlertCircle, IconRefresh } from '@tabler/icons-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { IntegrationSettings } from '../components/settings/integration';
import { MangalSettings } from '../components/settings/mangal';
import { NotificationSettings } from '../components/settings/notification';
import { SwitchTheme } from '../components/settings/switchTheme';
import { GithubSettings } from '../components/settings/github';
import { DownloadSettings } from '../components/kaizen/DownloadSettings';
import { MetadataSettings } from '../components/kaizen/MetadataSettings';
import { StatusAuditSettings } from '../components/kaizen/StatusAuditSettings';
import { AuthSettings } from '../components/kaizen/AuthSettings';
import { DeveloperSettings } from '../components/kaizen/DeveloperSettings';
import { DatabaseSettings } from '../components/kaizen/DatabaseSettings';
import ServerLogViewer from '../components/kaizen/ServerLogViewer';
import { ReaderModuleToggle } from '../components/kaizen/ReaderModuleToggle';
import { trpc } from '../utils/trpc';
import { UpdateInfoModal } from '../components/kaizen/UpdateInfoModal';

export default function SettingsPage() {
  const { t } = useTranslation('settings');
  const [refreshResult, setRefreshResult] = useState<{
    total: number;
    updated: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  const refreshAll = trpc.manga.refreshAllMetadata.useMutation({
    onSuccess: (data) => setRefreshResult(data),
  });

  const router = useRouter();
  const [activeTab, setActiveTab] = useState('general');

  const [updateModalOpened, setUpdateModalOpened] = useState(false);
  const updateCheck = trpc.settings.checkForUpdates.useQuery(undefined, {
    staleTime: 12 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (router.isReady && router.query.tab) {
      setActiveTab(router.query.tab as string);
    } else if (router.isReady && !router.query.tab) {
      setActiveTab('general');
    }
  }, [router.asPath, router.query.tab, router.isReady]);

  const handleTabChange = (val: string) => {
    const href = `/settings?tab=${val}`;
    router.push(href, href, { shallow: true });
  };

  return (
    <Container size="xl" py="md">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Stack spacing="xs" mb="xl">
          <Title
            order={2}
            sx={(theme) => ({ color: theme.colorScheme === 'dark' ? theme.white : theme.colors.dark[7] })}
          >
            {t('title')}
          </Title>
          <Text
            size="sm"
            sx={(theme) => ({ color: theme.colorScheme === 'dark' ? theme.colors.gray[5] : theme.colors.gray[7] })}
          >
            {t('description')}
          </Text>
        </Stack>
      </motion.div>

      <Tabs value={activeTab} onTabChange={handleTabChange} radius="md">
        <Box sx={{ flex: 1 }}>
          <Tabs.Panel value="general">
            <Paper withBorder p="md" radius="md">
              <Title order={4} mb="md">
                {t('tabs.appearance')}
              </Title>
              <SwitchTheme />
            </Paper>
          </Tabs.Panel>

          <Tabs.Panel value="notifications">
            <Paper withBorder p="md" radius="md">
              <Title order={4} mb="md">
                {t('tabs.notifications')}
              </Title>
              <NotificationSettings />
            </Paper>
          </Tabs.Panel>

          <Tabs.Panel value="integrations">
            <Paper withBorder p="md" radius="md">
              <Title order={4} mb="md">
                {t('tabs.integrations')}
              </Title>
              <IntegrationSettings />
            </Paper>
          </Tabs.Panel>

          <Tabs.Panel value="sources">
            <Paper withBorder p="md" radius="md">
              <Title order={4} mb="md">
                {t('tabs.sourceRepository')}
              </Title>
              <Text size="sm" color="dimmed" mb="lg">
                {t('tabs.sourceRepositoryDescription')}
              </Text>
              <GithubSettings />
            </Paper>
          </Tabs.Panel>

          <Tabs.Panel value="mangal">
            <Paper withBorder p="md" radius="md">
              <Title order={4} mb="md">
                {t('tabs.mangalCore')}
              </Title>
              <MangalSettings />
            </Paper>
          </Tabs.Panel>

          <Tabs.Panel value="downloads">
            <Paper withBorder p="md" radius="md">
              <Title order={4} mb="md">
                {t('tabs.downloads')}
              </Title>
              <DownloadSettings />
            </Paper>
          </Tabs.Panel>

          <Tabs.Panel value="accounts">
            <Stack spacing="md">
              <Paper withBorder p="md" radius="md">
                <Title order={4} mb="md">
                  {t('tabs.accounts', 'Security & Accounts')}
                </Title>
                <AuthSettings />
              </Paper>

              <Paper withBorder p="md" radius="md">
                <Title order={4} mb="xs">
                  {t('tabs.readerModule', 'Reader Module')}
                </Title>
                <Text size="sm" color="dimmed" mb="md">
                  {t(
                    'tabs.readerModuleDesc',
                    'Globally enable or disable the integrated manga and comic reader. When disabled, the Reader switch will not appear in the header.',
                  )}
                </Text>
                <ReaderModuleToggle />
              </Paper>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="developer">
            <Paper withBorder p="md" radius="md">
              <Title order={4} mb="md">
                {t('tabs.developer', 'Development')}
              </Title>
              <DeveloperSettings />
            </Paper>
          </Tabs.Panel>

          <Tabs.Panel value="database">
            <Paper withBorder p="md" radius="md">
              <Title order={4} mb="md">
                {t('tabs.database', 'Database')}
              </Title>
              <DatabaseSettings />
            </Paper>
          </Tabs.Panel>

          <Tabs.Panel value="maintenance">
            <Stack spacing="md">
              <Paper withBorder p="md" radius="md">
                <Stack spacing="sm">
                  <Group position="apart">
                    <Group spacing="sm">
                      <ThemeIcon
                        size={36}
                        radius="md"
                        color={updateCheck.data?.updateAvailable ? 'orange' : 'indigo'}
                        variant="light"
                      >
                        <IconRefresh size={20} />
                      </ThemeIcon>
                      <div>
                        <Title order={4}>{t('updates.title', 'Application Updates')}</Title>
                        <Text size="sm" color="dimmed" mt={4}>
                          {updateCheck.data?.updateAvailable
                            ? t('updates.updateAvailable', 'Update Available')
                            : t('updates.upToDate', 'You are up to date')}
                        </Text>
                      </div>
                    </Group>
                    <Group spacing="xs">
                      <Text size="sm" color="dimmed">
                        {t('updates.currentVersion', 'Current Version')}:{' '}
                        <strong>v{updateCheck.data?.currentVersion || '...'}</strong>
                      </Text>
                      {updateCheck.data?.updateAvailable && (
                        <>
                          <Badge color="orange" variant="filled">
                            v{updateCheck.data?.latestVersion}
                          </Badge>
                          <Button size="xs" color="orange" variant="light" onClick={() => setUpdateModalOpened(true)}>
                            {t('updates.viewReleaseNotes', 'View Release Notes')}
                          </Button>
                        </>
                      )}
                    </Group>
                  </Group>
                </Stack>
              </Paper>

              <Paper withBorder p="md" radius="md">
                <StatusAuditSettings />
              </Paper>
              <Paper withBorder p="md" radius="md">
                <MetadataSettings />
              </Paper>
              <ServerLogViewer />
              <Paper withBorder p="md" radius="md">
                <Stack spacing="sm">
                  <Group position="apart">
                    <div>
                      <Title order={4}>{t('maintenance.refreshTitle', 'Refresh All Metadata')}</Title>
                      <Text size="sm" color="dimmed" mt={4}>
                        {t(
                          'maintenance.refreshDesc',
                          'Searches all manga missing a cover or summary and fetches their data from Anilist, with automatic fallback to MangaDex for titles not found.',
                        )}
                      </Text>
                    </div>
                    <Button
                      leftIcon={<IconRefresh size={16} />}
                      loading={refreshAll.isLoading}
                      onClick={() => {
                        setRefreshResult(null);
                        refreshAll.mutate();
                      }}
                      variant="light"
                      color="indigo"
                    >
                      {refreshAll.isLoading
                        ? t('maintenance.refreshBtnLoading', 'Refreshing...')
                        : t('maintenance.refreshBtn', 'Refresh All Metadata')}
                    </Button>
                  </Group>

                  {refreshAll.isError && (
                    <Alert icon={<IconAlertCircle size={16} />} color="red" radius="md">
                      {t('maintenance.cleanupError', 'Error')}: {refreshAll.error?.message}
                    </Alert>
                  )}

                  {refreshResult && (
                    <Alert icon={<IconCheck size={16} />} color="teal" radius="md">
                      <Group spacing="xs">
                        <Text size="sm" weight={600}>
                          {t('maintenance.refreshSuccess', 'Done!')}
                        </Text>
                        <Badge color="teal" size="sm">
                          {t('maintenance.refreshUpdated', '{{count}} updated', { count: refreshResult.updated })}
                        </Badge>
                        <Badge color="gray" size="sm">
                          {t('maintenance.refreshSkipped', '{{count}} skipped', { count: refreshResult.skipped })}
                        </Badge>
                        {refreshResult.errors.length > 0 && (
                          <Badge color="red" size="sm">
                            {t('maintenance.refreshErrors', '{{count}} errors', { count: refreshResult.errors.length })}
                          </Badge>
                        )}
                        <Text size="xs" color="dimmed">
                          {t('maintenance.refreshChecked', 'out of {{count}} manga checked', {
                            count: refreshResult.total,
                          })}
                        </Text>
                      </Group>
                      {refreshResult.errors.length > 0 && (
                        <Text size="xs" color="red" mt={4}>
                          {t('maintenance.refreshFailed', 'Failed: {{errors}}', {
                            errors: refreshResult.errors.join(', '),
                          })}
                        </Text>
                      )}
                    </Alert>
                  )}
                </Stack>
              </Paper>
            </Stack>
          </Tabs.Panel>
        </Box>
      </Tabs>
      <UpdateInfoModal
        opened={updateModalOpened}
        onClose={() => setUpdateModalOpened(false)}
        updateInfo={updateCheck.data || null}
      />
    </Container>
  );
}

export async function getServerSideProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ['common', 'settings'])),
    },
  };
}
