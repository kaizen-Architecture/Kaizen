import { Prisma } from '@prisma/client';
import { DataTable } from 'mantine-datatable';

import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

import { Center, Tooltip, Stack, Paper, Group, Text, Pagination, ActionIcon, Box, Button } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconAlertTriangle, IconCheck, IconTrash, IconEye, IconEyeOff } from '@tabler/icons-react';
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

export function ChaptersTable({ manga }: { manga: MangaWithMetadataAndChaptersAndOutOfSyncChaptersAndLibrary }) {
  const { t } = useTranslation('common');
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [records, setRecords] = useState(manga.chapters.slice(0, PAGE_SIZE));
  const queryMobile = useMediaQuery('(max-width: 768px)');
  const [isMobile, setIsMobile] = useState(false);
  const outOfSyncIds = useMemo(() => new Set(manga.outOfSyncChapters.map((c) => c.id)), [manga.outOfSyncChapters]);

  const deleteMutation = trpc.manga.deleteChapter.useMutation({
    onSuccess: () => {
      router.replace(router.asPath);
    },
  });

  const utils = trpc.useContext();

  const toggleReadMutation = trpc.manga.toggleChapterRead.useMutation({
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

  const columns = useMemo(
    () => [
      { accessor: 'index', title: '#', render: ({ index }: { index: number }) => `${index + 1}` },
      {
        accessor: 'isRead',
        title: t('read'),
        width: 70,
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
        width: 70,
        render: ({ id }: { id: number }) => (
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
            <ActionIcon
              color="red"
              variant="light"
              size="sm"
              onClick={() => {
                if (window.confirm(t('confirm_delete_chapter'))) {
                  deleteMutation.mutate({ id });
                }
              }}
              loading={deleteMutation.isLoading && deleteMutation.variables?.id === id}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
        ),
      },
    ],
    [
      outOfSyncIds,
      deleteMutation.isLoading,
      deleteMutation.variables?.id,
      toggleReadMutation.isLoading,
      toggleReadMutation.variables?.id,
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
        <Button
          size="xs"
          variant="light"
          color="gray"
          onClick={() => toggleMangaReadMutation.mutate({ id: manga.id, isRead: false })}
          loading={toggleMangaReadMutation.isLoading}
        >
          {t('mark_all_unread')}
        </Button>
      </Group>
    </Group>
  );

  if (isMobile) {
    return (
      <Stack spacing="xs">
        {toolbar}
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
                  <ActionIcon
                    color="red"
                    variant="light"
                    onClick={() => {
                      if (window.confirm(t('confirm_delete_chapter'))) {
                        deleteMutation.mutate({ id: chapter.id });
                      }
                    }}
                    loading={deleteMutation.isLoading && deleteMutation.variables?.id === chapter.id}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
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
    );
  }

  return (
    <Stack spacing="xs">
      {toolbar}
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
    </Stack>
  );
}
