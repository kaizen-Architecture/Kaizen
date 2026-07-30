import { Prisma } from '@prisma/client';
import { DataTable } from 'mantine-datatable';

import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

import { Center, Tooltip, Stack, Paper, Group, Text, Pagination, ActionIcon, Button, Modal, NumberInput } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconAlertTriangle, IconCheck, IconTrash, IconEye, IconEyeOff, IconBook, IconStar, IconRefresh, IconShieldCheck, IconFlag } from '@tabler/icons-react';
import prettyBytes from 'pretty-bytes';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { trpc } from '../utils/trpc';

dayjs.extend(relativeTime);

const mangaWithMetadataAndChaptersAndOutOfSyncChaptersAndLibrary = Prisma.validator<Prisma.MangaArgs>()({
  include: { metadata: true, chapters: true, library: true, outOfSyncChapters: true },
});

export type MangaWithMetadataAndChaptersAndOutOfSyncChaptersAndLibrary = Prisma.MangaGetPayload<
  typeof mangaWithMetadataAndChaptersAndOutOfSyncChaptersAndLibrary
>;

const PAGE_SIZE = 100;

export function ChaptersTable({
  manga,
  isReadingMode = false,
}: {
  manga: MangaWithMetadataAndChaptersAndOutOfSyncChaptersAndLibrary;
  isReadingMode?: boolean;
}) {
  const { t } = useTranslation('common');
  const router = useRouter();
  const [page, setPage] = useState(1);
  const settings = trpc.settings.query.useQuery();
  const readerEnabled = (settings.data?.appConfig as any)?.readerEnabled !== false;

  const [records, setRecords] = useState(manga.chapters.slice(0, PAGE_SIZE));
  const queryMobile = useMediaQuery('(max-width: 768px)');
  const [isMobile, setIsMobile] = useState(false);
  const outOfSyncIds = useMemo(() => new Set(manga.outOfSyncChapters.map((c) => c.id)), [manga.outOfSyncChapters]);

  const [rangeModalOpen, setRangeModalOpen] = useState(false);
  const [startChapterInput, setStartChapterInput] = useState<number | undefined>(1);
  const [endChapterInput, setEndChapterInput] = useState<number | undefined>(10);

  const utils = trpc.useContext();

  const deleteMutation = trpc.manga.deleteChapter.useMutation({
    onSuccess: () => {
      utils.manga.get.invalidate({ id: manga.id });
      router.replace(router.asPath);
    },
  });

  const redownloadMutation = trpc.manga.redownloadChapter.useMutation({
    onSuccess: () => {
      utils.manga.get.invalidate({ id: manga.id });
      router.replace(router.asPath);
    },
  });

  const redownloadRangeMutation = trpc.manga.redownloadChapterRange.useMutation({
    onSuccess: () => {
      setRangeModalOpen(false);
      utils.manga.get.invalidate({ id: manga.id });
      router.replace(router.asPath);
    },
  });

  const auditIntegrityMutation = trpc.manga.auditMangaIntegrity.useMutation({
    onSuccess: () => {
      utils.manga.get.invalidate({ id: manga.id });
      alert(
        String(
          t(
            'common.audit_completed',
            t(
              'audit_completed',
              'Auditoría enviada a la cola en segundo plano. Los capítulos se están verificando progresivamente en el servidor.',
            ),
          ),
        ),
      );
      router.replace(router.asPath);
    },
  });

  const reportCorruptMutation = trpc.manga.reportCorruptChapter.useMutation({
    onSuccess: () => {
      alert(
        String(
          t(
            'common.report_corrupt_success',
            t(
              'report_corrupt_success',
              'Gracias. El capítulo ha sido enviado a la cola de verificación en segundo plano para su re-descarga automática.',
            ),
          ),
        ),
      );
    },
  });

  const toggleReadMutation = trpc.manga.toggleChapterRead.useMutation({
    onSuccess: () => {
      utils.manga.get.invalidate({ id: manga.id });
    },
  });

  const toggleChapterFavoriteMutation = trpc.manga.toggleChapterFavorite.useMutation({
    onSuccess: () => {
      utils.manga.get.invalidate({ id: manga.id });
    },
  });

  const toggleMangaReadMutation = trpc.manga.toggleMangaRead.useMutation({
    onSuccess: () => {
      utils.manga.get.invalidate({ id: manga.id });
    },
  });

  // Fix hydration mismatch
  useEffect(() => {
    setIsMobile(queryMobile);
  }, [queryMobile]);

  useEffect(() => {
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE;
    setRecords(manga.chapters.slice(from, to));
  }, [manga.chapters, page]);

  const totalPages = Math.ceil(manga.chapters.length / PAGE_SIZE);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columns = useMemo(
    () => [
      { accessor: 'index', title: '#', render: ({ index }: { index: number }) => `${index + 1}` },
      {
        accessor: 'isRead',
        title: t('read'),
        width: 70,
        // eslint-disable-next-line react/no-unused-prop-types
        render: ({ id, isRead }: { id: number; isRead: boolean }) => (
          <Center>
            <ActionIcon
              variant="subtle"
              color={isRead ? 'teal' : 'gray'}
              onClick={() => toggleReadMutation.mutate({ id, isRead: !isRead })}
              loading={toggleReadMutation.isLoading && toggleReadMutation.variables?.id === id}
            >
              {isRead ? <IconEye size={18} /> : <IconEyeOff size={18} />}
            </ActionIcon>
          </Center>
        ),
      },
      {
        accessor: 'createdAt',
        title: t('download_date'),
        render: ({ createdAt }: { createdAt: Date }) => dayjs(createdAt).fromNow(),
      },
      {
        accessor: 'fileName',
        title: t('chapter_name'),
        render: ({ fileName }: { fileName: string }) => `${fileName}`,
      },
      { accessor: 'size', title: t('file_size'), render: ({ size }: { size: number }) => prettyBytes(size) },
      {
        accessor: '',
        title: (
          <Center>
            <span>{t('status')}</span>
          </Center>
        ),
        width: 220,
        render: ({ id, index }: { id: number; index: number }) => (
          <Group spacing="sm" position="center" noWrap>
            {outOfSyncIds.has(id) ? (
              <Tooltip withArrow label={t('chapter_out_of_sync')}>
                <Center>
                  <IconAlertTriangle color="red" size={18} strokeWidth={2} />
                </Center>
              </Tooltip>
            ) : (
              <Tooltip withArrow label={t('chapter_in_sync')}>
                <Center>
                  <IconCheck color="green" size={18} strokeWidth={3} />
                </Center>
              </Tooltip>
            )}
            <Tooltip withArrow label="Favorite Chapter">
              <ActionIcon
                color="yellow"
                variant="light"
                size="sm"
                onClick={() =>
                  toggleChapterFavoriteMutation.mutate({
                    id,
                    isFavorite: !manga.chapters.find((c) => c.id === id)?.isFavorite,
                  })
                }
                loading={toggleChapterFavoriteMutation.isLoading && toggleChapterFavoriteMutation.variables?.id === id}
              >
                {manga.chapters.find((c) => c.id === id)?.isFavorite ? (
                  <IconStar fill="gold" size={16} />
                ) : (
                  <IconStar size={16} />
                )}
              </ActionIcon>
            </Tooltip>
            {readerEnabled && (
              <Tooltip withArrow label="Read Chapter">
                <ActionIcon
                  color="indigo"
                  variant="light"
                  size="sm"
                  onClick={() => {
                    window.location.href = `/reader/${manga.id}/${id}`;
                  }}
                >
                  <IconBook size={16} />
                </ActionIcon>
              </Tooltip>
            )}
            {isReadingMode && (
              <Tooltip withArrow label={t('report_corrupt_chapter')}>
                <ActionIcon
                  color="orange"
                  variant="light"
                  size="sm"
                  onClick={() => reportCorruptMutation.mutate({ chapterId: id })}
                  loading={reportCorruptMutation.isLoading && reportCorruptMutation.variables?.chapterId === id}
                >
                  <IconFlag size={16} />
                </ActionIcon>
              </Tooltip>
            )}
            {!isReadingMode && (
              <>
                <Tooltip withArrow label={t('redownload_chapter')}>
                  <ActionIcon
                    color="orange"
                    variant="light"
                    size="sm"
                    onClick={() => redownloadMutation.mutate({ chapterId: id })}
                    loading={redownloadMutation.isLoading && redownloadMutation.variables?.chapterId === id}
                  >
                    <IconRefresh size={16} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip withArrow label="Delete Chapter">
                  <ActionIcon
                    color="red"
                    variant="light"
                    size="sm"
                    onClick={() => {
                      if (window.confirm(String(t('confirm_delete_chapter')))) {
                        deleteMutation.mutate({ id });
                      }
                    }}
                    loading={deleteMutation.isLoading && deleteMutation.variables?.id === id}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Tooltip>
              </>
            )}
          </Group>
        ),
      },
    ],
    [
      outOfSyncIds,
      deleteMutation,
      redownloadMutation,
      isReadingMode,
      manga.chapters,
      manga.id,
      readerEnabled,
      toggleChapterFavoriteMutation,
      toggleReadMutation,
      t,
    ],
  );

  const toolbar = (
    <Group position="apart" mb="xs">
      <Text weight={600} size="md">
        {t('chapters_list')} ({manga.chapters.length})
      </Text>
      <Group spacing="xs">
        <Button
          size="xs"
          variant="light"
          onClick={() => toggleMangaReadMutation.mutate({ id: manga.id, isRead: true })}
          loading={toggleMangaReadMutation.isLoading}
        >
          {t('mark_all_read')}
        </Button>
        {!isReadingMode && (
          <>
            <Button
              size="xs"
              variant="light"
              color="gray"
              onClick={() => toggleMangaReadMutation.mutate({ id: manga.id, isRead: false })}
              loading={toggleMangaReadMutation.isLoading}
            >
              {t('mark_all_unread')}
            </Button>
            <Button
              size="xs"
              variant="light"
              color="orange"
              leftIcon={<IconRefresh size={14} />}
              onClick={() => setRangeModalOpen(true)}
            >
              {t('redownload_range')}
            </Button>
            <Button
              size="xs"
              variant="light"
              color="cyan"
              leftIcon={<IconShieldCheck size={14} />}
              onClick={() => auditIntegrityMutation.mutate({ mangaId: manga.id })}
              loading={auditIntegrityMutation.isLoading}
            >
              {t('audit_integrity')}
            </Button>
          </>
        )}
      </Group>
    </Group>
  );

  return (
    <Stack spacing="xs">
      {toolbar}

      <Modal
        opened={rangeModalOpen}
        onClose={() => setRangeModalOpen(false)}
        title={<Text weight={600}>{t('redownload_range_title')}</Text>}
      >
        <Stack spacing="sm">
          <Text size="xs" color="dimmed">
            {t('redownload_range_desc')}
          </Text>
          <Group grow>
            <NumberInput
              label="Desde Capítulo #"
              value={startChapterInput}
              onChange={(val) => setStartChapterInput(typeof val === 'number' ? val : undefined)}
              min={0}
            />
            <NumberInput
              label="Hasta Capítulo #"
              value={endChapterInput}
              onChange={(val) => setEndChapterInput(typeof val === 'number' ? val : undefined)}
              min={0}
            />
          </Group>
          <Group position="right" mt="md">
            <Button variant="default" onClick={() => setRangeModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              color="orange"
              loading={redownloadRangeMutation.isLoading}
              onClick={() => {
                const start = Number(startChapterInput) - 1;
                const end = Number(endChapterInput) - 1;
                redownloadRangeMutation.mutate({
                  mangaId: manga.id,
                  startChapter: start,
                  endChapter: end,
                });
              }}
            >
              Confirmar y Redescargar
            </Button>
          </Group>
        </Stack>
      </Modal>

      {isMobile ? (
        <Stack spacing="xs">
          {records.map((chapter) => {
            const isOutOfSync = outOfSyncIds.has(chapter.id);
            return (
              <Paper key={chapter.id} withBorder p="sm" radius="md">
                <Group position="apart" noWrap align="flex-start">
                  <Stack spacing={4} sx={{ flex: 1, overflow: 'hidden' }}>
                    <Text size="sm" weight={600} lineClamp={2}>
                      #{chapter.index + 1} - {chapter.fileName}
                    </Text>
                    <Group spacing="xs">
                      <Text size="xs" color="dimmed">
                        {dayjs(chapter.createdAt).fromNow()}
                      </Text>
                      <Text size="xs" color="dimmed">
                        •
                      </Text>
                      <Text size="xs" color="dimmed">
                        {prettyBytes(chapter.size)}
                      </Text>
                    </Group>
                  </Stack>
                  <Group spacing="xs" noWrap>
                    <ActionIcon
                      variant="subtle"
                      color={chapter.isRead ? 'teal' : 'gray'}
                      onClick={() => toggleReadMutation.mutate({ id: chapter.id, isRead: !chapter.isRead })}
                      loading={toggleReadMutation.isLoading && toggleReadMutation.variables?.id === chapter.id}
                    >
                      {chapter.isRead ? <IconEye size={20} /> : <IconEyeOff size={20} />}
                    </ActionIcon>
                    {isOutOfSync ? (
                      <Tooltip withArrow label={t('chapter_out_of_sync')}>
                        <IconAlertTriangle color="red" size={20} strokeWidth={2} />
                      </Tooltip>
                    ) : (
                      <Tooltip withArrow label={t('chapter_in_sync')}>
                        <IconCheck color="green" size={20} strokeWidth={3} />
                      </Tooltip>
                    )}
                    <Tooltip withArrow label="Favorite Chapter">
                      <ActionIcon
                        color="yellow"
                        variant="light"
                        onClick={() =>
                          toggleChapterFavoriteMutation.mutate({ id: chapter.id, isFavorite: !chapter.isFavorite })
                        }
                        loading={
                          toggleChapterFavoriteMutation.isLoading &&
                          toggleChapterFavoriteMutation.variables?.id === chapter.id
                        }
                      >
                        {chapter.isFavorite ? <IconStar fill="gold" size={20} /> : <IconStar size={20} />}
                      </ActionIcon>
                    </Tooltip>
                    {readerEnabled && (
                      <Tooltip withArrow label="Read Chapter">
                        <ActionIcon
                          color="indigo"
                          variant="light"
                          onClick={() => {
                            window.location.href = `/reader/${manga.id}/${chapter.id}`;
                          }}
                        >
                          <IconBook size={20} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                    {isReadingMode && (
                      <Tooltip withArrow label={t('report_corrupt_chapter')}>
                        <ActionIcon
                          color="orange"
                          variant="light"
                          onClick={() => reportCorruptMutation.mutate({ chapterId: chapter.id })}
                          loading={
                            reportCorruptMutation.isLoading && reportCorruptMutation.variables?.chapterId === chapter.id
                          }
                        >
                          <IconFlag size={16} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                    {!isReadingMode && (
                      <>
                        <ActionIcon
                          color="orange"
                          variant="light"
                          onClick={() => redownloadMutation.mutate({ chapterId: chapter.id })}
                          loading={
                            redownloadMutation.isLoading && redownloadMutation.variables?.chapterId === chapter.id
                          }
                        >
                          <IconRefresh size={16} />
                        </ActionIcon>
                        <ActionIcon
                          color="red"
                          variant="light"
                          onClick={() => {
                            if (window.confirm(String(t('confirm_delete_chapter')))) {
                              deleteMutation.mutate({ id: chapter.id });
                            }
                          }}
                          loading={deleteMutation.isLoading && deleteMutation.variables?.id === chapter.id}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </>
                    )}
                  </Group>
                </Group>
              </Paper>
            );
          })}
          {totalPages > 1 && (
            <Center mt="md">
              <Pagination total={totalPages} page={page} onChange={setPage} size="sm" />
            </Center>
          )}
        </Stack>
      ) : (
        <DataTable
          withBorder
          withColumnBorders
          striped
          highlightOnHover
          records={records}
          recordsPerPage={PAGE_SIZE}
          sx={(themes) => ({
            '*': {
              fontSize: `${themes.fontSizes.xs}px !important`,
            },
          })}
          page={page}
          totalRecords={manga.chapters.length}
          onPageChange={(p) => setPage(p)}
          columns={columns as any}
        />
      )}
    </Stack>
  );
}

ChaptersTable.defaultProps = {
  isReadingMode: false,
};
