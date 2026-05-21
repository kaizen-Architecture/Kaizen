import { createStyles, Grid, Group, Image, Kbd, Text, UnstyledButton } from '@mantine/core';
import { openSpotlight, SpotlightAction, SpotlightProvider } from '@mantine/spotlight';
import { IconSearch } from '@tabler/icons-react';
import { getCookie } from 'cookies-next';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { trpc } from '../utils/trpc';
import { useAddMangaModal } from './addManga';

const useStyles = createStyles((theme) => ({
  root: {
    height: 34,
    width: 'auto',
    flex: '1 1 auto',
    maxWidth: 250,
    minWidth: 40,
    paddingLeft: theme.spacing.sm,
    paddingRight: 10,
    borderRadius: theme.radius.sm,
    color: theme.white,
    backgroundColor: 'transparent',
    cursor: 'pointer',
    outline: '0 !important',

    [`@media (max-width: ${theme.breakpoints.md}px)`]: {
      maxWidth: 150,
    },

    '&:hover': {
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
  },

  kbd: {
    backgroundColor: theme.colors.indigo[1],
    borderColor: theme.colors.indigo[2],
    color: theme.colors.indigo[7],
    [`@media (max-width: ${theme.breakpoints.md}px)`]: {
      display: 'none',
    },
  },
}));

export function SearchControl() {
  const [actions, setActions] = useState<SpotlightAction[]>([]);
  const addMangaModal = useAddMangaModal();

  const router = useRouter();
  const mangaQuery = trpc.manga.query.useQuery();
  const libraryQuery = trpc.library.query.useQuery();
  const { classes, cx } = useStyles();
  const { t } = useTranslation('common');

  const [panelMode, setPanelMode] = useState<'downloading' | 'reading'>('downloading');
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const session = getCookie('kaizen-session');
    if (session) {
      try {
        const user = JSON.parse(session as string);
        setUserRole(user.role);
      } catch (e) {
        // ignore
      }
    }

    const savedMode = localStorage.getItem('kaizen-panel-mode');
    if (savedMode === 'reading' || savedMode === 'downloading') {
      setPanelMode(savedMode as any);
    }
  }, []);

  useEffect(() => {
    if (mangaQuery.data) {
      const mangaActions: SpotlightAction[] = mangaQuery.data.map((m) => ({
        title: `${m.title} ${m._count?.outOfSyncChapters > 0 ? ' (Out of Sync)' : ''}`,
        description: `${(m.metadata?.summary || '').split(' ').slice(0, 50).join(' ')}...`,
        group: m.source,
        icon: (
          <Image
            radius="sm"
            withPlaceholder
            placeholder={<Image radius="sm" src="/cover-not-found.jpg" alt={m.title} width={60} height={100} />}
            src={m.metadata?.cover}
            width={60}
            height={100}
          />
        ),
        closeOnTrigger: true,
        onTrigger: () => router.push(`/manga/${m.id}`),
      }));

      const isReadingMode = userRole === 'READER' || panelMode === 'reading';
      const actionsList: SpotlightAction[] = [];

      if (!isReadingMode) {
        actionsList.push({
          title: 'Add Manga',
          group: ' ',
          description: 'You can add new manga from several sources',
          icon: <Image radius="sm" src="/new-manga.png" width={60} height={100} />,
          closeOnTrigger: true,
          onTrigger: () => addMangaModal(() => mangaQuery.refetch()),
        });
      }

      setActions([...actionsList, ...mangaActions]);
    }
  }, [addMangaModal, mangaQuery, router, userRole, panelMode]);
  return (
    <SpotlightProvider
      actions={actions}
      searchIcon={<IconSearch size={18} color="white" />}
      highlightQuery
      limit={5}
      disabled={libraryQuery.isLoading || !libraryQuery.data}
      searchPlaceholder={t('header.searchPlaceholder') as string}
      shortcut="ctrl + p"
      nothingFoundMessage="Nothing found..."
    >
      <UnstyledButton className={cx(classes.root)} onClick={() => openSpotlight()}>
        <Grid gutter={5}>
          <Grid.Col span="content" style={{ display: 'flex', alignItems: 'center' }}>
            <IconSearch size={14} strokeWidth={1.5} color="white" />
          </Grid.Col>
          <Grid.Col span="auto" style={{ display: 'flex', alignItems: 'center' }}>
            <Group
              spacing={2}
              noWrap
              sx={(theme) => ({ [`@media (max-width: ${theme.breakpoints.md}px)`]: { display: 'none' } })}
            >
              <Text size="sm" color="white" sx={{ opacity: 0.8 }}>
                {t('common.search')}
              </Text>
            </Group>
          </Grid.Col>
          <Grid.Col span="content">
            <Group spacing={5}>
              <Kbd className={classes.kbd} py={0}>
                Ctrl
              </Kbd>
              <Text
                size="xs"
                color="white"
                sx={(theme) => ({
                  opacity: 0.6,
                  [`@media (max-width: ${theme.breakpoints.md}px)`]: { display: 'none' },
                })}
              >
                +
              </Text>
              <Kbd className={classes.kbd} py={0}>
                P
              </Kbd>
            </Group>
          </Grid.Col>
        </Grid>
      </UnstyledButton>
    </SpotlightProvider>
  );
}
