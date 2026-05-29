import {
  ActionIcon,
  Badge,
  Box,
  createStyles,
  Divider,
  Grid,
  Group,
  Image,
  LoadingOverlay,
  Popover,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { UseFormReturnType } from '@mantine/form';
import { getHotkeyHandler } from '@mantine/hooks';
import { IconCheck, IconEdit, IconGitMerge } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { trpc } from '../../../utils/trpc';
import type { FormType } from '../form';

const useStyles = createStyles((_theme) => ({
  placeHolder: {
    alignItems: 'start !important',
    justifyContent: 'flex-start !important',
  },
}));

export function ReviewStep({ form }: { form: UseFormReturnType<FormType> }) {
  const { t } = useTranslation(['common']);
  const [anilistId, setAnilistId] = useState<string>();
  const [opened, setOpened] = useState(false);
  const bindMutation = trpc.manga.bind.useMutation();
  const query = trpc.manga.detail.useQuery(
    {
      source: form.values.source[0]!,
      title: form.values.mangaTitle,
    },
    {
      staleTime: Infinity,
      enabled: form.values.source.length > 0 && !!form.values.mangaTitle,
    },
  );

  const { classes } = useStyles();

  const manga = query.data;

  const handleBind = async () => {
    setOpened(false);
    if (!anilistId || !manga?.name) {
      return;
    }
    await bindMutation.mutateAsync({
      anilistId,
      title: manga.name,
    });

    query.refetch();
    setAnilistId('');
  };

  const chaptersCount = manga?.chapters?.length || 0;
  const translatedChaptersText = t('common:addManga.review.chaptersSummary', {
    count: chaptersCount,
    defaultValue: chaptersCount === 1 ? 'There is 1 chapter' : `There are ${chaptersCount} chapters`,
  });

  return (
    <>
      <LoadingOverlay visible={query.isLoading || bindMutation.isLoading} />

      {manga && (
        <Grid>
          <Grid.Col span={4}>
            <Image
              classNames={{
                placeholder: classes.placeHolder,
              }}
              sx={(theme) => ({
                boxShadow: theme.shadows.xl,
              })}
              withPlaceholder
              placeholder={
                <Image
                  sx={(theme) => ({
                    width: 210,
                    boxShadow: theme.shadows.xl,
                  })}
                  src="/cover-not-found.jpg"
                  alt={manga.name}
                />
              }
              src={manga.metadata.cover.extraLarge || manga.metadata.cover.large || manga.metadata.cover.medium}
            />
          </Grid.Col>
          <Grid.Col span={8}>
            <Divider
              mb="xs"
              labelPosition="center"
              label={
                <>
                  <Title order={3}>{manga.name}</Title>
                  <Popover
                    width={300}
                    trapFocus
                    position="bottom"
                    withArrow
                    shadow="md"
                    opened={opened}
                    onChange={setOpened}
                  >
                    <Popover.Target>
                      <Tooltip inline label={t('common:addManga.review.fixMatch', 'Fix the wrong match')}>
                        <ActionIcon
                          ml={4}
                          color="indigo"
                          variant="transparent"
                          size="lg"
                          radius="xl"
                          onClick={() => setOpened((o) => !o)}
                        >
                          <IconEdit size={18} />
                        </ActionIcon>
                      </Tooltip>
                    </Popover.Target>
                    <Popover.Dropdown
                      sx={(theme) => ({
                        background: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
                      })}
                    >
                      <TextInput
                        data-autofocus
                        mb="xl"
                        size="md"
                        radius="xl"
                        value={anilistId}
                        onChange={(event) => setAnilistId(event.currentTarget.value)}
                        onKeyDown={getHotkeyHandler([['Enter', handleBind]])}
                        icon={<IconGitMerge size={18} strokeWidth={1.5} />}
                        rightSection={
                          <ActionIcon size={32} radius="xl" color="indigo" variant="filled" onClick={handleBind}>
                            <IconCheck size={18} strokeWidth={1.5} />
                          </ActionIcon>
                        }
                        label={
                          <Text size="sm" mb="xs">
                            {t('common:addManga.review.enterAnilistId', {
                              name: manga.name,
                              defaultValue: `Please enter a new AniList id for ${manga.name}`,
                            })}
                          </Text>
                        }
                        placeholder={t('common:addManga.review.anilistIdPlaceholder', 'AniList Id') as string}
                      />
                    </Popover.Dropdown>
                  </Popover>
                </>
              }
            />
            {manga.metadata.synonyms && (
              <Group spacing="xs">
                {manga.metadata.synonyms.map((synonym) => (
                  <Tooltip label={synonym} key={synonym}>
                    <div style={{ maxWidth: 100 }}>
                      <Badge color="indigo" variant="filled" size="sm" fullWidth>
                        {synonym}
                      </Badge>
                    </div>
                  </Tooltip>
                ))}
              </Group>
            )}
            <Divider variant="dashed" my="xs" label={t('common:addManga.review.statusLabel', 'Status')} />
            {manga.metadata.status ? (
              <Badge color="cyan" variant="filled" size="sm">
                {manga.metadata.status}
              </Badge>
            ) : (
              <Text size="sm">{t('common:addManga.review.noStatus', 'No status...')}</Text>
            )}
            <Divider variant="dashed" my="xs" label={t('common:addManga.review.chaptersLabel', 'Chapters')} />
            <Text>
              {translatedChaptersText.split(String(chaptersCount))[0]}
              <Badge color="teal" variant="outline" size="lg" sx={{ mx: 4 }}>
                {chaptersCount}
              </Badge>
              {translatedChaptersText.split(String(chaptersCount))[1]}
            </Text>
            <Divider variant="dashed" my="xs" label={t('common:addManga.review.summaryLabel', 'Summary')} />
            <Text size="sm">{manga.metadata.summary || t('common:addManga.review.noSummary', 'No summary...')}</Text>
            <Divider variant="dashed" my="xs" label={t('common:addManga.review.genresLabel', 'Genres')} />
            {manga.metadata.genres && manga.metadata.genres.length !== 0 ? (
              <Group spacing="xs">
                {manga.metadata.genres.map((genre) => (
                  <Tooltip label={genre} key={genre}>
                    <div style={{ maxWidth: 100 }}>
                      <Badge color="indigo" variant="light" size="xs" fullWidth>
                        <Box className="h-3">{genre}</Box>
                      </Badge>
                    </div>
                  </Tooltip>
                ))}
              </Group>
            ) : (
              <Text size="sm">{t('common:addManga.review.noGenres', 'No genres...')}</Text>
            )}
            <Divider variant="dashed" my="xs" label={t('common:addManga.review.tagsLabel', 'Tags')} />
            {manga.metadata.tags && manga.metadata.tags.length !== 0 ? (
              <Group spacing="xs">
                {manga.metadata.tags.map((tag) => (
                  <Tooltip label={tag} key={tag}>
                    <div style={{ maxWidth: 100 }}>
                      <Badge color="violet" variant="light" size="xs" fullWidth>
                        <Box className="h-3">{tag}</Box>
                      </Badge>
                    </div>
                  </Tooltip>
                ))}
              </Group>
            ) : (
              <Text size="sm">{t('common:addManga.review.noTags', 'No tags...')}</Text>
            )}
          </Grid.Col>
        </Grid>
      )}
    </>
  );
}
