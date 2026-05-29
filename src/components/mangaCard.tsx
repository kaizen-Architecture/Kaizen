import { ActionIcon, Badge, Box, createStyles, Paper, Skeleton, Title, Tooltip, Group, ThemeIcon } from '@mantine/core';
import { Prisma } from '@prisma/client';
import { IconEdit, IconExclamationMark, IconRefresh, IconX, IconCircleCheck } from '@tabler/icons-react';
import { contrastColor } from 'contrast-color';
import { motion } from 'framer-motion';
import stc from 'string-to-color';
import { useTranslation } from 'next-i18next';
import { useRefreshModal } from './refreshMetadata';
import { useRemoveModal } from './removeManga';
import { useUpdateModal } from './updateManga';

const useStyles = createStyles((theme, _params, getRef) => ({
  skeletonCard: {
    height: 320,
    width: 200,
  },
  card: {
    position: 'relative',
    height: 320,
    width: 200,
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundSize: 'cover',
    backgroundPosition: 'center',

    transition: 'all 0.2s ease',

    '&:hover': {
      transform: 'translateY(-4px)',
      boxShadow: theme.shadows.xl,
    },
    [`&:hover .${getRef('removeButton')}`]: {
      display: 'flex',
    },
    [`&:hover .${getRef('editButton')}`]: {
      display: 'flex',
    },
    [`&:hover .${getRef('refreshButton')}`]: {
      display: 'flex',
    },
  },
  removeButton: {
    ref: getRef('removeButton'),
    position: 'absolute',
    right: -5,
    top: -5,
    display: 'none',
  },
  refreshButton: {
    ref: getRef('refreshButton'),
    backgroundColor: theme.white,
    color: theme.colors.indigo[6],
    position: 'absolute',
    right: 10,
    bottom: 50,
    display: 'none',
    '&:hover': {
      backgroundColor: theme.colors.gray[0],
    },
  },
  outOfSyncClass: {
    position: 'absolute',
    alignContent: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    backgroundColor: theme.colors.red[6],
    border: `2px solid ${theme.white}`,
    left: 8,
    bottom: 8,
    borderRadius: 9999,
    width: 24,
    height: 24,
  },
  editButton: {
    ref: getRef('editButton'),
    backgroundColor: theme.white,
    color: theme.colors.indigo[6],
    position: 'absolute',
    right: 10,
    bottom: 10,
    display: 'none',
    '&:hover': {
      backgroundColor: theme.colors.gray[0],
    },
  },
  title: {
    fontFamily: `${theme.fontFamily}`,
    fontWeight: 900,
    color: theme.white,
    lineHeight: 1.2,
    wordBreak: 'break-word',
    marginTop: theme.spacing.xs,
  },

  badge: {
    cursor: 'pointer',
  },
}));

const mangaWithLibraryAndMetadataAndOutOfSyncChapters = Prisma.validator<Prisma.MangaArgs>()({
  include: { metadata: true, library: true, _count: { select: { chapters: true, outOfSyncChapters: true } } },
});

type MangaWithLibraryAndMetadataAndOutOfSyncChapters = Prisma.MangaGetPayload<
  typeof mangaWithLibraryAndMetadataAndOutOfSyncChapters
> & {
  readChaptersCount?: number;
  isFullyRead?: boolean;
};

interface MangaCardProps {
  manga: MangaWithLibraryAndMetadataAndOutOfSyncChapters;
  onRemove?: (shouldRemoveFiles: boolean) => void;
  onUpdate?: () => void;
  onRefresh?: () => void;
  onClick: () => void;
  isReadingMode?: boolean;
}

export function SkeletonMangaCard() {
  const { classes } = useStyles();

  return <Skeleton radius="md" className={classes.skeletonCard} />;
}

interface MangaCardActionsProps {
  onRemove: () => void;
  onRefresh: () => void;
  onUpdate: () => void;
  classes: Record<string, string>;
}

