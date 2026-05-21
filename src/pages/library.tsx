import {
  Code,
  Grid,
  LoadingOverlay,
  ScrollArea,
  Text,
  Paper,
  Group,
  Stack,
  TextInput,
  Select,
  SegmentedControl,
  Container,
  Box,
  Table,
  Button,
  Badge,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { IconCheck, IconX, IconSearch, IconRefresh } from '@tabler/icons-react';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { AddManga } from '../components/addManga';

import { EmptyPrompt } from '../components/emptyPrompt';
import { MangaCard, SkeletonMangaCard } from '../components/mangaCard';
import { trpc } from '../utils/trpc';

export default function LibraryPage() {
  const { t } = useTranslation(['library', 'common']);
  const libraryQuery = trpc.library.query.useQuery();
  const mangaRemove = trpc.manga.remove.useMutation();
  const mangaRefresh = trpc.manga.refreshMetaData.useMutation();
  const syncAll = trpc.manga.syncAll.useMutation();
  const router = useRouter();

  const mangaQuery = trpc.manga.query.useQuery();

  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'title' | 'chapters' | 'date'>('title');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isMounted, setIsMounted] = useState(false);
  const isMobile = useMediaQuery('(max-width: 768px)');

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return <LoadingOverlay visible />;
  }

  if (libraryQuery.isLoading) {
    return <LoadingOverlay visible />;
  }

  if (mangaQuery.isLoading || libraryQuery.isLoading) {
    return (
      <Grid justify="flex-start">
        {Array(10)
          .fill(0)
          .map((_, i) => {
            return (
              // eslint-disable-next-line react/no-array-index-key
              <Grid.Col span="content" key={i}>
                <SkeletonMangaCard />
              </Grid.Col>
            );
          })}
      </Grid>
    );
  }

  if (!libraryQuery.data) {
    return (
      <EmptyPrompt
        onCreate={() => {
          libraryQuery.refetch();
        }}
      />
    );
  }

  const handleRemove = async (id: number, title: string, shouldRemoveFiles: boolean) => {
    try {
      await mangaRemove.mutateAsync({
        id,
        shouldRemoveFiles,
      });
      showNotification({
        icon: <IconCheck size={18} />,
        color: 'teal',
        autoClose: true,
        title: 'Manga',
        message: (
          <Text>
            <Code color="indigo">{title}</Code> is removed from library
          </Text>
        ),
      });
    } catch (err) {
      showNotification({
        icon: <IconX size={18} />,
        color: 'red',
        autoClose: true,
        title: 'Manga',
        message: (
          <Text>
            <Code color="red">{`${err}`}</Code>
          </Text>
        ),
      });
    }
    mangaQuery.refetch();
  };

  const handleRefresh = async (id: number, title: string) => {
    try {
      await mangaRefresh.mutateAsync({
        id,
      });
      showNotification({
        icon: <IconCheck size={18} />,
        color: 'teal',
        autoClose: true,
        title: 'Manga',
        message: (
          <Text>
            <Code color="indigo">{title}</Code> chapters are queued for the metadata update
          </Text>
        ),
      });
    } catch (err) {
      showNotification({
        icon: <IconX size={18} />,
        color: 'red',
        autoClose: true,
        title: 'Manga',
        message: (
          <Text>
            <Code color="red">{`${err}`}</Code>
          </Text>
        ),
      });
    }
    mangaQuery.refetch();
  };

  const totalMangas = mangaQuery.data?.length || 0;
  const totalChapters = mangaQuery.data?.reduce((acc, m) => acc + (m._count?.chapters || 0), 0) || 0;
  const sources = [...new Set(mangaQuery.data?.map((m) => m.source) || [])];

  const filtered = mangaQuery.data
    ?.filter(
      (m) => m.title.toLowerCase().includes(search.toLowerCase()) && (!sourceFilter || m.source === sourceFilter),
    )
    .sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      if (sortBy === 'chapters') return (b._count?.chapters || 0) - (a._count?.chapters || 0);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  return (
    <ScrollArea sx={{ minHeight: 'calc(100dvh - 88px)' }}>
      <Container fluid p={0} m={0}>
        <Group mb="md">
          <Paper withBorder p="xs" radius="md">
            <Group spacing="xs">
              <Text size="sm" weight={600}>
                {t('library:stats.mangas')}:
              </Text>
              <Text size="sm">{totalMangas}</Text>
            </Group>
          </Paper>
          <Paper withBorder p="xs" radius="md">
            <Group spacing="xs">
              <Text size="sm" weight={600}>
                {t('library:stats.chapters')}:
              </Text>
              <Text size="sm">{totalChapters}</Text>
            </Group>
          </Paper>
          <Paper withBorder p="xs" radius="md">
            <Group spacing="xs">
              <Text size="sm" weight={600}>
                {t('library:stats.sources')}:
              </Text>
              <Text size="sm">{sources.length}</Text>
            </Group>
          </Paper>
          <Button
            variant="light"
            size="xs"
            leftIcon={<IconRefresh size={14} />}
            onClick={async () => {
              try {
                await syncAll.mutateAsync({ source: sourceFilter });
                showNotification({
                  title: t('library:sync.startedTitle'),
                  message: sourceFilter
                    ? t('library:sync.startedMessageSource', { source: sourceFilter })
                    : t('library:sync.startedMessageAll'),
                  color: 'teal',
                  icon: <IconCheck size={18} />,
                });
              } catch (err) {
                showNotification({
                  title: t('common:error'),
                  message: t('library:sync.error'),
                  color: 'red',
                  icon: <IconX size={18} />,
                });
              }
            }}
            loading={syncAll.isLoading}
            color="teal"
            sx={{ marginLeft: 'auto' }}
          >
            {sourceFilter ? t('library:sync.source', { source: sourceFilter }) : t('library:sync.all')}
          </Button>
        </Group>

        <Group
          mb="xl"
          align="flex-end"
          sx={(theme) => ({
            [`@media (max-width: ${theme.breakpoints.sm}px)`]: {
              flexDirection: 'column',
              alignItems: 'stretch',
            },
          })}
        >
          <TextInput
            label={t('library:controls.search')}
            placeholder={t('library:controls.searchPlaceholder')}
            icon={<IconSearch size={16} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            sx={{ flex: 1, minWidth: 200 }}
          />
          <Select
            label={t('common:common.source')}
            placeholder={t('library:controls.sourcePlaceholder')}
            value={sourceFilter}
            onChange={setSourceFilter}
            data={[
              { value: '', label: t('library:controls.sourcePlaceholder') },
              ...sources.map((s) => ({ value: s, label: s })),
            ]}
            clearable
          />
          <SegmentedControl
            value={sortBy}
            onChange={(val) => setSortBy(val as 'title' | 'chapters' | 'date')}
            data={[
              { label: t('library:controls.sortBy.title'), value: 'title' },
              { label: t('library:controls.sortBy.chapters'), value: 'chapters' },
              { label: t('library:controls.sortBy.recent'), value: 'date' },
            ]}
          />
          <SegmentedControl
            value={viewMode}
            onChange={(val) => setViewMode(val as 'grid' | 'list')}
            data={[
              { label: t('library:controls.viewMode.grid'), value: 'grid' },
              { label: t('library:controls.viewMode.list'), value: 'list' },
            ]}
          />
        </Group>

        {viewMode === 'grid' ? (
          <Grid m={0} justify="flex-start">
            <Grid.Col span="content">
              <AddManga onAdd={() => mangaQuery.refetch()} />
            </Grid.Col>
            {filtered &&
              filtered.map((manga) => {
                return (
                  <Grid.Col span="content" key={manga.id}>
                    <MangaCard
                      manga={manga}
                      onRefresh={() => handleRefresh(manga.id, manga.title)}
                      onUpdate={() => mangaQuery.refetch()}
                      onRemove={(shouldRemoveFiles: boolean) => handleRemove(manga.id, manga.title, shouldRemoveFiles)}
                      onClick={() => router.push(`/manga/${manga.id}`)}
                    />
                  </Grid.Col>
                );
              })}
          </Grid>
        ) : (
          <Stack spacing="sm">
            <Box mb="md">
              <AddManga onAdd={() => mangaQuery.refetch()} />
            </Box>
            {isMobile ? (
              <Stack spacing="xs">
                {filtered?.map((manga) => (
                  <Paper
                    key={manga.id}
                    withBorder
                    p="sm"
                    radius="md"
                    onClick={() => router.push(`/manga/${manga.id}`)}
                    sx={(theme) => ({
                      cursor: 'pointer',
                      '&:hover': {
                        backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[0],
                      },
                    })}
                  >
                    <Group position="apart" noWrap>
                      <Box sx={{ flex: 1, overflow: 'hidden' }}>
                        <Group spacing={6} noWrap>
                          <Text weight={500} lineClamp={1} sx={{ flexShrink: 1 }}>
                            {manga.title}
                          </Text>
                          {manga.isFullyRead && manga.metadata?.status === 'FINISHED' && (
                            <Badge color="green" size="xs" variant="filled" sx={{ flexShrink: 0 }}>
                              ✓ Leído
                            </Badge>
                          )}
                        </Group>
                        <Text size="xs" color="dimmed">
                          {manga.source}
                        </Text>
                      </Box>
                      <Text size="sm" weight={600}>
                        {manga._count?.chapters || 0} {t('library:stats.chapters')}
                      </Text>
                    </Group>
                  </Paper>
                ))}
                {(!filtered || filtered.length === 0) && (
                  <Paper withBorder p="xl" radius="md" sx={{ textAlign: 'center' }}>
                    <Text color="dimmed">{t('library:noMangas')}</Text>
                  </Paper>
                )}
              </Stack>
            ) : (
              <Paper withBorder p={0} radius="md" sx={{ overflow: 'hidden' }}>
                <Box sx={{ overflowX: 'auto' }}>
                  <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md" sx={{ minWidth: 600 }}>
                    <thead>
                      <tr>
                        <th>{t('common:common.manga')}</th>
                        <th>{t('common:common.source')}</th>
                        <th>{t('library:stats.chapters')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered?.map((manga) => (
                        <Box
                          component="tr"
                          key={manga.id}
                          onClick={() => router.push(`/manga/${manga.id}`)}
                          sx={{ cursor: 'pointer' }}
                        >
                          <td>
                            <Group spacing="xs">
                              <Text weight={500}>{manga.title}</Text>
                              {manga.isFullyRead && manga.metadata?.status === 'FINISHED' && (
                                <Badge color="green" size="xs" variant="filled">
                                  ✓ Leído
                                </Badge>
                              )}
                            </Group>
                          </td>
                          <td>
                            <Text size="sm" color="dimmed">
                              {manga.source}
                            </Text>
                          </td>
                          <td>
                            <Text size="sm">{manga._count?.chapters || 0}</Text>
                          </td>
                        </Box>
                      ))}
                      {(!filtered || filtered.length === 0) && (
                        <tr>
                          <td colSpan={3} style={{ textAlign: 'center', padding: '24px' }}>
                            <Text color="dimmed">{t('library:noMangas')}</Text>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </Table>
                </Box>
              </Paper>
            )}
          </Stack>
        )}
      </Container>
    </ScrollArea>
  );
}
export async function getServerSideProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ['common', 'library', 'settings'])),
    },
  };
}
