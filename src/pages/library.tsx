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
import { AddManga, useAddMangaModal } from '../components/addManga';

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

  // Downloader library page does not require query filtering, but we keep it for safety.
  const filter = (router.query.filter as string) || '';

  const bookmarkedQuery = trpc.manga.bookmarkedChapters.useQuery(undefined, {
    enabled: filter === 'bookmarks',
  });

  const requestsQuery = trpc.mangaRequest.list.useQuery(undefined, {
    enabled: filter === 'planToRead',
  });
  const updateRequestStatus = trpc.mangaRequest.updateStatus.useMutation();
  const addMangaModal = useAddMangaModal();

  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'title' | 'chapters' | 'date'>('title');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isMounted, setIsMounted] = useState(false);
  const isMobile = useMediaQuery('(max-width: 768px)');

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const isReadingMode = false; // Always false for the management/downloader library

  if (!isMounted || libraryQuery.isLoading) {
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

  if (mangaQuery.error || libraryQuery.error || (filter === 'bookmarks' && bookmarkedQuery.error)) {
    const errorMsg =
      mangaQuery.error?.message ||
      libraryQuery.error?.message ||
      (filter === 'bookmarks' && bookmarkedQuery.error ? bookmarkedQuery.error.message : '');
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

  const handleApprove = (req: any) => {
    addMangaModal(
      async (addedTitle?: string) => {
        // Wait for refetch to complete
        const updatedMangas = await mangaQuery.refetch();
        const targetTitle = addedTitle || req.title;
        const exists = updatedMangas.data?.some((m) => m.title.toLowerCase() === targetTitle.toLowerCase());
        if (exists) {
          await updateRequestStatus.mutateAsync({
            id: req.id,
            status: 'APPROVED',
            title: targetTitle,
          });
          showNotification({
            title: t('common:requests.notifications.approvedTitle', 'Request Approved'),
            message: t('common:requests.notifications.approvedMessage', {
              title: targetTitle,
              defaultValue: `The manga "${targetTitle}" has been successfully added.`,
            }),
            color: 'teal',
            icon: <IconCheck size={18} />,
          });
          requestsQuery.refetch();
        } else {
          showNotification({
            title: t('common:requests.notifications.cancelledTitle', 'Addition Cancelled'),
            message: t('common:requests.notifications.cancelledMessage', {
              title: req.title,
              defaultValue: `The manga "${req.title}" was not added. The request remains pending.`,
            }),
            color: 'yellow',
            icon: <IconX size={18} />,
          });
        }
      },
      req.startChapter || 1, // use requested start chapter as default threshold
      req.title,
    );
  };

  const handleReject = async (req: any) => {
    try {
      await updateRequestStatus.mutateAsync({
        id: req.id,
        status: 'CANCELLED',
      });
      showNotification({
        title: t('common:requests.notifications.rejectedTitle', 'Request Rejected'),
        message: t('common:requests.notifications.rejectedMessage', {
          title: req.title,
          defaultValue: `The request for "${req.title}" has been rejected.`,
        }),
        color: 'red',
        icon: <IconX size={18} />,
      });
      requestsQuery.refetch();
    } catch (err) {
      showNotification({
        title: t('common:error', 'Error'),
        message: `${err}`,
        color: 'red',
        icon: <IconX size={18} />,
      });
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
            {t('library:title', 'Biblioteca')}
          </Text>
        </Box>

        {filter === 'planToRead' &&
          requestsQuery.data &&
          requestsQuery.data.filter((r) => r.status === 'PENDING').length > 0 && (
            <Box mb="xl" px="xs">
              <Paper withBorder p="md" radius="md">
                <Text weight={600} mb="xs">
                  {t('common:requests.pendingTitle', 'Solicitudes Pendientes de Lectores')}
                </Text>
                <Text size="xs" color="dimmed" mb="md">
                  {t(
                    'common:requests.pendingDesc',
                    'Los lectores han solicitado los siguientes mangas. Puedes aprobarlos para agregarlos al backlog del gestor, o rechazarlos.',
                  )}
                </Text>
                <Table verticalSpacing="xs" highlightOnHover>
                  <thead>
                    <tr>
                      <th>{t('common:requests.mangaTitle', 'Título Solicitado')}</th>
                      <th>{t('common:requests.startChapter', 'Capítulo de Inicio')}</th>
                      <th>{t('common:requests.user', 'Usuario')}</th>
                      <th>{t('common:requests.date', 'Fecha')}</th>
                      <th>{t('common:requests.actions', 'Acciones')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requestsQuery.data
                      .filter((r) => r.status === 'PENDING')
                      .map((req) => (
                        <tr key={req.id}>
                          <td style={{ fontWeight: 500 }}>{req.title}</td>
                          <td>
                            {t('common:requests.chapterPrefix', {
                              num: req.startChapter,
                              defaultValue: `Capítulo ${req.startChapter}`,
                            })}
                          </td>
                          <td>{req.user?.username || t('common:requests.anonymous', 'Anónimo')}</td>
                          <td>{new Date(req.createdAt).toLocaleDateString()}</td>
                          <td>
                            <Group spacing="xs">
                              <Button size="xs" color="green" onClick={() => handleApprove(req)}>
                                {t('common:requests.approve', 'Aprobar')}
                              </Button>
                              <Button size="xs" variant="outline" color="red" onClick={() => handleReject(req)}>
                                {t('common:requests.reject', 'Rechazar')}
                              </Button>
                            </Group>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </Table>
              </Paper>
            </Box>
          )}

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
              label={t('library:controls.search') as string}
              placeholder={t('library:controls.searchPlaceholder') as string}
              icon={<IconSearch size={16} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              sx={{ flex: 1, minWidth: 200 }}
            />
            <Select
              label={t('common:common.source') as string}
              placeholder={t('library:controls.sourcePlaceholder') as string}
              value={sourceFilter}
              onChange={setSourceFilter}
              data={[
                { value: '', label: t('library:controls.sourcePlaceholder') as string },
                ...sources.map((s) => ({ value: s, label: s })),
              ]}
              clearable
            />
            <SegmentedControl
              value={sortBy}
              onChange={(val) => setSortBy(val as 'title' | 'chapters' | 'date')}
              data={[
                { label: t('library:controls.sortBy.title') as string, value: 'title' },
                { label: t('library:controls.sortBy.chapters') as string, value: 'chapters' },
                { label: t('library:controls.sortBy.recent') as string, value: 'date' },
              ]}
            />
            <SegmentedControl
              value={viewMode}
              onChange={(val) => setViewMode(val as 'grid' | 'list')}
              data={[
                { label: t('library:controls.viewMode.grid') as string, value: 'grid' },
                { label: t('library:controls.viewMode.list') as string, value: 'list' },
              ]}
            />
          </Group>
        )}

        {filter === 'bookmarks' ? (
          bookmarkedQuery.isLoading ? (
            <Box sx={{ width: '100%', height: 200, position: 'relative' }}>
              <LoadingOverlay visible />
            </Box>
          ) : !bookmarkedQuery.data || bookmarkedQuery.data.length === 0 ? (
            <Paper withBorder p="xl" radius="md" sx={{ textAlign: 'center', marginTop: 24 }}>
              <Text color="dimmed">{t('library:noBookmarks', 'No tienes páginas marcadas como favoritas.')}</Text>
            </Paper>
          ) : (
            <Grid m={0} justify="flex-start" gutter="md">
              {bookmarkedQuery.data.map((ch) => (
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
                    onClick={() => {
                      window.location.href = `/reader/${ch.mangaId}/${ch.id}`;
                    }}
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
            {filter !== 'planToRead' && (
              <Grid.Col span="content">
                <AddManga onAdd={() => mangaQuery.refetch()} />
              </Grid.Col>
            )}
            {filtered &&
              filtered.map((manga) => (
                <Grid.Col span="content" key={manga.id}>
                  <MangaCard
                    manga={manga}
                    onRefresh={() => handleRefresh(manga.id, manga.title)}
                    onUpdate={() => mangaQuery.refetch()}
                    onRemove={(shouldRemoveFiles: boolean) => handleRemove(manga.id, manga.title, shouldRemoveFiles)}
                    onClick={() => {
                      window.location.href = `/manga/${manga.id}`;
                    }}
                    isReadingMode={isReadingMode}
                  />
                </Grid.Col>
              ))}
          </Grid>
        ) : (
          <Stack spacing="sm">
            {filter !== 'planToRead' && (
              <Box mb="md">
                <AddManga onAdd={() => mangaQuery.refetch()} />
              </Box>
            )}
            {isMobile ? (
              <Stack spacing="xs">
                {filtered?.map((manga) => (
                  <Paper
                    key={manga.id}
                    withBorder
                    p="sm"
                    radius="md"
                    onClick={() => {
                      window.location.href = `/manga/${manga.id}`;
                    }}
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
                          onClick={() => {
                            window.location.href = `/manga/${manga.id}`;
                          }}
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
