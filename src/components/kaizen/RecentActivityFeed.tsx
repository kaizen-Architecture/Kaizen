import { Paper, Title, Stack, Center, Loader, Group, Box, Text, ThemeIcon } from '@mantine/core';
import { IconHistory } from '@tabler/icons-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useTranslation } from 'next-i18next';
import { CoverImage } from './CoverImage';

dayjs.extend(relativeTime);

export function RecentActivityFeed({ historyQuery }: { historyQuery: any }) {
  const { t } = useTranslation(['dashboard', 'common']);

  return (
    <Paper withBorder p="md" radius="md" sx={{ height: '100%' }}>
      <Title order={4} mb="md">
        {t('dashboard.recentActivity', 'Recent Downloads')}
      </Title>
      <Stack spacing="xs">
        {historyQuery.isLoading ? (
          <Center py="xl">
            <Loader variant="dots" />
          </Center>
        ) : historyQuery.data && historyQuery.data.length > 0 ? (
          historyQuery.data.slice(0, 8).map((chapter: any) => {
            const mangaTitle = chapter.manga?.title || chapter.fileName || t('common.unknownManga', 'Manga');
            const coverUrl = chapter.manga?.metadata?.cover;

            return (
              <Group key={chapter.id} spacing="sm" noWrap>
                <CoverImage src={coverUrl} width={36} height={52} radius="xs" alt={mangaTitle} />
                <Box sx={{ overflow: 'hidden', flex: 1 }}>
                  <Text size="xs" weight={600} lineClamp={1} title={mangaTitle}>
                    {mangaTitle}
                  </Text>
                  <Text size="xs" color="dimmed" lineClamp={1} title={chapter.fileName}>
                    {chapter.fileName || (chapter.index != null ? `#${chapter.index}` : '')}
                  </Text>
                  <Text size="xs" color="dimmed">
                    {dayjs(chapter.createdAt).fromNow()}
                  </Text>
                </Box>
              </Group>
            );
          })
        ) : (
          <Stack align="center" justify="center" py="xl">
            <ThemeIcon size={64} radius="xl" color="gray" variant="light">
              <IconHistory size={32} />
            </ThemeIcon>
            <Text color="dimmed" size="sm">
              {t('dashboard.noRecentDownloads', 'No recent downloads')}
            </Text>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

