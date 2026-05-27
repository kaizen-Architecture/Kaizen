import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { Prisma } from '@prisma/client';
import { IconArrowDown, IconArrowUp, IconPlus, IconRefresh, IconCheck, IconTrash, IconX } from '@tabler/icons-react';
import { contrastColor } from 'contrast-color';
import stc from 'string-to-color';
import { useState } from 'react';
import { trpc } from '../utils/trpc';
import { SearchStep, SearchStepForm } from './addManga/steps/searchStep';

const mangaWithSources = Prisma.validator<Prisma.MangaArgs>()({
  include: { sources: true },
});

type MangaWithSources = Prisma.MangaGetPayload<typeof mangaWithSources>;

interface MangaSourcesProps {
  manga: MangaWithSources;
  onUpdate: () => void;
  isReadingMode?: boolean;
}

export function MangaSources({ manga, onUpdate, isReadingMode }: MangaSourcesProps) {
  const [opened, { open, close }] = useDisclosure(false);
  const [isAdding, setIsAdding] = useState(false);

  const utils = trpc.useContext();
  const removeMutation = trpc.manga.removeSource.useMutation();
  const updatePriorityMutation = trpc.manga.updateSourcePriority.useMutation();
  const addSourceMutation = trpc.manga.addSource.useMutation();

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const newSources = [...manga.sources].sort((a, b) => a.priority - b.priority);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newSources.length) return;

    const [movedItem] = newSources.splice(index, 1);
    newSources.splice(targetIndex, 0, movedItem!);

    const sourcePriorities = newSources.map((s, i) => ({
      id: s.id,
      priority: i,
    }));

    try {
      await updatePriorityMutation.mutateAsync({
        mangaId: manga.id,
        sourcePriorities,
      });
      onUpdate();
    } catch (err) {
      showNotification({
        title: 'Error',
        message: 'Failed to update priority',
        color: 'red',
        icon: <IconX size={18} />,
      });
    }
  };

  const handleRemove = async (id: number) => {
    try {
      await removeMutation.mutateAsync({ id });
      onUpdate();
    } catch (err) {
      showNotification({
        title: 'Error',
        message: 'Failed to remove source',
        color: 'red',
        icon: <IconX size={18} />,
      });
    }
  };

  const handleAddSource = async (selected: { source: string; title: string }) => {
    setIsAdding(true);
    try {
      await addSourceMutation.mutateAsync({
        mangaId: manga.id,
        source: selected.source,
        title: selected.title,
      });
      showNotification({
        title: 'Success',
        message: `Added ${selected.source} as a new source`,
        color: 'teal',
      });
      close();
      onUpdate();
    } catch (err: unknown) {
      showNotification({
        title: 'Error',
        message: err instanceof Error ? err.message : 'Failed to add source',
        color: 'red',
        icon: <IconX size={18} />,
      });
    } finally {
      setIsAdding(false);
    }
  };

  const syncMutation = trpc.manga.sync.useMutation();

  const handleSync = async () => {
    try {
      await syncMutation.mutateAsync({ id: manga.id });
      showNotification({
        title: 'Sync Started',
        message: 'A check for new chapters has been queued.',
        color: 'teal',
        icon: <IconCheck size={18} />,
      });
    } catch (err) {
      showNotification({
        title: 'Error',
        message: 'Failed to start synchronization',
        color: 'red',
        icon: <IconX size={18} />,
      });
    }
  };

  const sortedSources = manga.sources ? [...manga.sources].sort((a, b) => a.priority - b.priority) : [];

  return (
    <Box sx={{ marginTop: 20, paddingBottom: 20 }}>
      <Group position="apart" mb="xs">
        <Group spacing="xs">
          <Title order={4}>Configure Sources</Title>
          <Badge size="xs" variant="outline">
            {sortedSources.length} sources
          </Badge>
        </Group>
        {!isReadingMode && (
          <Group spacing="xs">
            <Button
              variant="light"
              size="xs"
              leftIcon={<IconRefresh size={14} />}
              onClick={handleSync}
              loading={syncMutation.isLoading}
              color="teal"
            >
              Sync Now
            </Button>
            <Button size="xs" leftIcon={<IconPlus size={14} />} onClick={open} variant="light">
              Add Source
            </Button>
          </Group>
        )}
      </Group>
      <Divider mb="sm" />

      {sortedSources.length === 0 ? (
        <Box
          sx={(theme) => ({
            padding: theme.spacing.sm,
            backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[0],
            borderRadius: theme.radius.sm,
            border: `1px dashed ${theme.colors.gray[4]}`,
          })}
        >
          <Text size="sm" color="dimmed" italic>
            No dedicated sources configured yet. Using legacy source: <b>{manga.source}</b>
          </Text>
          <Text size="xs" color="dimmed" mt={5}>
            Add a source below to enable multi-source fallback.
          </Text>
        </Box>
      ) : (
        <Table verticalSpacing="xs">
          <thead>
            <tr>
              <th style={{ width: 100 }}>Priority</th>
              <th>Source</th>
              <th>Title in Source</th>
              <th style={{ width: 120 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedSources.map((source, index) => (
              <tr key={source.id}>
                <td>
                  <Group spacing={4}>
                    {!isReadingMode && (
                      <ActionIcon size="sm" disabled={index === 0} onClick={() => handleMove(index, 'up')}>
                        <IconArrowUp size={14} />
                      </ActionIcon>
                    )}
                    {!isReadingMode && (
                      <ActionIcon
                        size="sm"
                        disabled={index === sortedSources.length - 1}
                        onClick={() => handleMove(index, 'down')}
                      >
                        <IconArrowDown size={14} />
                      </ActionIcon>
                    )}
                    <Badge size="xs" variant="outline" ml={5}>
                      #{index + 1}
                    </Badge>
                  </Group>
                </td>
                <td>
                  <Badge
                    sx={{
                      backgroundColor: stc(source.source),
                      color: contrastColor({ bgColor: stc(source.source) }),
                    }}
                  >
                    {source.source}
                  </Badge>
                </td>
                <td>
                  <Text size="sm" weight={500}>
                    {source.title}
                  </Text>
                </td>
                <td>
                  {!isReadingMode && (
                    <Group spacing={8}>
                      <Tooltip label="Remove Source">
                        <ActionIcon
                          color="red"
                          variant="light"
                          onClick={() => handleRemove(source.id)}
                          disabled={sortedSources.length <= 1}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Modal opened={opened} onClose={close} title="Add New Source" size="lg" overlayBlur={3}>
        <Box sx={{ minHeight: 400 }}>
          <Text size="sm" mb="md">
            Search for the manga in another source to add it as a fallback.
          </Text>
          <SearchStep
            initialTitle={manga.title}
            form={
              {
                values: { source: ['all'], query: manga.title, mangaTitle: '' },
                setFieldValue: (field: string, value: any) => {
                  // Mock
                },
                getInputProps: (field: string) => ({
                  value: String(manga.title || ''),
                  onChange: () => {},
                }),
                isValid: () => true,
                validateField: () => {},
              } as any
            }
            onSelect={(selected) => {
              handleAddSource({
                source: selected.source,
                title: selected.title,
              });
            }}
          />
        </Box>
      </Modal>
    </Box>
  );
}