function MangaCardActions({ onRemove, onRefresh, onUpdate, classes }: MangaCardActionsProps) {
  return (
    <>
      <Tooltip withinPortal withArrow label="Remove Manga" position="left">
        <ActionIcon
          color="red"
          variant="filled"
          radius="xl"
          aria-label="Remove Manga"
          className={classes.removeButton}
          onClick={(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <IconX size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip withinPortal withArrow label="Refresh Metadata" position="left">
        <ActionIcon
          color="teal"
          variant="filled"
          aria-label="Refresh Metadata"
          size="lg"
          radius="xl"
          className={classes.refreshButton}
          onClick={(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
            e.stopPropagation();
            onRefresh();
          }}
        >
          <IconRefresh size={18} />
        </ActionIcon>
      </Tooltip>
      <Tooltip withinPortal withArrow label="Edit" position="left">
        <ActionIcon
          color="indigo"
          variant="light"
          size="lg"
          radius="xl"
          aria-label="Edit Manga"
          className={classes.editButton}
          onClick={(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
            e.stopPropagation();
            onUpdate();
          }}
        >
          <IconEdit size={18} />
        </ActionIcon>
      </Tooltip>
    </>
  );
}

interface MangaCardStatusProps {
  outOfSyncChapters?: number;
  classes: Record<string, string>;
}

function MangaCardStatus({ outOfSyncChapters, classes }: MangaCardStatusProps) {
  if (!outOfSyncChapters || outOfSyncChapters <= 0) return null;

  return (
    <Tooltip withinPortal withArrow label="This manga has out of sync chapters." position="right">
      <motion.div
        className={classes.outOfSyncClass}
        initial={{
          scale: 1,
        }}
        animate={{
          scale: [1.1, 1.0],
        }}
        exit={{
          scale: 1,
        }}
        transition={{
          duration: 1,
          repeat: Infinity,
          repeatType: 'loop',
          type: 'spring',
          stiffness: 400,
          damping: 10,
          repeatDelay: 3,
        }}
      >
        <IconExclamationMark color="white" strokeWidth={3} />
      </motion.div>
    </Tooltip>
  );
}

interface MangaCardContentProps {
  source: string;
  chaptersCount: number;
  title: string;
  classes: Record<string, string>;
  minChaptersForDownload?: number;
  remoteChaptersCount?: number;
}

function MangaCardContent({
  source,
  chaptersCount,
  title,
  classes,
  integrationStatus,
  isFullyRead,
  status,
  minChaptersForDownload = 0,
  remoteChaptersCount = 0,
}: MangaCardContentProps & {
  integrationStatus?: 'ready' | 'pending' | 'error';
  isFullyRead?: boolean;
  status?: string;
}) {
  const { t } = useTranslation(['common']);

  return (
    <div>
      <Group spacing={5} mb={5}>
        <Badge
          sx={{ backgroundColor: stc(source), color: contrastColor({ bgColor: stc(source) }) }}
          className={classes.badge}
          size="xs"
        >
          <Box className="h-3">{source}</Box>
        </Badge>
        {minChaptersForDownload > 0 ? (
          <Badge color="orange" size="xs" variant="filled">
            <Box className="h-3">
              {remoteChaptersCount}/{minChaptersForDownload} {t('common:addManga.review.chaptersLabel', 'Capítulos')}
            </Box>
          </Badge>
        ) : (
          <Badge color="indigo" size="xs" variant="filled">
            <Box className="h-3">
              {chaptersCount} {t('common:addManga.review.chaptersLabel', 'chapters')}
            </Box>
          </Badge>
        )}
        {isFullyRead && status === 'FINISHED' && (
          <Badge color="green" size="xs" variant="filled">
            <Box className="h-3">Read</Box>
          </Badge>
        )}
        {integrationStatus && !isFullyRead && (
          <Tooltip label={`Integration Status: ${integrationStatus}`} withinPortal>
            <ThemeIcon
              size="xs"
              radius="xl"
              color={integrationStatus === 'ready' ? 'teal' : integrationStatus === 'error' ? 'red' : 'yellow'}
              variant="filled"
            >
              {integrationStatus === 'ready' ? (
                <IconCircleCheck size={10} />
              ) : integrationStatus === 'error' ? (
                <IconX size={10} />
              ) : (
                <IconRefresh size={10} />
              )}
            </ThemeIcon>
          </Tooltip>
        )}
      </Group>
      <Title order={5} className={classes.title}>
        {title}
      </Title>
    </div>
  );
}

export function MangaCard({
  manga,
  onRemove = () => {},
  onUpdate = () => {},
  onRefresh = () => {},
  onClick,
  isReadingMode,
}: MangaCardProps) {
  const { classes } = useStyles();
  const removeModal = useRemoveModal(manga.title, onRemove);
  const refreshModal = useRefreshModal(manga.title, onRefresh);
  const updateModal = useUpdateModal(manga, onUpdate);

  return (
    <Paper
      onClick={onClick}
      shadow="lg"
      p="md"
      radius="md"
      sx={{
        backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.2)), url(${manga.metadata.cover})`,
      }}
      className={classes.card}
    >
      {!isReadingMode && (
        <MangaCardActions onRemove={removeModal} onRefresh={refreshModal} onUpdate={updateModal} classes={classes} />
      )}

      {manga.isFullyRead && manga.metadata?.status === 'FINISHED' && (
        <Badge
          color="green"
          variant="filled"
          size="xs"
          sx={{
            position: 'absolute',
            left: 10,
            top: 10,
            zIndex: 2,
            textTransform: 'uppercase',
            fontWeight: 800,
            boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
          }}
        >
          ✓ Leído
        </Badge>
      )}

      <MangaCardStatus outOfSyncChapters={manga._count?.outOfSyncChapters} classes={classes} />

      <MangaCardContent
        source={manga.source}
        chaptersCount={manga._count?.chapters || 0}
        title={manga.title}
        classes={classes}
        integrationStatus={
          manga._count?.chapters > 0 && (manga as any).chapters?.length === 0 ? 'ready' : 'pending'
        }
        isFullyRead={manga.isFullyRead}
        status={manga.metadata?.status}
        minChaptersForDownload={manga.minChaptersForDownload}
        remoteChaptersCount={manga.remoteChaptersCount}
      />
    </Paper>
  );
}
