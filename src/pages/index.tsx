import { Container, Text, Title, ScrollArea, Tabs, Paper } from '@mantine/core';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { IconDashboard, IconPlug, IconStack2, IconUsers, IconBell } from '@tabler/icons-react';
import { trpc } from '../utils/trpc';
import { FailedJobsModal } from '../components/kaizen/FailedJobsModal';
import { DownloadQueueModal } from '../components/kaizen/DownloadQueueModal';
import { OverviewTab } from '../components/kaizen/dashboard/OverviewTab';
import { IntegrationsTab } from '../components/kaizen/dashboard/IntegrationsTab';
import { QueuesTab } from '../components/kaizen/dashboard/QueuesTab';
import { NotificationsTab } from '../components/kaizen/dashboard/NotificationsTab';

// ─── Main Page (Entry Point) ──────────────────────────────────
export default function DashboardPage() {
  const { t } = useTranslation(['common', 'settings']);
  const [isFailedModalOpen, setIsFailedModalOpen] = useState(false);
  const [isQueueModalOpen, setIsQueueModalOpen] = useState(false);
  const [queueModalTab, setQueueModalTab] = useState<'active' | 'recent'>('active');
  const [activeTab, setActiveTab] = useState<string | null>('overview');

  const handleOpenQueueModal = (tab: 'active' | 'recent' = 'active') => {
    setQueueModalTab(tab);
    setIsQueueModalOpen(true);
  };

  const activityQuery = trpc.manga.activity.useQuery(undefined, {
    refetchInterval: 5 * 1000,
  });
  const historyQuery = trpc.manga.history.useQuery(undefined, {
    refetchInterval: 10 * 1000,
  });
  const activityHistoryQuery = trpc.manga.activityHistory.useQuery();
  const settingsQuery = trpc.settings.query.useQuery();

  const activity = activityQuery.data;
  const isAuthEnabled = settingsQuery.data?.appConfig.authEnabled;

  return (
    <ScrollArea sx={{ minHeight: 'calc(100dvh - 88px)' }}>
      <Container fluid px="md" py="md">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <Title order={2} mb={4}>
            {t('dashboard.title', 'Dashboard')}
          </Title>
          <Text color="dimmed" size="sm" mb="xl">
            {t('dashboard.description', 'Summary of activity and download status')}
          </Text>
        </motion.div>

        <Tabs value={activeTab} onTabChange={setActiveTab} variant="outline" radius="md" keepMounted={false}>
          <Tabs.List mb="xl">
            <Tabs.Tab value="overview" icon={<IconDashboard size={16} />}>
              {t('dashboard.tabOverview', 'Overview')}
            </Tabs.Tab>
            <Tabs.Tab value="queues" icon={<IconStack2 size={16} />}>
              {t('dashboard.queues.tabTitle', 'System Queues')}
            </Tabs.Tab>
            <Tabs.Tab value="integrations" icon={<IconPlug size={16} />}>
              {t('dashboard.tabIntegrations', 'Integrations')}
            </Tabs.Tab>
            <Tabs.Tab value="notifications" icon={<IconBell size={16} />}>
              {t('dashboard.tabNotifications', 'Notifications')}
            </Tabs.Tab>
            {isAuthEnabled && (
              <Tabs.Tab value="users" icon={<IconUsers size={16} />}>
                {t('dashboard.tabUsers', 'Users')}
              </Tabs.Tab>
            )}
          </Tabs.List>

          <Tabs.Panel value="overview">
            <OverviewTab
              activity={activity}
              historyQuery={historyQuery}
              activityHistoryQuery={activityHistoryQuery}
              setIsQueueModalOpen={setIsQueueModalOpen}
              setIsFailedModalOpen={setIsFailedModalOpen}
              onOpenQueueModal={handleOpenQueueModal}
              t={t}
            />
          </Tabs.Panel>

          <Tabs.Panel value="queues">
            <QueuesTab />
          </Tabs.Panel>

          <Tabs.Panel value="integrations">
            <IntegrationsTab />
          </Tabs.Panel>

          <Tabs.Panel value="notifications">
            <NotificationsTab />
          </Tabs.Panel>

          <Tabs.Panel value="users">
            <Paper withBorder p="xl" radius="md">
              <Text color="dimmed" align="center">
                User management coming soon...
              </Text>
            </Paper>
          </Tabs.Panel>
        </Tabs>

        <FailedJobsModal opened={isFailedModalOpen} onClose={() => setIsFailedModalOpen(false)} />
        <DownloadQueueModal
          opened={isQueueModalOpen}
          initialTab={queueModalTab}
          onClose={() => setIsQueueModalOpen(false)}
        />
      </Container>
    </ScrollArea>
  );
}
export async function getServerSideProps({ locale }: { locale?: string }) {
  const { serverSideTranslations } = await import('next-i18next/serverSideTranslations');
  return {
    props: {
      ...(await serverSideTranslations(locale || 'en', ['common', 'settings'])),
    },
  };
}
