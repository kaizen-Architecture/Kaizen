import {
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
  Badge,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

import { MangaCard, SkeletonMangaCard } from '../../components/mangaCard';
import { trpc } from '../../utils/trpc';

export default function ReaderLibraryPage() {
  const { t } = useTranslation(['library', 'common']);
  const libraryQuery = trpc.library.query.useQuery();
  const router = useRouter();
  const mangaQuery = trpc.manga.query.useQuery();

  // Derive filter directly from router.query - this triggers re-renders on route change
  const filter = (router.query.filter as string) || '';

  const bookmarksQuery = trpc.manga.bookmarkedChapters.useQuery(undefined, {
    enabled: Boolean(filter === 'bookmarks' && mangaQuery.data),
  });

  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'title' | 'chapters' | 'date'>('title');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isMounted, setIsMounted] = useState(false);
  const isMobile = useMediaQuery('(max-width: 768px)');

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  const isReadingMode = true; // Always true for the Reader library view

  // Loading state while checking SSR hydration
  if (!isMounted) {
    return (
      <Box sx={{ width: '100%', height: 'calc(100dvh - 88px)', position: 'relative' }}>
        <LoadingOverlay visible />
      </Box>
    );
  }

  if (mangaQuery.isLoading || libraryQuery.isLoading) {
    return (
      <Grid justify="flex-start">
        {Array(10)
          .fill(0)
          .map((_, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <Grid.Col span="content" key={i}>
              <SkeletonMangaCard />
            </Grid.Col>
          ))}
      </Grid>
    );
  }

  if (mangaQuery.error || libraryQuery.error || (filter === 'bookmarks' && bookmarksQuery.error)) {
    const errorMsg =
      mangaQuery.error?.message ||
      libraryQuery.error?.message ||
      (filter === 'bookmarks' && bookmarksQuery.error ? bookmarksQuery.error.message : '');
    return (
      <Paper withBorder p="xl" radius="md" sx={{ textAlign: 'center', margin: 24 }}>
        <Text color="red" weight={600} mb="xs">
          {t('common:error', 'Error')}
        </Text>
        <Text color="dimmed" size="sm">
          {errorMsg}
        </Text>
      </Paper>
    );
  }

  const getPageHeader = () => {
    switch (filter) {
      case 'favorites':
        return t('common:nav.favorites');
      case 'reading':
        return t('common:nav.reading');
      case 'planToRead':
        return t('common:nav.planToRead');
      case 'bookmarks':
        return t('common:nav.bookmarks');
      default:
        return t('library:title', 'Biblioteca');
    }
  };

  const totalMangas = mangaQuery.data?.length || 0;
  const totalChapters = mangaQuery.data?.reduce((acc, m) => acc + (m._count?.chapters || 0), 0) || 0;
  const sources = [...new Set(mangaQuery.data?.map((m) => m.source) || [])];

  const filtered = (mangaQuery.data || [])
    .filter((m) => {
      const matchesSearch = m.title.toLowerCase().includes(search.toLowerCase());
      const matchesSource = !sourceFilter || m.source === sourceFilter;
      let matchesTab = true;
      if (filter === 'favorites') {
        matchesTab = m.isFavorite;
      } else if (filter === 'reading') {
        const readCount = (m as any).readChaptersCount || 0;
        const totalCount = m._count?.chapters || 0;
        matchesTab = readCount > 0 && readCount < totalCount;
      } else if (filter === 'planToRead') {
        matchesTab = ((m as any).minChaptersForDownload || 0) > 0;
      }
      return matchesSearch && matchesSource && matchesTab;
    })
    .sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      if (sortBy === 'chapters') return (b._count?.chapters || 0) - (a._count?.chapters || 0);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  return (
    <ScrollArea sx={{ minHeight: 'calc(100dvh - 88px)' }}>
      <Container fluid p={0} m={0}>
        <Box mb="lg" px="xs">
          <Text size="xl" weight={700} sx={{ letterSpacing: -0.5 }}>
            {getPageHeader()}
          </Text>
          {filter === 'planToRead' && (
            <Text size="xs" color="dimmed">
              Configura umbrales de descarga para posponer la bajada hasta que la fuente contenga la cantidad mínima de
              capítulos
            </Text>
          )}
        </Box>

        {filter !== 'bookmarks' && (
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
          </Group>
        )}

        {filter !== 'bookmarks' && (
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
        )}

{filter === 'bookmarks' ? (
           bookmarksQuery.isLoading ? (
             <Box sx={{ width: '100%', height: 200, position: 'relative' }}>
               <LoadingOverlay visible />
             </Box>
           ) : !bookmarksQuery.data || bookmarksQuery.data.length === 0 ? (
             <Paper withBorder p="xl" radius="md" sx={{ textAlign: 'center', marginTop: 24 }}>
               <Text color="dimmed">{t('library:noBookmarks', 'No tienes páginas marcadas como favoritas.')}</Text>
             </Paper>
           ) : (
             <Grid m={0} justify="flex-start" gutter="md">
               {bookmarksQuery.data.map((ch) => (
                <Grid.Col key={ch.id} xs={12} sm={6} md={4} lg={3}>
                  <Paper
                    withBorder
                    p="sm"
                    radius="md"
                    sx={(theme) => ({
                      display: 'flex',
                      gap: 12,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
                      '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: theme.shadows.sm,
                        borderColor: theme.colors.violet[4],
                      },
                    })}
                    onClick={() => router.push(`/reader/${ch.mangaId}/${ch.id}`)}
                  >
                    <img
                      src={ch.manga.metadata?.cover || '/cover-not-found.jpg'}
                      alt={ch.manga.title}
                      style={{ width: 60, height: 85, objectFit: 'cover', borderRadius: 4 }}
                    />
                    <Stack justify="space-between" spacing={4} sx={{ flex: 1, minWidth: 0 }}>
                      <div>
                        <Text size="sm" weight={600} lineClamp={1}>
                          {ch.manga.title}
                        </Text>
                        <Text size="xs" color="dimmed" lineClamp={1}>
                          {ch.fileName.replace('.cbz', '')}
                        </Text>
                      </div>
                      <Group spacing={4}>
                        {ch.favoritePages.map((page) => (
                          <Badge key={page} size="xs" color="violet" variant="outline">
                            {t('common:page', 'Pág.')} {page + 1}
                          </Badge>
                        ))}
                      </Group>
                    </Stack>
                  </Paper>
                </Grid.Col>
              ))}
            </Grid>
          )
        ) : viewMode === 'grid' ? (
          <Grid m={0} justify="flex-start">
            {filtered &&
              filtered.map((manga) => (
                <Grid.Col span="content" key={manga.id}>
                  <MangaCard
                    manga={manga}
                    onClick={() => router.push(`/manga/${manga.id}`)}
                    isReadingMode={isReadingMode}
                  />
                </Grid.Col>
              ))}
          </Grid>
        ) : (
          <Stack spacing="sm">
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

export async function getServerSideProps({ locale }: { locale?: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale || 'en', ['common', 'library', 'settings'])),
    },
  };
}
