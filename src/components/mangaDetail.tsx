import {
  ActionIcon,
  Badge,
  Box,
  createStyles,
  Divider,
  Grid,
  Group,
  Image,
  Spoiler,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { NextLink } from '@mantine/next';
import { Prisma } from '@prisma/client';
import { IconExternalLink, IconRefresh, IconEdit } from '@tabler/icons-react';
import { contrastColor } from 'contrast-color';
import stc from 'string-to-color';
import { useTranslation } from 'next-i18next';
import { CoverImage } from './kaizen/CoverImage';
import { useModals } from '@mantine/modals';
import { getCronLabel } from '../utils';
import { trpc } from '../utils/trpc';
import { EditMetadataModalContent } from './kaizen/EditMetadataModal';

const useStyles = createStyles((theme) => ({
  root: {
    wordBreak: 'break-word',
  },
  outsideLink: {
    textDecoration: 'none',
    fontWeight: 600,
    color: theme.colors.indigo[7],
    '&:hover': {
      color: theme.colors.indigo[7],
    },
    fontSize: 24,
  },
  placeHolder: {
    alignItems: 'start !important',
    justifyContent: 'flex-start !important',
  },
}));

const mangaWithMetadataAndChapters = Prisma.validator<Prisma.MangaArgs>()({
  include: { metadata: true, chapters: true, sources: true },
});

export type MangaWithMetadataAndChapters = Prisma.MangaGetPayload<typeof mangaWithMetadataAndChapters>;

export function MangaDetail({ manga, isReadingMode }: { manga: MangaWithMetadataAndChapters; isReadingMode?: boolean }) {
  const { t } = useTranslation('manga');
  const { classes } = useStyles();
  const utils = trpc.useContext();
  const refreshMetadata = trpc.manga.refreshMetaData.useMutation({
    onSuccess: () => {
      utils.manga.get.invalidate({ id: manga.id });
    },
  });
  const modals = useModals();

  const openEditModal = () => {
    const id = modals.openModal({
      title: t('detail.editMetadata', 'Edit Metadata'),
      centered: true,
      children: (
        <EditMetadataModalContent
          manga={manga}
          onClose={() => modals.closeModal(id)}
          onSuccess={() => utils.manga.get.invalidate({ id: manga.id })}
        />
      ),
    });
  };

  return (
    <Spoiler
      maxHeight={460}
      styles={{
        control: {
          width: '100%',
          textDecoration: 'none !important',
          fontWeight: 'bolder',
        },
      }}
      showLabel={<Divider labelPosition="center" size="sm" variant="solid" label={t('detail.showMore')} />}
      hideLabel={<Divider labelPosition="center" size="sm" variant="solid" label={t('detail.hide')} />}
    >
      <Grid className={classes.root}>
        <Grid.Col span="auto" style={{ maxWidth: 300 }}>
          <CoverImage
            src={manga.metadata?.cover}
            width={210}
            height={315}
            radius="md"
            alt={manga.title}
            sx={(theme: any) => ({
              boxShadow: theme.shadows.xl,
            })}
          />
        </Grid.Col>
        <Grid.Col span="auto">
          <Divider
            mb="xs"
            labelPosition="left"
            label={
              manga.metadata?.urls?.find((url) => url.includes('anilist')) ? (
                <NextLink
                  target="_blank"
                  className={classes.outsideLink}
                  href={manga.metadata.urls.find((url) => url.includes('anilist')) || '#'}
                >
                  <Text mr={5} inline component="span">
                    {manga.title}
                  </Text>
                  <IconExternalLink size={18} />
                </NextLink>
              ) : (
                <Title sx={{ fontSize: 24 }} order={3}>
                  {manga.title}
                </Title>
              )
            }
          />
          <Group spacing={0}>
            {(manga.metadata?.synonyms || []).map((synonym) => (
              <Badge key={synonym} color="gray" variant="filled" size="xs" m={2}>
                <Box className="h-3">{synonym}</Box>
              </Badge>
            ))}
          </Group>
          <Divider sx={{ fontWeight: 'bolder' }} variant="dashed" my="xs" label={t('detail.download')} />
          <Group
            spacing={5}
            sx={(theme) => ({
              fontSize: theme.fontSizes.xs,
            })}
          >
            {t('detail.checking')}{' '}
            <Badge component="span" color="indigo" variant="filled" size="xs">
              <Box className="h-3">{getCronLabel(manga.interval)}</Box>
            </Badge>{' '}
            {t('detail.from')}{' '}
            <Badge
              component="span"
              color="cyan"
              variant="filled"
              size="xs"
              sx={{
                backgroundColor: stc(manga.source || 'mangal'),
                color: contrastColor({ bgColor: stc(manga.source || 'mangal') }),
              }}
            >
              <Box className="h-3">{manga.source}</Box>
            </Badge>
          </Group>
          <Divider sx={{ fontWeight: 'bolder' }} variant="dashed" my="xs" label={t('detail.status')} />
          <Group spacing="xs">
            <Badge color="cyan" variant="filled" size="sm">
              {manga.metadata?.status || 'Unknown'}
            </Badge>
            {!isReadingMode && (
              <Tooltip label="Refresh Metadata" withArrow position="right">
                <ActionIcon
                  variant="light"
                  color="indigo"
                  size="sm"
                  loading={refreshMetadata.isLoading}
                  onClick={() => refreshMetadata.mutate({ id: manga.id })}
                >
                  <IconRefresh size={14} />
                </ActionIcon>
              </Tooltip>
            )}
            {!isReadingMode && (
              <Tooltip label="Edit Metadata" withArrow position="right">
                <ActionIcon variant="light" color="indigo" size="sm" onClick={openEditModal}>
                  <IconEdit size={14} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>

          <Divider sx={{ fontWeight: 'bolder' }} variant="dashed" my="xs" label={t('detail.summary')} />
          <Text size="xs">{manga.metadata?.summary || t('detail.noSummary')}</Text>
          <Divider sx={{ fontWeight: 'bolder' }} variant="dashed" my="xs" label={t('detail.genres')} />
          <Group spacing={0}>
            {(manga.metadata?.genres || []).map((genre) => (
              <Badge key={genre} color="indigo" variant="light" size="xs" m={2}>
                <Box className="h-3">{genre}</Box>
              </Badge>
            ))}
          </Group>
          <Divider sx={{ fontWeight: 'bolder' }} variant="dashed" my="xs" label={t('detail.tags')} />
          <Group spacing={0}>
            {(manga.metadata?.tags || []).map((tag) => (
              <Badge key={tag} color="violet" variant="light" size="xs" m={2}>
                <Box className="h-3">{tag}</Box>
              </Badge>
            ))}
          </Group>
        </Grid.Col>
      </Grid>
    </Spoiler>
  );
}
