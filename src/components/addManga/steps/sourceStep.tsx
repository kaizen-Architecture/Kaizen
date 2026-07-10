import {
  ActionIcon,
  Box,
  Button,
  Group,
  LoadingOverlay,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { UseFormReturnType } from '@mantine/form';
import { IconCheck, IconSearch, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { trpc } from '../../../utils/trpc';
import type { FormType } from '../form';

export function SourceStep({ form }: { form: UseFormReturnType<FormType> }) {
  const { t } = useTranslation(['common']);
  const query = trpc.manga.sources.useQuery(undefined, {
    staleTime: Infinity,
  });

  const [searchFilter, setSearchFilter] = useState('');

  if (query.isLoading) {
    return <LoadingOverlay visible />;
  }

  const sources = query.data || [];
  const selectedSources = form.values.source || [];
  const isAllSelected = selectedSources.includes('all');

  const filteredSources = sources.filter((s) => s.toLowerCase().includes(searchFilter.toLowerCase()));

  const toggleSource = (source: string) => {
    const current = form.values.source;
    if (source === 'all') {
      form.setFieldValue('source', ['all']);
      return;
    }

    const filtered = current.filter((s) => s !== 'all');
    if (filtered.includes(source)) {
      const next = filtered.filter((s) => s !== source);
      form.setFieldValue('source', next.length === 0 ? ['all'] : next);
    } else {
      form.setFieldValue('source', [...filtered, source]);
    }
  };

  const selectAll = () => {
    form.setFieldValue('source', sources);
  };

  const clearAll = () => {
    form.setFieldValue('source', ['all']);
  };

  return (
    <Stack spacing="md">
      <Group position="apart" align="flex-end">
        <Box>
          <Text size="sm" weight={600}>
            {t('common:addManga.source.title', 'Select Search Sources')}
          </Text>
          <Text size="xs" color="dimmed">
            {t('common:addManga.source.description', 'Choose one or multiple sources to track the new manga.')}
          </Text>
        </Box>
        <Group spacing="xs">
          <Button size="xs" variant="light" color="indigo" onClick={selectAll}>
            {t('common:addManga.source.selectAll', 'Select All')}
          </Button>
          <Button size="xs" variant="subtle" color="gray" onClick={clearAll}>
            {t('common:addManga.source.reset', 'Reset')}
          </Button>
        </Group>
      </Group>

      <TextInput
        placeholder={t('common:addManga.source.filterPlaceholder', 'Filter sources by name...') as string}
        size="xs"
        icon={<IconSearch size={14} />}
        value={searchFilter}
        onChange={(e) => setSearchFilter(e.currentTarget.value)}
        rightSection={
          searchFilter ? (
            <ActionIcon size="xs" onClick={() => setSearchFilter('')}>
              <IconX size={12} />
            </ActionIcon>
          ) : null
        }
      />

      <Paper
        withBorder
        p="xs"
        radius="md"
        sx={(theme) => ({
          backgroundColor: theme.colorScheme === 'dark' ? 'rgba(0,0,0,0.15)' : 'rgba(248, 250, 252, 0.5)',
        })}
      >
        <ScrollArea sx={{ height: 240 }} offsetScrollbars>
          <Stack spacing="xs" pb="xs">
            {/* Opción Todos */}
            {!searchFilter && (
              <UnstyledButton
                onClick={() => toggleSource('all')}
                sx={(theme) => ({
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: theme.radius.sm,
                  border: `1px solid ${
                    isAllSelected
                      ? theme.colors.indigo[5]
                      : theme.colorScheme === 'dark'
                      ? theme.colors.dark[6]
                      : theme.colors.gray[2]
                  }`,
                  backgroundColor: isAllSelected
                    ? theme.colorScheme === 'dark'
                      ? 'rgba(99, 102, 241, 0.15)'
                      : theme.colors.indigo[0]
                    : theme.colorScheme === 'dark'
                    ? theme.colors.dark[7]
                    : theme.white,
                  transition: 'all 0.15s ease',
                  '&:hover': {
                    borderColor: theme.colors.indigo[4],
                  },
                })}
              >
                <Text size="xs" weight={isAllSelected ? 600 : 500} color={isAllSelected ? 'indigo' : undefined}>
                  {t('common:addManga.source.globalSearch', '🌐 Global Search in All Sources')}
                </Text>
                {isAllSelected && <IconCheck size={14} style={{ color: '#6366F1' }} />}
              </UnstyledButton>
            )}

            {/* Listado de Fuentes en Grid Moderno */}
            <SimpleGrid
              cols={3}
              spacing="xs"
              breakpoints={[
                { maxWidth: 600, cols: 2 },
                { maxWidth: 400, cols: 1 },
              ]}
            >
              {filteredSources.map((s) => {
                const isSelected = selectedSources.includes(s);
                return (
                  <UnstyledButton
                    key={s}
                    onClick={() => toggleSource(s)}
                    sx={(theme) => ({
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: theme.radius.sm,
                      border: `1px solid ${
                        isSelected
                          ? theme.colors.indigo[5]
                          : theme.colorScheme === 'dark'
                          ? theme.colors.dark[6]
                          : theme.colors.gray[2]
                      }`,
                      backgroundColor: isSelected
                        ? theme.colorScheme === 'dark'
                          ? 'rgba(99, 102, 241, 0.15)'
                          : theme.colors.indigo[0]
                        : theme.colorScheme === 'dark'
                        ? theme.colors.dark[7]
                        : theme.white,
                      transition: 'all 0.15s ease',
                      '&:hover': {
                        borderColor: theme.colors.indigo[4],
                        transform: 'translateY(-1px)',
                      },
                    })}
                  >
                    <Text
                      size="xs"
                      weight={isSelected ? 600 : 500}
                      color={isSelected ? 'indigo' : undefined}
                      sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {s}
                    </Text>
                    {isSelected && <IconCheck size={14} style={{ color: '#6366F1', flexShrink: 0 }} />}
                  </UnstyledButton>
                );
              })}
            </SimpleGrid>

            {filteredSources.length === 0 && (
              <Text size="xs" color="dimmed" align="center" py="xl">
                {t('common:addManga.source.noSourcesFound', 'No sources found matching the search.')}
              </Text>
            )}
          </Stack>
        </ScrollArea>
      </Paper>

      {selectedSources.length > 0 && (
        <Text size="xs" color="dimmed" sx={{ wordBreak: 'break-word', lineHeight: 1.4 }}>
          <b>{t('common:addManga.source.configuredSources', 'Configured sources')}</b>:{' '}
          {isAllSelected
            ? t('common:addManga.source.allSourcesAvailable', 'All available sources')
            : selectedSources.length > 5
            ? t('common:addManga.source.activeSourcesSelected', {
                count: selectedSources.length,
                defaultValue: `${selectedSources.length} active sources selected`,
              })
            : selectedSources.join(', ')}
        </Text>
      )}
    </Stack>
  );
}
