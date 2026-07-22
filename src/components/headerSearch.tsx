import { createStyles, Grid, Group, Image, Kbd, Text, UnstyledButton, useMantineTheme } from '@mantine/core';
import { openSpotlight, SpotlightAction, SpotlightProvider } from '@mantine/spotlight';
import { IconSearch } from '@tabler/icons-react';
import { getCookie } from 'cookies-next';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { trpc } from '../utils/trpc';
import { useAddMangaModal } from './addManga';
import { useAppTheme } from '../theme/ThemeContext';
import { CoverImage } from './kaizen/CoverImage';

const useStyles = createStyles(
  (
    theme,
    {
      textColor,
      hoverBg,
      kbdBg,
      kbdBorder,
      kbdColor,
    }: {
      textColor: string;
      hoverBg: string;
      kbdBg: string;
      kbdBorder: string;
      kbdColor: string;
    },
  ) => ({
    root: {
      height: 34,
      width: 'auto',
      flex: '1 1 auto',
      maxWidth: 250,
      minWidth: 40,
      paddingLeft: theme.spacing.sm,
      paddingRight: 10,
      borderRadius: theme.radius.sm,
      color: textColor,
      backgroundColor: 'transparent',
      cursor: 'pointer',
      outline: '0 !important',

      [`@media (max-width: ${theme.breakpoints.md}px)`]: {
        maxWidth: 150,
      },

      '&:hover': {
        backgroundColor: hoverBg,
      },
    },

    kbd: {
      backgroundColor: kbdBg,
      borderColor: kbdBorder,
      color: kbdColor,
      [`@media (max-width: ${theme.breakpoints.md}px)`]: {
        display: 'none',
      },
    },
  }),
);

export function SearchControl({ readerMode = 'downloader' }: { readerMode?: 'downloader' | 'reader' }) {
  const [actions, setActions] = useState<SpotlightAction[]>([]);
  const addMangaModal = useAddMangaModal();

  const router = useRouter();
  const mangaQuery = trpc.manga.query.useQuery();
  const libraryQuery = trpc.library.query.useQuery();
  const { currentThemeConfig } = useAppTheme();
  const mantineTheme = useMantineTheme();
  const textColor =
    mantineTheme.colorScheme === 'dark'
      ? currentThemeConfig.colors.headerText.dark
      : currentThemeConfig.colors.headerText.light;
  const hoverBg = mantineTheme.colorScheme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
  const kbdBg =
    mantineTheme.colorScheme === 'dark'
      ? currentThemeConfig.name === 'kaizen'
        ? mantineTheme.colors.dark[5]
        : mantineTheme.colors.indigo[9]
      : currentThemeConfig.name === 'kaizen'
      ? mantineTheme.colors.gray[1]
      : mantineTheme.colors.indigo[1];
  const kbdBorder =
    mantineTheme.colorScheme === 'dark'
      ? currentThemeConfig.name === 'kaizen'
        ? mantineTheme.colors.dark[4]
        : mantineTheme.colors.indigo[8]
      : currentThemeConfig.name === 'kaizen'
      ? mantineTheme.colors.gray[2]
      : mantineTheme.colors.indigo[2];
  const kbdColor =
    mantineTheme.colorScheme === 'dark'
      ? currentThemeConfig.name === 'kaizen'
        ? mantineTheme.colors.dark[0]
        : mantineTheme.colors.indigo[0]
      : currentThemeConfig.name === 'kaizen'
      ? mantineTheme.colors.gray[7]
      : mantineTheme.colors.indigo[7];

  const { classes, cx } = useStyles({
    textColor,
    hoverBg,
    kbdBg,
    kbdBorder,
    kbdColor,
  });
  const { t } = useTranslation('common');

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
  }, []);

  useEffect(() => {
    if (mangaQuery.data) {
      const mangaActions: SpotlightAction[] = mangaQuery.data.map((m) => ({
        title: `${m.title} ${m._count?.outOfSyncChapters > 0 ? ' (Out of Sync)' : ''}`,
        description: `${(m.metadata?.summary || '').split(' ').slice(0, 50).join(' ')}...`,
        group: m.source,
        icon: <CoverImage src={m.metadata?.cover} width={60} height={100} radius="sm" alt={m.title} />,
        closeOnTrigger: true,
        onTrigger: () => {
          window.location.href = `/manga/${m.id}`;
        },
      }));

      const isReadingMode = userRole === 'READER' || readerMode === 'reader';
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
  }, [addMangaModal, mangaQuery, router, userRole, readerMode]);
  return (
    <SpotlightProvider
      actions={actions}
      searchIcon={<IconSearch size={18} color={textColor} />}
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
            <IconSearch size={14} strokeWidth={1.5} color="currentColor" />
          </Grid.Col>
          <Grid.Col span="auto" style={{ display: 'flex', alignItems: 'center' }}>
            <Group
              spacing={2}
              noWrap
              sx={(theme) => ({ [`@media (max-width: ${theme.breakpoints.md}px)`]: { display: 'none' } })}
            >
              <Text size="sm" sx={{ opacity: 0.8 }}>
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

SearchControl.defaultProps = {
  readerMode: 'downloader',
};
