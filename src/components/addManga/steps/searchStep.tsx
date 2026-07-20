/* eslint-disable react/require-default-props */
import {
  ActionIcon,
  Badge,
  Box,
  Group,
  LoadingOverlay,
  Loader,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { getHotkeyHandler } from '@mantine/hooks';
import { IconArrowRight, IconCheck, IconSearch, IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { trpc } from '../../../utils/trpc';
import { MangaSearchResult } from '../mangaSearchResult';

export interface SearchStepForm {
  values: {
    source: string[];
    query: string;
    mangaTitle: string;
  };
  setFieldValue: (path: string, value: any) => void;
  validateField: (path: string) => void;
  getInputProps: (path: string) => any;
  isValid: (path?: string) => boolean;
}

export function SearchStep({
  form,
  onSelect,
  initialTitle,
}: {
  form: SearchStepForm;
  onSelect?: (selected: { title: string; source: string }) => void;
  initialTitle?: string;
}) {
  const { t } = useTranslation(['common']);
  const ctx = trpc.useContext();
  type SearchResult = Awaited<ReturnType<typeof ctx.manga.search.fetch>>;

  const [loading, setLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult>([]);
  const [isEmptyResult, setIsEmptyResult] = useState(false);

  const sourcesQuery = trpc.manga.sources.useQuery(undefined, {
    staleTime: Infinity,
  });

  const [selectedSources, setSelectedSources] = useState<string[]>(form.values.source || ['all']);
  const [sourceStatuses, setSourceStatuses] = useState<
    Record<string, { status: 'idle' | 'searching' | 'done' | 'error'; count: number }>
  >({});

  useEffect(() => {
    if (form.values.source) {
      setSelectedSources(form.values.source);
    }
  }, [form.values.source]);

  useEffect(() => {
    if (initialTitle && initialTitle !== '') {
      form.setFieldValue('query', initialTitle);
      setTimeout(() => {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        handleSearch(initialTitle);
      }, 500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTitle]);

  const searchIdRef = useState<{ current: number }>({ current: 0 })[0];

  const handleSearch = async (overrideQuery?: string) => {
    const rawQuery = overrideQuery || form.values.query;
    const queryToSearch = typeof rawQuery === 'string' ? rawQuery : String(rawQuery || '');

    if (!queryToSearch || queryToSearch.trim() === '') {
      form.validateField('query');
      return;
    }

    // Increment search sequence ID to cancel/ignore previous in-flight responses
    searchIdRef.current += 1;
    const currentSearchId = searchIdRef.current;

    form.setFieldValue('mangaTitle', '');
    setLoading(true);
    setSearchResult([]);
    setIsEmptyResult(false);

    let actualSources = selectedSources;
    if (selectedSources.includes('all')) {
      actualSources = sourcesQuery.data || [];
    }

    const newStatuses: typeof sourceStatuses = {};
    actualSources.forEach((s) => {
      newStatuses[s] = { status: 'searching', count: 0 };
    });
    setSourceStatuses(newStatuses);

    const searchPromises = actualSources.map(async (s) => {
      try {
        const result = await ctx.manga.search.fetch({
          keyword: queryToSearch,
          source: [s],
        });

        // Ignore if a newer search was initiated
        if (searchIdRef.current !== currentSearchId) return;

        setSourceStatuses((prev) => ({
          ...prev,
          [s]: { status: 'done', count: result.length },
        }));

        if (result && result.length > 0) {
          setSearchResult((prev) => {
            const combined = [...prev, ...result];
            return combined.filter((v, i, a) => a.findIndex((x) => x.title === v.title && x.source === v.source) === i);
          });
        }
      } catch (err) {
        if (searchIdRef.current !== currentSearchId) return;
        setSourceStatuses((prev) => ({
          ...prev,
          [s]: { status: 'error', count: 0 },
        }));
      }
    });

    await Promise.all(searchPromises);

    if (searchIdRef.current === currentSearchId) {
      setLoading(false);
      setSearchResult((prev) => {
        if (prev.length === 0) setIsEmptyResult(true);
        return prev;
      });
    }
  };

  const isAllSelected = selectedSources.includes('all');

  return (
    <Stack spacing="md">
      {/* Banner resumen de orígenes con diseño compacto premium */}
      <Box
        p="xs"
        sx={(theme) => ({
          backgroundColor: theme.colorScheme === 'dark' ? 'rgba(99, 102, 241, 0.05)' : 'rgba(99, 102, 241, 0.05)',
          borderRadius: theme.radius.md,
          border: `1px solid ${theme.colorScheme === 'dark' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.2)'}`,
        })}
      >
        <Group position="apart" align="center" mb={4}>
          <Text size="xs" weight={600} color="indigo">
            {t('common:addManga.search.activeSources', '🎯 Active search sources')}
          </Text>
          <Text size="xs" color="dimmed" sx={{ fontSize: 10 }}>
            {isAllSelected
              ? t('common:addManga.source.globalSearch', 'Global Search')
              : t('common:addManga.steps.activeSourcesCount', {
                  count: selectedSources.length,
                  defaultValue: `${selectedSources.length} sources`,
                })}
          </Text>
        </Group>

        <ScrollArea sx={{ maxHeight: 65 }} offsetScrollbars>
          <Group spacing={6}>
            {isAllSelected ? (
              <Badge color="indigo" variant="light" size="xs">
                {t('common:addManga.source.allSourcesAvailable', 'All available sources')}
              </Badge>
            ) : (
              selectedSources.map((s) => (
                <Badge key={s} color="indigo" variant="outline" size="xs" sx={{ textTransform: 'none' }}>
                  {s}
                </Badge>
              ))
            )}
          </Group>
        </ScrollArea>
      </Box>

      {/* Input de Búsqueda Premium */}
      <TextInput
        data-autofocus
        size="md"
        radius="xl"
        onKeyDown={getHotkeyHandler([['Enter', () => handleSearch()]])}
        icon={<IconSearch size={18} strokeWidth={1.5} />}
        rightSection={
          <ActionIcon
            size={32}
            radius="xl"
            color="indigo"
            variant="filled"
            aria-label="Search"
            onClick={() => handleSearch()}
            sx={{ transition: 'transform 0.1s ease', '&:active': { transform: 'scale(0.95)' } }}
          >
            <IconArrowRight size={18} strokeWidth={1.5} />
          </ActionIcon>
        }
        rightSectionWidth={42}
        label={t('common:addManga.search.label', 'Manga search term')}
        placeholder={t('common:addManga.search.placeholder', 'Type the title (e.g. Bleach, One Piece...)')}
        {...form.getInputProps('query')}
        defaultValue={initialTitle}
        sx={{
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
      />

      {/* Riel de Estado de Búsqueda Clampeado para evitar deformación */}
      {Object.keys(sourceStatuses).length > 0 && (
        <Box>
          <Text size="xs" weight={500} color="dimmed" mb={4}>
            {t('common:addManga.search.progress', 'Progress per source:')}
          </Text>
          <ScrollArea sx={{ maxHeight: 90 }} offsetScrollbars>
            <Group spacing={6} pb={4}>
              {Object.entries(sourceStatuses).map(([s, status]) => (
                <Badge
                  key={s}
                  variant="dot"
                  size="xs"
                  sx={{ textTransform: 'none' }}
                  color={
                    status.status === 'searching'
                      ? 'indigo'
                      : status.status === 'error'
                      ? 'red'
                      : status.count > 0
                      ? 'teal'
                      : 'gray'
                  }
                  leftSection={
                    status.status === 'searching' ? (
                      <Loader size={8} />
                    ) : status.status === 'error' ? (
                      <IconX size={8} />
                    ) : status.count > 0 ? (
                      <IconCheck size={8} />
                    ) : null
                  }
                >
                  {s} {status.status === 'done' ? `(${status.count})` : ''}
                </Badge>
              ))}
            </Group>
          </ScrollArea>
        </Box>
      )}

      <TextInput hidden {...form.getInputProps('mangaTitle')} />

      {isEmptyResult ? (
        <Text color="red" align="center" mt="xl" size="sm" weight={500}>
          {t('common:addManga.search.noResults', 'No results found in the selected sources.')}
        </Text>
      ) : (
        <Box sx={{ position: 'relative', minHeight: searchResult.length > 0 ? 200 : undefined }}>
          <LoadingOverlay visible={loading && searchResult.length === 0} overlayBlur={1} />
          <MangaSearchResult
            items={searchResult}
            onSelect={(selected) => {
              if (selected) {
                form.setFieldValue('mangaTitle', selected.title);
                form.setFieldValue('source', [selected.source]);
                if (onSelect) {
                  onSelect(selected);
                }
              } else {
                form.setFieldValue('mangaTitle', '');
              }
            }}
            onMultiSelect={(selectedList) => {
              form.setFieldValue(
                'selectedResults',
                selectedList.map((s) => ({ source: s.source, title: s.title })),
              );
            }}
          />
        </Box>
      )}
    </Stack>
  );
}
