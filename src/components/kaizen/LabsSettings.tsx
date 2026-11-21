import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Divider,
  Grid,
  Group,
  Loader,
  Paper,
  Progress,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconArrowsLeftRight,
  IconCheck,
  IconFlask,
  IconRefresh,
  IconSearch,
  IconShieldCheck,
  IconSparkles,
} from '@tabler/icons-react';
import { useTranslation } from 'next-i18next';
import { useMemo, useState } from 'react';
import { trpc } from '../../utils/trpc';

type CoreFilter = 'all' | 'mangal' | 'kaizen-mangal';

export function LabsSettings() {
  const { t } = useTranslation('settings');
  const utils = trpc.useContext();

  const statusQuery = trpc.labs.getStatus.useQuery();
  const mangasQuery = trpc.labs.listMangas.useQuery();

  const [coreFilter, setCoreFilter] = useState<CoreFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const refreshAll = async () => {
    await Promise.all([
      utils.labs.getStatus.invalidate(),
      utils.labs.listMangas.invalidate(),
      utils.settings.query.invalidate(),
    ]);
  };

  const setDefaultCoreMutation = trpc.labs.setDefaultCore.useMutation({
    onSuccess: async (data) => {
      showNotification({
        title: t('labs.defaultUpdatedTitle', 'Default Core Updated'),
        message: t('labs.defaultUpdatedDesc', {
          core: data.defaultScraperCore,
          defaultValue: `New manga and global searches will now use ${data.defaultScraperCore}.`,
        }),
        color: 'teal',
        icon: <IconCheck size={16} />,
      });
      await refreshAll();
    },
  });

  const assignCoreMutation = trpc.labs.assignCore.useMutation({
    onSuccess: async (data, variables) => {
      setSelectedIds([]);
      showNotification({
        title: t('labs.assignedTitle', 'Core Assignment Updated'),
        message: t('labs.assignedDesc', {
          count: data.updated,
          core: variables.core,
          defaultValue: `Moved ${data.updated} manga(s) to ${variables.core}.`,
        }),
        color: 'teal',
        icon: <IconCheck size={16} />,
      });
      await refreshAll();
    },
  });

  const scanReleasingMutation = trpc.manga.scanReleasingBetterSources.useMutation();
  const checkCoreUpdatesMutation = trpc.labs.checkCoreUpdates.useMutation({
    onSuccess: async () => {
      await refreshAll();
    },
  });
  const switchPrimarySourceMutation = trpc.manga.switchMangaPrimarySource.useMutation({
    onSuccess: async () => {
      showNotification({
        title: 'Source Switched',
        message: 'Primary source updated to the better source.',
        color: 'teal',
        icon: <IconCheck size={16} />,
      });
      await refreshAll();
    },
  });

  const mangas = mangasQuery.data || [];
  const status = statusQuery.data;

  const sourcesList = useMemo(() => {
    const counts = new Map<string, { total: number; km: number }>();
    for (const m of mangas) {
      const curr = counts.get(m.source) || { total: 0, km: 0 };
      curr.total += 1;
      if (m.scraperCore === 'kaizen-mangal') curr.km += 1;
      counts.set(m.source, curr);
    }
    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([src, c]) => ({
        value: src,
        label: `${src} (${c.km}/${c.total} kaizen-mangal)`,
      }));
  }, [mangas]);

  const filteredMangas = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return mangas.filter((m) => {
      if (coreFilter !== 'all' && m.scraperCore !== coreFilter) return false;
      if (sourceFilter !== 'all' && m.source !== sourceFilter) return false;
      if (q && !m.title.toLowerCase().includes(q) && !m.source.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [mangas, coreFilter, sourceFilter, searchQuery]);

  if (statusQuery.isLoading || mangasQuery.isLoading) {
    return (
      <Group position="center" py="xl">
        <Loader size="md" />
      </Group>
    );
  }

  const totalCount = status?.counts.total || 0;
  const kmCount = status?.counts.kaizenMangal || 0;
  const mangalCount = status?.counts.mangal || 0;
  const kmPercent = totalCount > 0 ? Math.round((kmCount / totalCount) * 100) : 0;

  const toggleSelectAllFiltered = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filteredMangas.map((m) => m.id));
    } else {
      setSelectedIds([]);
    }
  };

  const toggleSelectOne = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    } else {
      setSelectedIds((prev) => prev.filter((item) => item !== id));
    }
  };

  const doctor = status?.diagnostics.kaizenMangal.doctor;

  return (
    <Stack spacing="lg">
      <Alert icon={<IconFlask size={20} />} title={t('labs.bannerTitle', 'Kaizen Labs — Scraper Core Migration')} color="grape" radius="md">
        <Text size="sm">
          {t(
            'labs.bannerDesc',
            'Gradually migrate your library from legacy mangal (v4.0.6) to the new kaizen-mangal core. You can move a single manga, delete a chapter and re-download it to verify everything works before switching your entire library. Once all mangas are migrated, legacy mangal and this Labs tab will be retired.',
          )}
        </Text>
      </Alert>

      {/* Core Diagnostics Cards */}
      <SimpleGrid cols={2} breakpoints={[{ maxWidth: 'sm', cols: 1 }]} spacing="md">
        <Card withBorder radius="md" p="md">
          <Group position="apart" mb="xs">
            <Group spacing="xs">
              <Title order={5}>mangal (Legacy)</Title>
              <Badge color={status?.diagnostics.mangal.available ? 'blue' : 'red'} variant="light">
                {status?.diagnostics.mangal.available
                  ? `v${status.diagnostics.mangal.version || '4.0.6'}`
                  : t('labs.unavailable', 'Unavailable')}
              </Badge>
            </Group>
            <Badge color="gray" variant="outline">
              {mangalCount} {t('labs.mangasAssigned', 'mangas')}
            </Badge>
          </Group>
          <Text size="xs" color="dimmed">
            {t('labs.mangalDesc', 'Original metafates/mangal v4.0.6 binary. Kept for zero-risk instant rollback during Stage 2 migration.')}
          </Text>
        </Card>

        <Card withBorder radius="md" p="md">
          <Group position="apart" mb="xs">
            <Group spacing="xs">
              <Title order={5}>kaizen-mangal (New Core)</Title>
              <Badge color={status?.diagnostics.kaizenMangal.available ? 'teal' : 'red'} variant="light">
                {status?.diagnostics.kaizenMangal.available
                  ? `v${status.diagnostics.kaizenMangal.version || '1.1.0'}`
                  : t('labs.unavailable', 'Unavailable')}
              </Badge>
              {doctor && (
                <Badge color={doctor.ok ? 'green' : 'yellow'} variant="dot">
                  {doctor.ok ? 'Doctor OK' : 'Doctor Warning'}
                </Badge>
              )}
            </Group>
            <Badge color="teal" variant="filled">
              {kmCount} {t('labs.mangasAssigned', 'mangas')}
            </Badge>
          </Group>
          <Text size="xs" color="dimmed" mb="xs">
            {t(
              'labs.kaizenMangalDesc',
              'Resilient Go 1.27 core with TLS/H2 impersonation, persistent cookie jar, Cloudflare solver + circuit breaker, stealth headless browser, and magic-byte CBZ validation.',
            )}
          </Text>
          {doctor && (
            <Group spacing="xs">
              {doctor.tls_profile && (
                <Badge size="xs" variant="outline" color="indigo">
                  TLS: {doctor.tls_profile.resolved}
                </Badge>
              )}
              {doctor.browser && (
                <Badge size="xs" variant="outline" color={doctor.browser.available ? 'teal' : 'orange'}>
                  Headless: {doctor.browser.mode}
                </Badge>
              )}
              {doctor.solver && (
                <Badge size="xs" variant="outline" color={doctor.solver.configured ? 'cyan' : 'gray'}>
                  Solver: {doctor.solver.configured ? (doctor.solver.reachable ? 'Online' : 'Unreachable') : 'Off'}
                </Badge>
              )}
            </Group>
          )}
          {doctor?.warnings && doctor.warnings.length > 0 && (
            <Alert icon={<IconAlertTriangle size={16} />} color="yellow" mt="xs" p="xs" radius="sm">
              {doctor.warnings.map((w, idx) => (
                <Text key={idx} size="xs">
                  • {w}
                </Text>
              ))}
            </Alert>
          )}
        </Card>
      </SimpleGrid>

      {/* Progress & Default Core Selector */}
      <Paper withBorder p="md" radius="md">
        <Stack spacing="md">
          <Group position="apart">
            <div>
              <Text weight={600} size="sm">
                {t('labs.progressTitle', 'Library Migration Progress')}
              </Text>
              <Text size="xs" color="dimmed">
                {kmCount} / {totalCount} ({kmPercent}%) {t('labs.usingKaizenMangal', 'mangas using kaizen-mangal')}
              </Text>
            </div>
            <Group spacing="xs">
              <Button
                size="xs"
                variant="light"
                color="gray"
                leftIcon={<IconRefresh size={14} />}
                onClick={refreshAll}
              >
                {t('labs.refreshBtn', 'Refresh')}
              </Button>
              <Button
                size="xs"
                variant="outline"
                color="blue"
                disabled={mangalCount === totalCount || assignCoreMutation.isLoading}
                onClick={() => assignCoreMutation.mutate({ core: 'mangal', all: true })}
              >
                {t('labs.revertAllBtn', 'Revert All to mangal')}
              </Button>
              <Button
                size="xs"
                color="teal"
                disabled={kmCount === totalCount || assignCoreMutation.isLoading}
                onClick={() => assignCoreMutation.mutate({ core: 'kaizen-mangal', all: true })}
              >
                {t('labs.migrateAllBtn', 'Move All to kaizen-mangal')}
              </Button>
            </Group>
          </Group>

          <Progress value={kmPercent} color="teal" size="lg" radius="xl" striped={kmPercent > 0 && kmPercent < 100} />

          <Divider />

          <Group position="apart">
            <div>
              <Text weight={600} size="sm">
                {t('labs.defaultCoreLabel', 'Default Core for New Mangas & Global Search')}
              </Text>
              <Text size="xs" color="dimmed">
                {t(
                  'labs.defaultCoreDesc',
                  'Determines which binary is used when searching for new series, adding a new manga, or editing Mangal Core settings.',
                )}
              </Text>
            </div>
            <SegmentedControl
              value={status?.defaultScraperCore || 'kaizen-mangal'}
              disabled={setDefaultCoreMutation.isLoading}
              onChange={(val) => setDefaultCoreMutation.mutate({ core: val as 'mangal' | 'kaizen-mangal' })}
              data={[
                { label: 'mangal (v4.0.6)', value: 'mangal' },
                { label: `kaizen-mangal (v${status?.diagnostics.kaizenMangal.version || '1.2.0'})`, value: 'kaizen-mangal' },
              ]}
            />
          </Group>
        </Stack>
      </Paper>

      {/* Core Version & Kaizen Contract Compatibility Checker */}
      {(() => {
        const vc = checkCoreUpdatesMutation.data || status?.diagnostics.versionCheck;
        const alertColor =
          vc?.compatibilityStatus === 'contract_mismatch'
            ? 'red'
            : vc?.coreUpdateAvailable || vc?.kaizenUpdateAvailable
            ? 'blue'
            : 'teal';
        return (
          <Paper withBorder p="md" radius="md">
            <Stack spacing="xs">
              <Group position="apart">
                <Group spacing="xs">
                  <Title order={5}>Core Version & Kaizen Compatibility Check</Title>
                  <Badge color={alertColor} variant="light">
                    {vc?.compatibilityStatus === 'contract_mismatch'
                      ? 'Contract Update Required'
                      : vc?.coreUpdateAvailable
                      ? `Core Update Available (v${vc.latestCoreVersion})`
                      : 'Up to Date & Compatible'}
                  </Badge>
                  <Badge color="gray" variant="outline" size="sm">
                    Contract v{vc?.installedContractVersion ?? status?.diagnostics.kaizenMangal.contractVersion ?? 1}
                  </Badge>
                </Group>
                <Button
                  size="xs"
                  variant="light"
                  color="teal"
                  leftIcon={<IconRefresh size={14} />}
                  loading={checkCoreUpdatesMutation.isLoading}
                  onClick={() => checkCoreUpdatesMutation.mutate({ force: true })}
                >
                  Check Now
                </Button>
              </Group>
              <Text size="xs" color="dimmed">
                {vc?.compatibilityMessage ||
                  'Periodically checks GitHub Releases every 12h for new kaizen-mangal and Kaizen versions and verifies CLI contract compatibility.'}
              </Text>
              {vc && (
                <Group spacing="xs">
                  <Badge size="xs" variant="outline" color="teal">
                    Installed Core: v{vc.installedCoreVersion || 'unknown'}
                  </Badge>
                  <Badge size="xs" variant="outline" color={vc.coreUpdateAvailable ? 'blue' : 'gray'}>
                    Latest Core: v{vc.latestCoreVersion || vc.installedCoreVersion || 'unknown'}
                  </Badge>
                  <Badge size="xs" variant="outline" color="grape">
                    Installed Kaizen: v{vc.currentKaizenVersion}
                  </Badge>
                  <Badge size="xs" variant="outline" color={vc.kaizenUpdateAvailable ? 'blue' : 'gray'}>
                    Latest Kaizen: v{vc.latestKaizenVersion || vc.currentKaizenVersion}
                  </Badge>
                  <Badge size="xs" variant="outline" color={vc.contractCompatible ? 'green' : 'red'}>
                    {vc.contractCompatible ? 'Contract Compatible' : 'Update Kaizen Required'}
                  </Badge>
                </Group>
              )}
            </Stack>
          </Paper>
        );
      })()}

      {/* Built-in Provider Audit */}
      {status?.builtinAudit && status.builtinAudit.length > 0 ? (
        <Alert
          icon={<IconAlertTriangle size={18} />}
          color="orange"
          radius="md"
          title={t('labs.builtinAuditWarningTitle', {
            count: status.builtinAudit.length,
            defaultValue: `Built-in Provider Audit: ${status.builtinAudit.length} manga(s) use legacy built-in providers`,
          })}
        >
          <Text size="xs" mb="xs">
            {t(
              'labs.builtinAuditWarningDesc',
              'Mangadex, Manganato, Manganelo, and Mangapill built-in providers will be removed in Phase 8. Re-bind these series to your custom Lua sources before retiring legacy mangal:',
            )}
          </Text>
          <Group spacing="xs">
            {status.builtinAudit.map((item) => (
              <Badge key={item.id} color="orange" variant="outline">
                {item.title} ({item.sources.join(', ')})
              </Badge>
            ))}
          </Group>
        </Alert>
      ) : (
        <Alert
          icon={<IconShieldCheck size={18} />}
          color="teal"
          radius="md"
          title={t('labs.builtinAuditCleanTitle', 'Built-in Provider Audit Passed')}
        >
          <Text size="xs">
            {t(
              'labs.builtinAuditCleanDesc',
              '0 mangas are bound to legacy built-in providers (Mangadex, Manganato, Manganelo, Mangapill). All series use custom Lua scrapers.',
            )}
          </Text>
        </Alert>
      )}

      {/* Releasing Mangas Better Source Scanner */}
      <Paper withBorder p="md" radius="md">
        <Stack spacing="sm">
          <Group position="apart">
            <div>
              <Group spacing="xs">
                <Title order={5}>Better Source Advisor (Releasing Mangas)</Title>
                <Badge color="grape" variant="light">
                  NEW
                </Badge>
              </Group>
              <Text size="xs" color="dimmed">
                Scans your RELEASING mangas across active sources comparing real chapter numbers (ignoring split .1/.2 chapter inflation) and suggests sources with more chapters.
              </Text>
            </div>
            <Button
              size="xs"
              color="grape"
              leftIcon={<IconSparkles size={14} />}
              loading={scanReleasingMutation.isLoading}
              onClick={() => scanReleasingMutation.mutate({ limit: 15 })}
            >
              Scan Releasing Mangas
            </Button>
          </Group>

          {scanReleasingMutation.data && (
            <>
              <Divider />
              {scanReleasingMutation.data.recommendations.length === 0 ? (
                <Text size="xs" color="teal">
                  ✓ Scanned {scanReleasingMutation.data.scannedCount} releasing mangas — all are already on the most up-to-date source!
                </Text>
              ) : (
                <Table striped highlightOnHover verticalSpacing="xs">
                  <thead>
                    <tr>
                      <th>Manga</th>
                      <th>Current Source</th>
                      <th>Better Source</th>
                      <th>Gain</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scanReleasingMutation.data.recommendations.map((rec) => (
                      <tr key={rec.mangaId}>
                        <td>
                          <Text size="xs" weight={600}>
                            {rec.title}
                          </Text>
                        </td>
                        <td>
                          <Badge variant="outline" color="gray" size="sm">
                            {rec.currentSource} (Ch. {rec.currentMaxChapter})
                          </Badge>
                        </td>
                        <td>
                          <Badge color="teal" variant="light" size="sm">
                            {rec.bestSource} (Ch. {rec.bestMaxChapter})
                          </Badge>
                        </td>
                        <td>
                          <Badge color="teal" variant="filled" size="sm">
                            +{rec.delta} ch.
                          </Badge>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Button
                            size="xs"
                            color="teal"
                            loading={switchPrimarySourceMutation.isLoading}
                            onClick={() =>
                              switchPrimarySourceMutation.mutate({
                                mangaId: rec.mangaId,
                                newSource: rec.bestSource,
                                newSourceTitle: rec.bestMatchedTitle,
                              })
                            }
                          >
                            Switch to {rec.bestSource}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </>
          )}
        </Stack>
      </Paper>

      {/* Per-Source and Per-Manga Assignment Table */}
      <Paper withBorder p="md" radius="md">
        <Stack spacing="md">
          <Group position="apart">
            <Title order={5}>{t('labs.assignmentTitle', 'Per-Manga & Per-Source Core Assignment')}</Title>
            {selectedIds.length > 0 && (
              <Group spacing="xs">
                <Badge color="grape">{selectedIds.length} selected</Badge>
                <Button
                  size="xs"
                  variant="outline"
                  color="blue"
                  loading={assignCoreMutation.isLoading}
                  onClick={() => assignCoreMutation.mutate({ core: 'mangal', mangaIds: selectedIds })}
                >
                  {t('labs.moveSelectedToMangal', 'Move Selected to mangal')}
                </Button>
                <Button
                  size="xs"
                  color="teal"
                  loading={assignCoreMutation.isLoading}
                  onClick={() => assignCoreMutation.mutate({ core: 'kaizen-mangal', mangaIds: selectedIds })}
                >
                  {t('labs.moveSelectedToKaizen', 'Move Selected to kaizen-mangal')}
                </Button>
              </Group>
            )}
          </Group>

          <Grid align="flex-end">
            <Grid.Col xs={12} sm={4}>
              <TextInput
                icon={<IconSearch size={15} />}
                placeholder={t('labs.searchPlaceholder', 'Filter by manga title or source...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.currentTarget.value)}
              />
            </Grid.Col>
            <Grid.Col xs={12} sm={4}>
              <Select
                data={[{ value: 'all', label: t('labs.allSources', 'All Sources') }, ...sourcesList]}
                value={sourceFilter}
                onChange={(val) => setSourceFilter(val || 'all')}
              />
            </Grid.Col>
            <Grid.Col xs={12} sm={4}>
              <SegmentedControl
                fullWidth
                value={coreFilter}
                onChange={(val) => setCoreFilter(val as CoreFilter)}
                data={[
                  { label: `${t('labs.filterAll', 'All')} (${totalCount})`, value: 'all' },
                  { label: `mangal (${mangalCount})`, value: 'mangal' },
                  { label: `kaizen (${kmCount})`, value: 'kaizen-mangal' },
                ]}
              />
            </Grid.Col>
          </Grid>

          {sourceFilter !== 'all' && (
            <Group position="apart" p="xs" sx={(theme) => ({ backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[1], borderRadius: theme.radius.sm })}>
              <Text size="xs" weight={500}>
                {t('labs.sourceBatchLabel', { source: sourceFilter, defaultValue: `Batch action for source "${sourceFilter}":` })}
              </Text>
              <Group spacing="xs">
                <Button
                  size="xs"
                  variant="subtle"
                  color="blue"
                  loading={assignCoreMutation.isLoading}
                  onClick={() => assignCoreMutation.mutate({ core: 'mangal', source: sourceFilter })}
                >
                  {t('labs.moveSourceToMangal', { source: sourceFilter, defaultValue: `Set all ${sourceFilter} -> mangal` })}
                </Button>
                <Button
                  size="xs"
                  variant="light"
                  color="teal"
                  loading={assignCoreMutation.isLoading}
                  onClick={() => assignCoreMutation.mutate({ core: 'kaizen-mangal', source: sourceFilter })}
                >
                  {t('labs.moveSourceToKaizen', { source: sourceFilter, defaultValue: `Set all ${sourceFilter} -> kaizen-mangal` })}
                </Button>
              </Group>
            </Group>
          )}

          <Box sx={{ overflowX: 'auto' }}>
            <Table striped highlightOnHover verticalSpacing="xs">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <Checkbox
                      checked={filteredMangas.length > 0 && selectedIds.length === filteredMangas.length}
                      indeterminate={selectedIds.length > 0 && selectedIds.length < filteredMangas.length}
                      onChange={(e) => toggleSelectAllFiltered(e.currentTarget.checked)}
                    />
                  </th>
                  <th>{t('labs.colManga', 'Manga')}</th>
                  <th>{t('labs.colSource', 'Primary Source')}</th>
                  <th>{t('labs.colChapters', 'Downloaded')}</th>
                  <th>{t('labs.colCore', 'Active Core')}</th>
                  <th style={{ textAlign: 'right' }}>{t('labs.colAction', 'Quick Switch')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredMangas.map((m) => {
                  const isKaizen = m.scraperCore === 'kaizen-mangal';
                  return (
                    <tr key={m.id}>
                      <td>
                        <Checkbox
                          checked={selectedIds.includes(m.id)}
                          onChange={(e) => toggleSelectOne(m.id, e.currentTarget.checked)}
                        />
                      </td>
                      <td>
                        <Text size="sm" weight={500}>
                          {m.title}
                        </Text>
                      </td>
                      <td>
                        <Badge variant="outline" size="sm">
                          {m.source}
                        </Badge>
                      </td>
                      <td>
                        <Text size="xs" color="dimmed">
                          {m.chaptersCount} ch.
                        </Text>
                      </td>
                      <td>
                        <Badge color={isKaizen ? 'teal' : 'blue'} variant={isKaizen ? 'filled' : 'light'}>
                          {m.scraperCore}
                        </Badge>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Button
                          size="xs"
                          variant={isKaizen ? 'subtle' : 'light'}
                          color={isKaizen ? 'blue' : 'teal'}
                          leftIcon={isKaizen ? <IconArrowsLeftRight size={13} /> : <IconArrowRight size={13} />}
                          loading={assignCoreMutation.isLoading}
                          onClick={() =>
                            assignCoreMutation.mutate({
                              core: isKaizen ? 'mangal' : 'kaizen-mangal',
                              mangaIds: [m.id],
                            })
                          }
                        >
                          {isKaizen
                            ? t('labs.switchToMangal', 'Revert to mangal')
                            : t('labs.switchToKaizen', 'Use kaizen-mangal')}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {filteredMangas.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <Text align="center" color="dimmed" py="md" size="sm">
                        {t('labs.noMangasFound', 'No mangas match the selected filter.')}
                      </Text>
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Box>
        </Stack>
      </Paper>
    </Stack>
  );
}
