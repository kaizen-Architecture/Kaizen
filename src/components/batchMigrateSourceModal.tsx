import React, { useState, useEffect } from 'react';
import {
  Modal,
  Button,
  Group,
  Stack,
  Text,
  Select,
  Checkbox,
  ScrollArea,
  Badge,
  Paper,
  Alert,
  Switch,
  Divider,
  ThemeIcon,
  Table,
  TextInput,
  LoadingOverlay,
} from '@mantine/core';
import {
  IconArrowsExchange,
  IconCheck,
  IconAlertTriangle,
  IconX,
  IconSearch,
} from '@tabler/icons-react';
import { useTranslation } from 'next-i18next';
import { trpc } from '../utils/trpc';

interface MangaItem {
  id: number;
  title: string;
  source: string;
  isSourceMissing?: boolean;
  isSourceFailed?: boolean;
  isOrphaned?: boolean;
}

interface BatchMigrateSourceModalProps {
  opened: boolean;
  onClose: () => void;
  mangas: MangaItem[];
  onSuccess: () => void;
}

interface MigrationResultItem {
  id: number;
  title: string;
  success: boolean;
  matchedTitle?: string;
  chaptersCount?: number;
  reason?: string;
}

export function BatchMigrateSourceModal({
  opened,
  onClose,
  mangas,
  onSuccess,
}: BatchMigrateSourceModalProps) {
  const { t } = useTranslation(['common', 'sources', 'library']);
  const [targetSource, setTargetSource] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [removeOldSources, setRemoveOldSources] = useState<boolean>(true);
  const [filterSearch, setFilterSearch] = useState<string>('');

  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<{
    total: number;
    successCount: number;
    failedCount: number;
    items: MigrationResultItem[];
  } | null>(null);

  const sourcesQuery = trpc.sources.list.useQuery(undefined, { enabled: opened });
  const batchMigrateMutation = trpc.manga.batchMigrateSource.useMutation();

  const activeSources = (sourcesQuery.data || [])
    .filter((s) => s.isActive && !s.isFailed)
    .map((s) => ({ value: s.name, label: s.name }));

  useEffect(() => {
    if (opened) {
      setSelectedIds(mangas.map((m) => m.id));
      setResults(null);
      setIsRunning(false);
    }
  }, [opened, mangas]);

  const filteredMangas = mangas.filter((m) =>
    m.title.toLowerCase().includes(filterSearch.toLowerCase()),
  );

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const idsToAdd = filteredMangas.map((m) => m.id);
      setSelectedIds((prev) => Array.from(new Set([...prev, ...idsToAdd])));
    } else {
      const idsToRemove = new Set(filteredMangas.map((m) => m.id));
      setSelectedIds((prev) => prev.filter((id) => !idsToRemove.has(id)));
    }
  };

  const handleToggleOne = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleMigrate = async () => {
    if (!targetSource || selectedIds.length === 0) return;
    setIsRunning(true);
    setResults(null);

    try {
      const res = await batchMigrateMutation.mutateAsync({
        mangaIds: selectedIds,
        targetSource,
        removeOldSources,
      });

      setResults({
        total: res.total,
        successCount: res.successCount,
        failedCount: res.failedCount,
        items: res.results,
      });
    } catch (err: any) {
      setResults({
        total: selectedIds.length,
        successCount: 0,
        failedCount: selectedIds.length,
        items: selectedIds.map((id) => {
          const m = mangas.find((item) => item.id === id);
          return {
            id,
            title: m?.title || String(id),
            success: false,
            reason: err?.message || 'Error general en la migración',
          };
        }),
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleFinish = () => {
    onSuccess();
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={() => {
        if (!isRunning) onClose();
      }}
      title={
        <Group spacing="xs">
          <ThemeIcon color="orange" variant="light" size="lg" radius="md">
            <IconArrowsExchange size={20} />
          </ThemeIcon>
          <div>
            <Text weight={700} size="md">
              {t('common:common.batchMigrateTitle', 'Migrar Mangas en Lote a otra Fuente')}
            </Text>
            <Text size="xs" color="dimmed">
              {t(
                'common:common.batchMigrateSubtitle',
                'Reasigna mangas huérfanos o sin fuente buscando automáticamente en el nuevo scraper.',
              )}
            </Text>
          </div>
        </Group>
      }
      size="xl"
      radius="md"
      styles={{
        body: {
          maxHeight: 'calc(100vh - 120px)',
          overflowY: 'auto',
        },
      }}
    >
      <Stack spacing="md" sx={{ position: 'relative' }}>
        <LoadingOverlay visible={isRunning} overlayBlur={2} />

        {results ? (
          <Stack spacing="md">
            <Alert
              icon={results.failedCount === 0 ? <IconCheck size={18} /> : <IconAlertTriangle size={18} />}
              title={
                results.failedCount === 0
                  ? t('common:common.migrationSuccessTitle', '¡Migración completada con éxito!')
                  : t('common:common.migrationPartialTitle', 'Migración finalizada con advertencias')
              }
              color={results.failedCount === 0 ? 'teal' : 'yellow'}
              variant="light"
            >
              <Text size="sm">
                Se han migrado <b>{results.successCount}</b> de <b>{results.total}</b> mangas a la fuente{' '}
                <b>{targetSource}</b>.
                {results.failedCount > 0 && (
                  <span>
                    {' '}
                    Los <b>{results.failedCount}</b> restantes no pudieron vincularse automáticamente y requerirán
                    asociación manual.
                  </span>
                )}
              </Text>
            </Alert>

            <Paper withBorder p={0} radius="md" sx={{ overflow: 'hidden' }}>
              <ScrollArea
                style={{ height: 340 }}
                type="always"
                offsetScrollbars
                styles={{
                  viewport: {
                    maxHeight: 340,
                    overflowY: 'auto',
                  },
                }}
              >
                <Table verticalSpacing="xs" highlightOnHover>
                  <thead>
                    <tr>
                      <th>{t('common:common.manga', 'Manga')}</th>
                      <th>{t('common:common.status', 'Estado')}</th>
                      <th>{t('common:common.details', 'Detalles')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.items.map((item) => (
                      <tr key={item.id}>
                        <td style={{ fontWeight: 500, maxWidth: 220 }}>
                          <Text lineClamp={1}>{item.title}</Text>
                        </td>
                        <td>
                          {item.success ? (
                            <Badge color="green" variant="filled" size="sm" leftSection={<IconCheck size={12} />}>
                              Migrado
                            </Badge>
                          ) : (
                            <Badge color="red" variant="filled" size="sm" leftSection={<IconX size={12} />}>
                              No encontrado
                            </Badge>
                          )}
                        </td>
                        <td>
                          {item.success ? (
                            <Text size="xs" color="dimmed">
                              Coincidencia: <b>{item.matchedTitle}</b> ({item.chaptersCount || 0} capítulos)
                            </Text>
                          ) : (
                            <Text size="xs" color="red">
                              {item.reason}
                            </Text>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </ScrollArea>
            </Paper>

            <Group position="right">
              <Button color="teal" onClick={handleFinish}>
                {t('common:common.acceptAndRefresh', 'Aceptar y actualizar biblioteca')}
              </Button>
            </Group>
          </Stack>
        ) : (
          <Stack spacing="md">
            <Group grow align="flex-start">
              <Select
                label={t('common:common.targetSource', 'Fuente de destino')}
                placeholder={t('common:common.selectTargetSource', 'Selecciona la fuente')}
                data={activeSources}
                value={targetSource}
                onChange={setTargetSource}
                searchable
                nothingFound="No hay fuentes activas disponibles"
                required
              />
            </Group>

            <Switch
              label={t(
                'common:common.removeOldSourcesDesc',
                'Eliminar fuentes antiguas fallidas/eliminadas para que esta sea la única fuente',
              )}
              checked={removeOldSources}
              onChange={(e) => setRemoveOldSources(e.currentTarget.checked)}
              size="sm"
            />

            <Divider my="xs" />

            <Group position="apart">
              <Checkbox
                label={`Seleccionar todos (${selectedIds.length}/${filteredMangas.length})`}
                checked={selectedIds.length === filteredMangas.length && filteredMangas.length > 0}
                indeterminate={selectedIds.length > 0 && selectedIds.length < filteredMangas.length}
                onChange={(e) => handleSelectAll(e.currentTarget.checked)}
              />
              <TextInput
                size="xs"
                placeholder={t('common:common.searchPlaceholder', 'Filtrar por título...') as string}
                icon={<IconSearch size={14} />}
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.currentTarget.value)}
                sx={{ width: 220 }}
              />
            </Group>

            <Paper withBorder p={0} radius="md" sx={{ overflow: 'hidden' }}>
              <ScrollArea
                style={{ height: 380 }}
                type="always"
                offsetScrollbars
                styles={{
                  viewport: {
                    maxHeight: 380,
                    overflowY: 'auto',
                  },
                }}
              >
                <Table verticalSpacing="xs" highlightOnHover>
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}></th>
                      <th>{t('common:common.manga', 'Manga')}</th>
                      <th>{t('common:common.currentSource', 'Fuente actual')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMangas.map((manga) => {
                      const isSelected = selectedIds.includes(manga.id);
                      return (
                        <tr
                          key={manga.id}
                          style={{ cursor: 'pointer' }}
                          onClick={() => handleToggleOne(manga.id)}
                        >
                          <td>
                            <Checkbox
                              checked={isSelected}
                              onChange={() => {}} // handled by row click
                            />
                          </td>
                          <td style={{ fontWeight: 500 }}>
                            <Text size="sm">{manga.title}</Text>
                          </td>
                          <td>
                            {manga.source === 'NONE' ? (
                              <Badge color="orange" size="xs">
                                Sin Fuente
                              </Badge>
                            ) : manga.isSourceMissing ? (
                              <Badge color="red" size="xs">
                                Eliminada: {manga.source}
                              </Badge>
                            ) : manga.isSourceFailed ? (
                              <Badge color="red" size="xs">
                                Fallida: {manga.source}
                              </Badge>
                            ) : (
                              <Badge color="gray" size="xs">
                                {manga.source}
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </ScrollArea>
            </Paper>

            <Group position="apart" mt="md">
              <Button variant="default" onClick={onClose} disabled={isRunning}>
                {t('common:common.cancel', 'Cancelar')}
              </Button>
              <Button
                color="teal"
                onClick={handleMigrate}
                loading={isRunning}
                disabled={!targetSource || selectedIds.length === 0}
                leftIcon={<IconArrowsExchange size={16} />}
              >
                {t('common:common.migrateActionBtn', {
                  count: selectedIds.length,
                  source: targetSource || '...',
                  defaultValue: `Migrar ${selectedIds.length} mangas a ${targetSource || '...'}`,
                })}
              </Button>
            </Group>
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}
