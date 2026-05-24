import { Box, Divider, Grid, Group, Skeleton } from '@mantine/core';
import { useRouter } from 'next/router';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { ChaptersTable } from '../../components/chaptersTable';
import { MangaDetail } from '../../components/mangaDetail';
import { MangaSources } from '../../components/mangaSources';
import { trpc } from '../../utils/trpc';

function MangaPageSkeleton() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100dvh - 88px)' }}>
      <Box sx={{ flexBasis: 'fit-content' }}>
        <Grid>
          <Grid.Col span="auto" style={{ maxWidth: 300 }}>
            <Skeleton height={300} width={210} radius="md" />
          </Grid.Col>
          <Grid.Col span="auto">
            <Skeleton height={40} mb="xs" />
            <Group spacing={5} mb="md">
              <Skeleton height={20} width={100} radius="xl" />
              <Skeleton height={20} width={100} radius="xl" />
              <Skeleton height={20} width={100} radius="xl" />
            </Group>
            <Skeleton height={20} width="60%" mb="xs" />
            <Skeleton height={20} width="40%" mb="md" />
            <Skeleton height={80} width="100%" mb="md" />
            <Group spacing={5}>
              <Skeleton height={20} width={60} radius="xl" />
              <Skeleton height={20} width={60} radius="xl" />
              <Skeleton height={20} width={60} radius="xl" />
            </Group>
          </Grid.Col>
        </Grid>

        <Box sx={{ marginTop: 20 }}>
          <Group position="apart" mb="xs">
            <Group spacing="xs">
              <Skeleton height={30} width={200} />
              <Skeleton height={20} width={60} />
            </Group>
            <Group spacing="xs">
              <Skeleton height={30} width={100} />
              <Skeleton height={30} width={100} />
            </Group>
          </Group>
          <Divider mb="sm" />
          <Skeleton height={100} width="100%" />
        </Box>
      </Box>
      <Box sx={{ marginTop: 20, overflow: 'hidden', flex: 1 }}>
        <Skeleton height="100%" width="100%" />
      </Box>
    </Box>
  );
}

export default function MangaPage({ readerMode = 'downloader' }: { readerMode?: 'downloader' | 'reader' }) {
  const router = useRouter();
  const { id } = router.query;
  const isReadingMode = readerMode === 'reader';

  const mangaQuery = trpc.manga.get.useQuery(
    {
      id: parseInt(id as string, 10),
    },
    {
      enabled: id !== undefined,
      refetchOnWindowFocus: false,
    },
  );

  if (mangaQuery.isLoading) {
    return <MangaPageSkeleton />;
  }

  if (mangaQuery.isError || !mangaQuery.data) {
    router.push('/404');
    return null;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100dvh - 88px)' }}>
      <Box sx={{ flexBasis: 'fit-content' }}>
        <MangaDetail manga={mangaQuery.data} isReadingMode={isReadingMode} />
        <MangaSources manga={mangaQuery.data} onUpdate={() => mangaQuery.refetch()} isReadingMode={isReadingMode} />
      </Box>
      <Box sx={{ marginTop: 20, overflow: 'hidden', flex: 1 }}>
        <ChaptersTable manga={mangaQuery.data} isReadingMode={isReadingMode} />
      </Box>
    </Box>
  );
}

MangaPage.defaultProps = {
  readerMode: 'downloader',
};

export async function getServerSideProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ['common', 'manga', 'settings'])),
    },
  };
}
