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
    <Paper
      withBorder
      p="md"
      radius="md"
      sx={(theme) => ({
        backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
        height: '100%',
      })}
    >
      <Title order={4} mb="md">
        {t('dashboard.recentActivity', 'Recent Downloads')}
      </Title>
      <Stack spacing="sm">
        {historyQuery.isLoading ? (
          <Center py="xl">
            <Loader variant="dots" />
          </Center>
        ) : historyQuery.data && historyQuery.data.length > 0 ? (
          historyQuery.data.slice(0, 8).map((chapter: any) => {
            const rawTitle = chapter.manga?.title;
            const hasValidTitle = rawTitle && typeof rawTitle === 'string' && rawTitle.trim().length > 0;

            const mangaTitle = hasValidTitle
              ? rawTitle
              : chapter.fileName
              ? chapter.fileName.replace(/\.[^/.]+$/, '').replace(/_/g, ' ')
              : t('common.unknownManga', 'Manga');

            const coverUrl = chapter.manga?.metadata?.cover;
            const chapterSubtext = chapter.fileName || (chapter.index != null ? `#${chapter.index}` : '');

            return (
              <Group key={chapter.id} spacing="sm" noWrap align="center">
                <CoverImage src={coverUrl} width={40} height={56} radius="xs" alt={mangaTitle} />
                <Box sx={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                  <Text
                    size="xs"
                    weight={700}
                    truncate
                    title={mangaTitle}
                    sx={(theme) => ({
                      color: theme.colorScheme === 'dark' ? theme.white : theme.colors.gray[9],
                      lineHeight: 1.3,
                    })}
                  >
                    {mangaTitle}
                  </Text>
                  <Text size="xs" color="dimmed" truncate title={chapterSubtext} sx={{ lineHeight: 1.3 }}>
                    {chapterSubtext}
                  </Text>
                  <Text size="xs" color="dimmed" sx={{ lineHeight: 1.3 }}>
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

