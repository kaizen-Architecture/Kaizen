import {
  Container,
  Paper,
  Text,
  Title,
  Group,
  Stack,
  Tabs,
  Image,
  List,
  ThemeIcon,
  Box,
  SimpleGrid,
} from '@mantine/core';
import { useState } from 'react';
import {
  IconBook,
  IconLayoutDashboard,
  IconBooks,
  IconCalendarStats,
  IconPuzzle,
  IconSettings,
  IconCalendarPlus,
  IconCheck,
  IconClock,
} from '@tabler/icons-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'next-i18next';

export default function GuidePage() {
  const { t } = useTranslation('common');
  const [activeTab, setActiveTab] = useState<string | null>('dashboard');

  const tabContent = {
    dashboard: {
      title: t('guide.sections.dashboard.title', 'Main Dashboard'),
      desc: t(
        'guide.sections.dashboard.desc',
        "The dashboard gives you a complete overview of your server's health at a glance.",
      ),
      image: '/guide/dashboard.png',
      points: [
        t(
          'guide.sections.dashboard.points.0',
          'Download Stats: Track successful, failed, and queued chapter downloads.',
        ),
        t(
          'guide.sections.dashboard.points.1',
          'Integration Health: Visually monitor connectivity with Kavita or Komga.',
        ),
        t(
          'guide.sections.dashboard.points.2',
          'Real-time Server Logs: Inspect background server operations second by second.',
        ),
      ],
    },
    library: {
      title: t('guide.sections.library.title', 'Library Management'),
      desc: t('guide.sections.library.desc', 'Add and organize your favorite series for automated downloads.'),
      image: '/guide/library.png',
      points: [
        t(
          'guide.sections.library.points.0',
          'Smart Search: Search catalog providers directly to import and configure manga.',
        ),
        t(
          'guide.sections.library.points.1',
          'Metadata & Cover Override: Edit synopsis, genres, and upload custom base64 or URL covers.',
        ),
        t(
          'guide.sections.library.points.2',
          'Local Chapters: Browse downloaded chapter files and safely remove duplicates.',
        ),
      ],
    },
    planToRead: {
      title: t('guide.sections.planToRead.title', 'Requests (Plan to Read)'),
      desc: t(
        'guide.sections.planToRead.desc',
        'A streamlined, secure workflow for requesting future reading material.',
      ),
      image: '/guide/plan_to_read.png',
      points: [
        t(
          'guide.sections.planToRead.points.0',
          'Add Requests: Readers suggest series without requiring direct download privileges.',
        ),
        t(
          'guide.sections.planToRead.points.1',
          'Admin Approval: Administrators approve or reject requests with a single click.',
        ),
        t(
          'guide.sections.planToRead.points.2',
          'Automatic Sync: Approved series are instantly integrated into the main download queue.',
        ),
      ],
    },
    reader: {
      title: t('guide.sections.reader.title', 'Reading Experience'),
      desc: t('guide.sections.reader.desc', 'Enjoy your favorite manga comfortably on any device.'),
      image: '/guide/reader.png',
      points: [
        t(
          'guide.sections.reader.points.0',
          'Premium Reader UI: Choose between horizontal sliding or continuous vertical scroll modes.',
        ),
        t(
          'guide.sections.reader.points.1',
          'Paperback Integration: Sync reading progress directly using our official Paperback extension.',
        ),
        t(
          'guide.sections.reader.points.2',
          'Clean Reader: An interface fully stripped of admin panels, focusing solely on reading.',
        ),
      ],
    },
    scheduler: {
      title: t('guide.sections.scheduler.title', 'Smart Scheduler'),
      desc: t('guide.sections.scheduler.desc', 'Optimize and schedule automated update checks.'),
      image: '/guide/scheduler.png',
      points: [
        t(
          'guide.sections.scheduler.points.0',
          'Load Distribution: Smart auto-staggering spreads checks to avoid IP bans.',
        ),
        t(
          'guide.sections.scheduler.points.1',
          'Publication Status Filters: Automatically deactivate checks on completed or hiatus series.',
        ),
        t(
          'guide.sections.scheduler.points.2',
          'Bulk Scheduling: Apply check intervals to entire groups of manga at once.',
        ),
      ],
    },
    sources: {
      title: t('guide.sections.sources.title', 'Scrapers & Sources'),
      desc: t('guide.sections.sources.desc', 'Expand your catalog by connecting custom scraper repositories.'),
      image: '/guide/sources.png',
      points: [
        t(
          'guide.sections.sources.points.1',
          'GitHub Sync: Add public or private repository integrations with access tokens.',
        ),
        t(
          'guide.sections.sources.points.2',
          'Manual Lua Upload: Instantly upload custom `.lua` scraper scripts directly from the browser.',
        ),
      ],
    },
    settings: {
      title: t('guide.sections.settings.title', 'General Settings'),
      desc: t('guide.sections.settings.desc', 'Manage appearance preferences, security details, and database backups.'),
      image: '/guide/settings.png',
      points: [
        t(
          'guide.sections.settings.points.0',
          'Dynamic Themes: Switch between the default style and the custom Kaizen palette.',
        ),
        t(
          'guide.sections.settings.points.1',
          'Multi-User & Authentication: Toggle session guards and configure user roles.',
        ),
        t(
          'guide.sections.settings.points.2',
          'Atomic Database Backups: Export or import configurations atomically for peace of mind.',
        ),
      ],
    },
  };

  const currentTab = tabContent[activeTab as keyof typeof tabContent] || tabContent.dashboard;

  return (
    <Container size="xl" py="lg">
      <Stack spacing="xl">
        <Group spacing="md" align="center">
          <ThemeIcon size={40} radius="md" variant="gradient" gradient={{ from: 'indigo', to: 'violet' }}>
            <IconBook size={24} />
          </ThemeIcon>
          <div>
            <Title order={2} weight={700} sx={{ letterSpacing: '0.5px' }}>
              {t('guide.title', 'Kaizen User Guide')}
            </Title>
            <Text color="dimmed" size="sm">
              {t('guide.description', "Learn how to configure and fully leverage Kaizen's tools.")}
            </Text>
          </div>
        </Group>

        <Paper
          p="md"
          radius="md"
          sx={(theme) => ({
            background: theme.colorScheme === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.01)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(8px)',
          })}
        >
          <Tabs
            value={activeTab}
            onTabChange={setActiveTab}
            variant="pills"
            color="indigo"
            styles={(theme) => ({
              tabsList: {
                borderBottom: 'none',
                gap: 8,
                flexWrap: 'wrap',
              },
              tab: {
                fontWeight: 600,
                fontSize: theme.fontSizes.sm,
                transition: 'all 0.2s ease',
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                },
              },
            })}
          >
            <Tabs.List>
              <Tabs.Tab value="dashboard" icon={<IconLayoutDashboard size={16} />}>
                {t('guide.tabs.dashboard', 'Dashboard')}
              </Tabs.Tab>
              <Tabs.Tab value="library" icon={<IconBooks size={16} />}>
                {t('guide.tabs.library', 'Library')}
              </Tabs.Tab>
              <Tabs.Tab value="planToRead" icon={<IconCalendarPlus size={16} />}>
                {t('guide.tabs.planToRead', 'Plan to Read')}
              </Tabs.Tab>
              <Tabs.Tab value="reader" icon={<IconClock size={16} />}>
                {t('guide.tabs.reader', 'Reader')}
              </Tabs.Tab>
              <Tabs.Tab value="scheduler" icon={<IconCalendarStats size={16} />}>
                {t('guide.tabs.scheduler', 'Scheduler')}
              </Tabs.Tab>
              <Tabs.Tab value="sources" icon={<IconPuzzle size={16} />}>
                {t('guide.tabs.sources', 'Sources')}
              </Tabs.Tab>
              <Tabs.Tab value="settings" icon={<IconSettings size={16} />}>
                {t('guide.tabs.settings', 'Settings')}
              </Tabs.Tab>
            </Tabs.List>
          </Tabs>
        </Paper>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
          >
            <SimpleGrid cols={2} spacing="xl" breakpoints={[{ maxWidth: 'md', cols: 1 }]}>
              <Stack spacing="lg" justify="center">
                <div>
                  <Title order={3} weight={600} mb="xs">
                    {currentTab.title}
                  </Title>
                  <Text color="dimmed" size="sm" mb="xl">
                    {currentTab.desc}
                  </Text>
                </div>

                <List
                  spacing="md"
                  size="sm"
                  center
                  icon={
                    <ThemeIcon color="teal" size={24} radius="xl">
                      <IconCheck size={14} />
                    </ThemeIcon>
                  }
                >
                  {currentTab.points.map((point) => (
                    <List.Item key={point}>
                      <Text weight={500}>{point}</Text>
                    </List.Item>
                  ))}
                </List>
              </Stack>

              <Box
                sx={(theme) => ({
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: theme.radius.md,
                  overflow: 'hidden',
                  boxShadow: theme.shadows.lg,
                  backgroundColor: 'rgba(0, 0, 0, 0.2)',
                  aspectRatio: '16/10',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                })}
              >
                <Image
                  src={currentTab.image}
                  alt={currentTab.title}
                  fit="contain"
                  width="100%"
                  height="100%"
                  styles={{
                    image: {
                      transition: 'transform 0.3s ease',
                      '&:hover': {
                        transform: 'scale(1.02)',
                      },
                    },
                  }}
                />
              </Box>
            </SimpleGrid>
          </motion.div>
        </AnimatePresence>
      </Stack>
    </Container>
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
