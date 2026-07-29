import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Container,
  Group,
  Image,
  LoadingOverlay,
  Modal,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
  Grid,
  TextInput,
  Tabs,
  SegmentedControl,
  NumberInput,
  MediaQuery,
} from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { showNotification, updateNotification } from '@mantine/notifications';
import {
  IconCalendarStats,
  IconCheck,
  IconEdit,
  IconTrash,
  IconX,
  IconInfoCircle,
  IconLock,
  IconLockOpen,
  IconFilter,
} from '@tabler/icons-react';
import cronParser from 'cron-parser';
import { motion } from 'framer-motion';
import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { getCronLabel, isCronValid } from '../utils';
import { trpc } from '../utils/trpc';

export default function SchedulerPage() {
  const { t } = useTranslation('common');
  const [editingManga, setEditingManga] = useState<{ id: number; title: string; interval: string } | null>(null);
  const [opened, { open, close }] = useDisclosure(false);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [staggerStartHour, setStaggerStartHour] = useState<number>(0);
  const [staggerEndHour, setStaggerEndHour] = useState<number>(5);
  const [isStaggering, setIsStaggering] = useState<boolean>(false);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [lockFilter, setLockFilter] = useState<'all' | 'locked' | 'unlocked'>('all');
  const [activeStatusTab, setActiveStatusTab] = useState<string>('ongoing');

  const utils = trpc.useContext();
  const schedulesQuery = trpc.manga.getSchedules.useQuery();
  const updateMutation = trpc.manga.update.useMutation();
  const autoStaggerAllMutation = trpc.manga.autoStaggerAll.useMutation();
  const toggleLockMutation = trpc.manga.toggleLock.useMutation();
  const bulkUpdateStatusIntervalMutation = trpc.manga.bulkUpdateIntervalByStatus.useMutation();
  const bulkLockStatusMutation = trpc.manga.bulkLockByStatus.useMutation();
  const updateManualMetadataMutation = trpc.manga.updateManualMetadata.useMutation();
  const serverStatusQuery = trpc.settings.getServerStatus.useQuery();
  const staggerProgressQuery = trpc.manga.getStaggerProgress.useQuery(undefined, {
    enabled: isStaggering,
    refetchInterval: 500, // Poll every 500ms while staggering
  });

  const schedules = useMemo(() => {
    if (!schedulesQuery.data) return [];
    return schedulesQuery.data.map((m) => {
      let parsedHour: number | null = null;
      if (m.interval !== 'never') {
        try {
          const interval = cronParser.parseExpression(m.interval);
          const next = interval.next().toDate();
          parsedHour = next.getHours();
        } catch (e) {
          // Ignore invalid crons
        }
      }
      return {
        ...m,
        parsedHour,
      };
    });
  }, [schedulesQuery.data]);

  const tabFilteredSchedules = useMemo(() => {
    let result = schedules;
    if (activeStatusTab === 'ongoing') {
      result = result.filter((m) => {
        const st = (m.metadata?.status || '').toUpperCase();
        return st === 'ONGOING' || st === 'RELEASING' || st === 'UNKNOWN' || st === 'NOT_YET_RELEASED' || !st;
      });
    } else if (activeStatusTab === 'completed') {
      result = result.filter((m) => {
        const st = (m.metadata?.status || '').toUpperCase();
        return st === 'COMPLETED' || st === 'FINISHED';
      });
    } else if (activeStatusTab === 'hiatus') {
      result = result.filter((m) => {
        const st = (m.metadata?.status || '').toUpperCase();
        return st === 'HIATUS' || st === 'CANCELLED';
      });
    }
    if (lockFilter === 'locked') result = result.filter((m) => m.isLocked);
    if (lockFilter === 'unlocked') result = result.filter((m) => !m.isLocked);
    return result;
  }, [schedules, activeStatusTab, lockFilter]);

  const filteredSchedules = useMemo(() => {
    let result = tabFilteredSchedules;
    if (selectedHour !== null) {
      result = result.filter((m) => m.parsedHour === selectedHour);
    }
    return result;
  }, [tabFilteredSchedules, selectedHour]);

  useEffect(() => {
    if (isStaggering && staggerProgressQuery.data && staggerProgressQuery.data.total > 0) {
      updateNotification({
        id: 'stagger-notification',
        title: t('scheduler.notifications.optimizing'),
        message: `${t('scheduler.notifications.processing')}: ${staggerProgressQuery.data.title} (${
          staggerProgressQuery.data.current
        }/${staggerProgressQuery.data.total})`,
        loading: true,
        autoClose: false,
      });
    }
  }, [staggerProgressQuery.data, isStaggering, t]);

  // Calculate distribution based dynamically on active status tab selection
  const distribution = useMemo(() => {
    const dist = Array(24).fill(0);
    tabFilteredSchedules.forEach((m) => {
      if (m.parsedHour !== null) {
        dist[m.parsedHour] += 1;
      }
    });
    return dist;
  }, [tabFilteredSchedules]);

  const maxJobs = Math.max(...distribution, 1);

  const handleUpdate = async (id: number, interval: string) => {
    try {
      await updateMutation.mutateAsync({ id, interval });
      showNotification({
        title: t('scheduler.notifications.updatedTitle'),
        message: t('scheduler.notifications.updatedMessage'),
        color: 'teal',
        icon: <IconCheck size={18} />,
      });
      schedulesQuery.refetch();
      close();
    } catch (err: unknown) {
      showNotification({
        title: t('common.error'),
        message: err instanceof Error ? err.message : t('scheduler.notifications.updateError'),
        color: 'red',
        icon: <IconX size={18} />,
      });
    }
  };

  const bulkUpdateIntervalMutation = trpc.manga.bulkUpdateInterval.useMutation();

  const handleClearTabSchedules = async () => {
    const targetIds = tabFilteredSchedules.filter((m) => !m.isLocked && m.interval !== 'never').map((m) => m.id);

    if (targetIds.length === 0) {
      showNotification({
        title: 'Sin series aplicables',
        message: 'No hay series programadas y sin candado en esta categoría.',
        color: 'gray',
      });
      return;
    }

    if (
      !confirm(
        `¿Estás seguro de desactivar la planificación (poner en 'never') para las ${targetIds.length} series visibles en esta pestaña?`,
      )
    ) {
      return;
    }

    try {
      showNotification({
        title: 'Desactivando planificación...',
        message: `Actualizando ${targetIds.length} series...`,
        loading: true,
      });

      await bulkUpdateIntervalMutation.mutateAsync({ ids: targetIds, interval: 'never' });

      showNotification({
        title: 'Planificación Desactivada',
        message: `Se han puesto ${targetIds.length} series en 'never'.`,
        color: 'teal',
        icon: <IconCheck size={18} />,
      });
      schedulesQuery.refetch();
    } catch (err) {
      showNotification({
        title: 'Error',
        message: 'No se pudo desactivar la planificación masiva.',
        color: 'red',
      });
    }
  };

  const handleAutoStagger = async () => {
    try {
      setIsStaggering(true);
      showNotification({
        id: 'stagger-notification',
        title: t('scheduler.notifications.optimizing'),
        message: t('scheduler.notifications.rescheduling'),
        loading: true,
        autoClose: false,
      });

      const res = await autoStaggerAllMutation.mutateAsync({ startHour: staggerStartHour, endHour: staggerEndHour });

      updateNotification({
        id: 'stagger-notification',
        title: t('scheduler.notifications.optimizationComplete'),
        message: t('scheduler.notifications.optimizationMessage', { count: res.count }),
        color: 'teal',
        icon: <IconCheck size={18} />,
        autoClose: 5000,
        loading: false,
      });
      schedulesQuery.refetch();
    } catch (err) {
      updateNotification({
        id: 'stagger-notification',
        title: t('common.error'),
        message: err instanceof Error ? err.message : t('scheduler.notifications.staggerError'),
        color: 'red',
        autoClose: 5000,
        loading: false,
      });
    } finally {
      setIsStaggering(false);
    }
  };

  const handleToggleLock = async (id: number, currentLocked: boolean) => {
    try {
      await toggleLockMutation.mutateAsync({ id, isLocked: !currentLocked });
      schedulesQuery.refetch();
    } catch (err) {
      showNotification({
        title: t('common.error'),
        message: 'Failed to toggle lock status',
        color: 'red',
      });
    }
  };

  const handleBulkUpdateInterval = async (status: string, interval: string) => {
    try {
      showNotification({
        title: 'Bulk Updating Schedules',
        message: `Applying interval ${interval} to unlocked ${status} manga...`,
        loading: true,
      });
      const res = await bulkUpdateStatusIntervalMutation.mutateAsync({ status, interval });
      showNotification({
        title: 'Bulk Update Complete',
        message: `Successfully rescheduled ${res.count} manga.`,
        color: 'teal',
        icon: <IconCheck size={18} />,
      });
      schedulesQuery.refetch();
    } catch (err) {
      showNotification({
        title: t('common.error'),
        message: 'Failed to apply bulk scheduling interval',
        color: 'red',
      });
    }
  };

  const handleBulkLock = async (status: string, isLocked: boolean) => {
    try {
      const res = await bulkLockStatusMutation.mutateAsync({ status, isLocked });
      showNotification({
        title: isLocked ? 'Bulk Lock Complete' : 'Bulk Unlock Complete',
        message: `Successfully updated lock status for ${res.count} manga.`,
        color: 'teal',
        icon: <IconCheck size={18} />,
      });
      schedulesQuery.refetch();
    } catch (err) {
      showNotification({
        title: t('common.error'),
        message: 'Failed to update bulk lock status',
        color: 'red',
      });
    }
  };

  const handleInlineStatusChange = async (id: number, newStatus: string) => {
    try {
      await updateManualMetadataMutation.mutateAsync({ id, status: newStatus });
      showNotification({
        title: 'Status Updated',
        message: `Successfully overridden status to ${newStatus}.`,
        color: 'teal',
        icon: <IconCheck size={18} />,
      });
      schedulesQuery.refetch();
    } catch (err) {
      showNotification({
        title: t('common.error'),
        message: 'Failed to override manga status',
        color: 'red',
      });
    }
  };

  if (schedulesQuery.isLoading) return <LoadingOverlay visible />;

  return (
    <Container size="xl" py="md">
      {serverStatusQuery.data && (
        <Paper withBorder p="xs" mb="md" sx={(theme) => ({ backgroundColor: theme.colors.blue[0] })}>
          <Group position="center" spacing="xs">
            <IconInfoCircle size={16} color="blue" />
            <Text size="sm" color="blue" weight={500}>
              {t('scheduler.serverTime')}: {serverStatusQuery.data.time} ({serverStatusQuery.data.timeZone}, UTC
              {serverStatusQuery.data.offset})
            </Text>
          </Group>
        </Paper>
      )}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Group position="apart" mb="xl">
          <Stack spacing={0}>
            <Title
              order={2}
              sx={(theme) => ({ color: theme.colorScheme === 'dark' ? theme.white : theme.colors.dark[7] })}
            >
              {t('scheduler.title')}
            </Title>
            <Text
              size="sm"
              sx={(theme) => ({ color: theme.colorScheme === 'dark' ? theme.colors.gray[5] : theme.colors.gray[7] })}
            >
              {t('scheduler.description')}
            </Text>
          </Stack>
          <Group>
            <Paper withBorder p="xs" sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Text size="sm" weight={500}>
                {t('scheduler.autoStaggerWindow')}:
              </Text>
              <Tooltip label={t('scheduler.autoStaggerTooltip')}>
                <IconInfoCircle size={14} color="gray" style={{ cursor: 'pointer' }} />
              </Tooltip>
              <NumberInput
                value={staggerStartHour}
                onChange={(val) => setStaggerStartHour(val || 0)}
                min={0}
                max={23}
                size="xs"
                sx={{ width: 60 }}
                aria-label="Start Hour"
              />
              <Text size="sm">{t('common.to')}</Text>
              <NumberInput
                value={staggerEndHour}
                onChange={(val) => setStaggerEndHour(val || 0)}
                min={0}
                max={23}
                size="xs"
                sx={{ width: 60 }}
                aria-label="End Hour"
              />
              <Button
                leftIcon={<IconCalendarStats size={16} />}
                variant="gradient"
                gradient={{ from: 'indigo', to: 'cyan' }}
                onClick={handleAutoStagger}
                size="xs"
                disabled={staggerStartHour >= staggerEndHour}
              >
                {t('scheduler.autoStaggerAll')}
              </Button>
            </Paper>
            <Paper withBorder p="xs" sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Text size="sm" weight={500}>
                {t('common.filter')}:
              </Text>
              <SegmentedControl
                size="xs"
                value={lockFilter}
                onChange={(val: any) => setLockFilter(val)}
                data={[
                  { label: 'All', value: 'all' },
                  {
                    label: (
                      <Group spacing={4} noWrap>
                        <IconLock size={14} />
                        <span>Locked</span>
                      </Group>
                    ),
                    value: 'locked',
                  },
                  {
                    label: (
                      <Group spacing={4} noWrap>
                        <IconLockOpen size={14} />
                        <span>Unlocked</span>
                      </Group>
                    ),
                    value: 'unlocked',
                  },
                ]}
              />
            </Paper>
            <Tooltip label="Desactiva la planificación (pone en 'never') de todas las series sin candado en esta pestaña">
              <Button leftIcon={<IconX size={18} />} variant="outline" color="red" onClick={handleClearTabSchedules}>
                Limpiar Planificación Pestaña
              </Button>
            </Tooltip>
          </Group>
        </Group>
      </motion.div>

      <Grid gutter="md">
        <Grid.Col span={12}>
          <Paper
            withBorder
            p="md"
            radius="md"
            sx={(theme) => ({
              backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
            })}
          >
            <Group position="apart" mb="md">
              <Title order={4}>{t('scheduler.jobDistribution')}</Title>
              {selectedHour !== null && (
                <Button size="xs" variant="light" color="gray" onClick={() => setSelectedHour(null)}>
                  {t('scheduler.clearFilter')} ({t('common.hour')}: {selectedHour}:00)
                </Button>
              )}
            </Group>
            <Group align="flex-end" spacing={4} sx={{ height: 150 }}>
              {distribution.map((count, hour) => (
                <Tooltip
                  key={`dist-${hour}`}
                  label={`${count} ${t('common.jobs')} ${t('common.at')} ${hour}:00`}
                  withArrow
                >
                  <Box
                    onClick={() => setSelectedHour((prev) => (prev === hour ? null : hour))}
                    sx={(theme) => ({
                      flex: 1,
                      height: `${(count / maxJobs) * 100}%`,
                      minHeight: count > 0 ? 4 : 0,
                      backgroundColor:
                        count > maxJobs * 0.8
                          ? theme.colors.red[7]
                          : count > 0
                          ? theme.colors.indigo[5]
                          : theme.colorScheme === 'dark'
                          ? theme.colors.dark[4]
                          : theme.colors.gray[3],
                      borderRadius: '4px 4px 0 0',
                      transition: 'all 0.3s ease',
                      cursor: 'pointer',
                      opacity: selectedHour === null || selectedHour === hour ? 1 : 0.4,
                      border: selectedHour === hour ? `2px solid ${theme.colors.indigo[7]}` : 'none',
                      '&:hover': {
                        filter: 'brightness(1.1)',
                        opacity: 1,
                      },
                    })}
                  />
                </Tooltip>
              ))}
            </Group>
            <Group position="apart" mt={4} px={2}>
              <Text size="xs" color="dimmed">
                00:00
              </Text>
              <Text size="xs" color="dimmed">
                06:00
              </Text>
              <Text size="xs" color="dimmed">
                12:00
              </Text>
              <Text size="xs" color="dimmed">
                18:00
              </Text>
              <Text size="xs" color="dimmed">
                23:00
              </Text>
            </Group>
          </Paper>
        </Grid.Col>

        <Grid.Col span={12}>
          <Paper withBorder radius="md" p="md">
            <Tabs value={activeStatusTab} onTabChange={(val) => val && setActiveStatusTab(val)}>
              <Tabs.List mb="md">
                <Tabs.Tab value="ongoing">Ongoing</Tabs.Tab>
                <Tabs.Tab value="completed">Completed / Finished</Tabs.Tab>
                <Tabs.Tab value="hiatus">Hiatus / Cancelled</Tabs.Tab>
                <Tabs.Tab value="all">All Series</Tabs.Tab>
              </Tabs.List>

              {activeStatusTab !== 'all' && (
                <Group
                  position="apart"
                  mb="md"
                  p="xs"
                  sx={(theme) => ({
                    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[0],
                    borderRadius: theme.radius.sm,
                  })}
                >
                  <Text size="xs" color="dimmed">
                    {activeStatusTab === 'ongoing' && 'Tip: Active series are ideal for daily or hourly polling.'}
                    {activeStatusTab === 'completed' &&
                      'Tip: Concluded series are ideal for light long-term tracking (e.g. Monthly).'}
                    {activeStatusTab === 'hiatus' &&
                      'Tip: Suspended series can be safely configured to check rarely or Never.'}
                  </Text>
                  <Group spacing="xs">
                    {activeStatusTab === 'ongoing' && (
                      <Button
                        size="xs"
                        variant="light"
                        onClick={() => handleBulkUpdateInterval('ONGOING', '0 0 * * *')}
                      >
                        Set Unlocked to Daily
                      </Button>
                    )}
                    {activeStatusTab === 'completed' && (
                      <>
                        <Button
                          size="xs"
                          variant="light"
                          onClick={() => handleBulkUpdateInterval('COMPLETED', '0 0 1 * *')}
                        >
                          Set Unlocked to Monthly
                        </Button>
                        <Button
                          size="xs"
                          variant="light"
                          color="indigo"
                          onClick={() => handleBulkLock('COMPLETED', true)}
                        >
                          Lock All Completed
                        </Button>
                      </>
                    )}
                    {activeStatusTab === 'hiatus' && (
                      <>
                        <Button size="xs" variant="light" onClick={() => handleBulkUpdateInterval('HIATUS', 'never')}>
                          Set Unlocked to Never
                        </Button>
                        <Button size="xs" variant="light" color="indigo" onClick={() => handleBulkLock('HIATUS', true)}>
                          Lock All Hiatus
                        </Button>
                      </>
                    )}
                  </Group>
                </Group>
              )}

              <ScrollArea sx={{ minHeight: 300, flex: 1 }}>
                {isMobile ? (
                  <Stack spacing="sm" p="sm">
                    {filteredSchedules.map((m) => (
                      <Paper key={m.id} withBorder p="sm" radius="md">
                        <Group position="apart" align="flex-start" noWrap>
                          <Group spacing="sm" noWrap>
                            <Image src={m.metadata.cover} width={40} height={60} radius="xs" />
                            <Stack spacing={4}>
                              <Text size="sm" weight={500} color={m.isLocked ? 'indigo' : undefined} lineClamp={2}>
                                {m.title}
                              </Text>
                              <Group spacing="xs">
                                <Badge
                                  color={m.interval === 'never' ? 'gray' : m.isLocked ? 'indigo' : 'indigo'}
                                  variant={m.isLocked ? 'filled' : 'light'}
                                  size="sm"
                                >
                                  {getCronLabel(m.interval)}
                                </Badge>
                                <Badge size="xs" variant="outline">
                                  {m.source}
                                </Badge>
                              </Group>
                              <Text size="xs" color="dimmed" sx={{ fontStyle: 'italic' }}>
                                ({m.interval})
                              </Text>
                            </Stack>
                          </Group>
                          <Stack spacing="xs" align="flex-end">
                            <Select
                              size="xs"
                              data={[
                                { label: 'Ongoing / Releasing', value: 'ONGOING' },
                                { label: 'Releasing (AniList)', value: 'RELEASING' },
                                { label: 'Completed / Finished', value: 'COMPLETED' },
                                { label: 'Finished (AniList)', value: 'FINISHED' },
                                { label: 'Hiatus', value: 'HIATUS' },
                                { label: 'Cancelled', value: 'CANCELLED' },
                                { label: 'Unknown', value: 'UNKNOWN' },
                              ]}
                              value={(m.metadata?.status || 'UNKNOWN').toUpperCase()}
                              onChange={(val) => val && handleInlineStatusChange(m.id, val)}
                              styles={{ input: { width: 105 } }}
                            />
                            <Group spacing="xs">
                              <ActionIcon
                                color="indigo"
                                variant="light"
                                onClick={() => {
                                  setEditingManga(m);
                                  open();
                                }}
                              >
                                <IconEdit size={16} />
                              </ActionIcon>
                              <Tooltip
                                label={
                                  m.isLocked
                                    ? 'Locked (Ignored by Auto-Stagger)'
                                    : 'Unlocked (Affected by Auto-Stagger)'
                                }
                              >
                                <ActionIcon
                                  color={m.isLocked ? 'indigo' : 'gray'}
                                  variant={m.isLocked ? 'filled' : 'light'}
                                  onClick={() => handleToggleLock(m.id, m.isLocked)}
                                >
                                  {m.isLocked ? <IconLock size={16} /> : <IconLockOpen size={16} />}
                                </ActionIcon>
                              </Tooltip>
                            </Group>
                          </Stack>
                        </Group>
                      </Paper>
                    ))}
                  </Stack>
                ) : (
                  <Box sx={{ overflowX: 'auto' }}>
                    <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover sx={{ minWidth: 800 }}>
                      <thead style={{ backgroundColor: 'rgba(0,0,0,0.05)', position: 'sticky', top: 0, zIndex: 1 }}>
                        <tr>
                          <th>{t('common.manga')}</th>
                          <th>{t('scheduler.currentSchedule')}</th>
                          <th>{t('common.source')}</th>
                          <th style={{ width: 135 }}>Publication Status</th>
                          <th style={{ width: 80 }}>Lock State</th>
                          <th>{t('common.actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSchedules.map((m) => (
                          <tr key={m.id}>
                            <td>
                              <Group spacing="sm">
                                <Image src={m.metadata.cover} width={30} height={45} radius="xs" />
                                <Text size="sm" weight={500} color={m.isLocked ? 'indigo' : undefined}>
                                  {m.title}
                                </Text>
                              </Group>
                            </td>
                            <td>
                              <Group spacing="xs">
                                <Badge
                                  color={m.interval === 'never' ? 'gray' : m.isLocked ? 'indigo' : 'indigo'}
                                  variant={m.isLocked ? 'filled' : 'light'}
                                  size="sm"
                                >
                                  {getCronLabel(m.interval)}
                                </Badge>
                                <Text size="xs" color="dimmed" sx={{ fontStyle: 'italic' }}>
                                  ({m.interval})
                                </Text>
                              </Group>
                            </td>
                            <td>
                              <Badge size="xs" variant="outline">
                                {m.source}
                              </Badge>
                            </td>
                            <td>
                              <Select
                                size="xs"
                                data={[
                                  { label: 'Ongoing / Releasing', value: 'ONGOING' },
                                  { label: 'Releasing (AniList)', value: 'RELEASING' },
                                  { label: 'Completed / Finished', value: 'COMPLETED' },
                                  { label: 'Finished (AniList)', value: 'FINISHED' },
                                  { label: 'Hiatus', value: 'HIATUS' },
                                  { label: 'Cancelled', value: 'CANCELLED' },
                                  { label: 'Unknown', value: 'UNKNOWN' },
                                ]}
                                value={(m.metadata?.status || 'UNKNOWN').toUpperCase()}
                                onChange={(val) => val && handleInlineStatusChange(m.id, val)}
                                styles={{ input: { minWidth: 105 } }}
                              />
                            </td>
                            <td>
                              <Tooltip
                                label={
                                  m.isLocked
                                    ? 'Locked (Ignored by Auto-Stagger)'
                                    : 'Unlocked (Affected by Auto-Stagger)'
                                }
                              >
                                <ActionIcon
                                  color={m.isLocked ? 'indigo' : 'gray'}
                                  variant={m.isLocked ? 'filled' : 'light'}
                                  onClick={() => handleToggleLock(m.id, m.isLocked)}
                                >
                                  {m.isLocked ? <IconLock size={16} /> : <IconLockOpen size={16} />}
                                </ActionIcon>
                              </Tooltip>
                            </td>
                            <td>
                              <ActionIcon
                                color="indigo"
                                variant="light"
                                onClick={() => {
                                  setEditingManga(m);
                                  open();
                                }}
                              >
                                <IconEdit size={16} />
                              </ActionIcon>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </Box>
                )}
              </ScrollArea>
            </Tabs>
          </Paper>
        </Grid.Col>
      </Grid>

      <Modal
        opened={opened}
        onClose={close}
        title={`${t('scheduler.editSchedule')}: ${editingManga?.title}`}
        centered
        radius="md"
      >
        <ScheduleEditor
          initialValue={editingManga?.interval || ''}
          onSave={(val) => editingManga && handleUpdate(editingManga.id, val)}
          t={t}
        />
      </Modal>
    </Container>
  );
}

function ScheduleEditor({ initialValue, onSave, t }: { initialValue: string; onSave: (val: string) => void; t: any }) {
  const [activeTab, setActiveTab] = useState<string | null>('simple');
  const [frequency, setFrequency] = useState<string>('Daily');
  const [days, setDays] = useState<string>('0');
  const [hour, setHour] = useState<string>('0');
  const [minute, setMinute] = useState<string>('0');

  const [advancedValue, setAdvancedValue] = useState(initialValue);

  useEffect(() => {
    setAdvancedValue(initialValue);

    if (!initialValue || initialValue === 'never') {
      setFrequency('Daily');
      setHour('0');
      setMinute('0');
      setDays('0');
      setActiveTab('simple');
      return;
    }

    const parts = initialValue.trim().split(/\s+/);
    if (parts.length === 5) {
      const [min, hr, dom, mon, dow] = parts;
      
      const isInteger = (val: string) => /^\d+$/.test(val);
      const minNum = isInteger(min) ? parseInt(min, 10) : -1;
      const hrNum = isInteger(hr) ? parseInt(hr, 10) : -1;
      
      const isMinValid = minNum >= 0 && minNum < 60;
      const isHrValid = hrNum >= 0 && hrNum < 24;

      if (isMinValid && hr === '*' && dom === '*' && mon === '*' && dow === '*') {
        setFrequency('Hourly');
        setMinute(String(minNum));
        setActiveTab('simple');
      } else if (isMinValid && isHrValid && dom === '*' && mon === '*' && dow === '*') {
        setFrequency('Daily');
        setHour(String(hrNum));
        setMinute(String(minNum));
        setActiveTab('simple');
      } else if (isMinValid && isHrValid && dom === '*' && mon === '*' && /^[0-7]$/.test(dow)) {
        setFrequency('Weekly');
        setHour(String(hrNum));
        setMinute(String(minNum));
        setDays(dow === '7' ? '0' : dow);
        setActiveTab('simple');
      } else {
        setActiveTab('advanced');
      }
    } else {
      setActiveTab('advanced');
    }
  }, [initialValue]);

  const generateCron = () => {
    if (frequency === 'Hourly') return `${minute} * * * *`;
    if (frequency === 'Daily') return `${minute} ${hour} * * *`;
    if (frequency === 'Weekly') return `${minute} ${hour} * * ${days}`;
    return 'never';
  };

  const currentCron = activeTab === 'simple' ? generateCron() : advancedValue;

  return (
    <Tabs value={activeTab} onTabChange={setActiveTab}>
      <Tabs.List>
        <Tabs.Tab value="simple">{t('common.simple')}</Tabs.Tab>
        <Tabs.Tab value="advanced">{t('common.advanced')}</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="simple" pt="md">
        <Stack>
          <Select
            label={t('scheduler.frequency')}
            data={[
              { label: t('common.frequencies.hourly'), value: 'Hourly' },
              { label: t('common.frequencies.daily'), value: 'Daily' },
              { label: t('common.frequencies.weekly'), value: 'Weekly' },
            ]}
            value={frequency}
            onChange={(v) => v && setFrequency(v)}
          />
          {frequency === 'Weekly' && (
            <SegmentedControl
              value={days}
              onChange={setDays}
              data={[
                { label: t('common.days.sun'), value: '0' },
                { label: t('common.days.mon'), value: '1' },
                { label: t('common.days.tue'), value: '2' },
                { label: t('common.days.wed'), value: '3' },
                { label: t('common.days.thu'), value: '4' },
                { label: t('common.days.fri'), value: '5' },
                { label: t('common.days.sat'), value: '6' },
              ]}
            />
          )}
          {frequency !== 'Hourly' && (
            <Group grow>
              <Select
                label={t('common.hour')}
                data={Array.from({ length: 24 }, (_, i) => ({ label: String(i).padStart(2, '0'), value: String(i) }))}
                value={hour}
                onChange={(v) => v && setHour(v)}
                searchable
              />
              <Select
                label={t('common.minute')}
                data={Array.from({ length: 60 }, (_, i) => ({ label: String(i).padStart(2, '0'), value: String(i) }))}
                value={minute}
                onChange={(v) => v && setMinute(v)}
                searchable
              />
            </Group>
          )}
          {frequency === 'Hourly' && (
            <Select
              label={t('common.minute')}
              data={Array.from({ length: 60 }, (_, i) => ({ label: String(i).padStart(2, '0'), value: String(i) }))}
              value={minute}
              onChange={(v) => v && setMinute(v)}
              searchable
            />
          )}

          <Text size="xs" color="dimmed">
            {t('common.result')}: <b>{getCronLabel(currentCron)}</b>
          </Text>
          <Button mt="md" onClick={() => onSave(currentCron)} disabled={!isCronValid(currentCron)}>
            {t('common.save')}
          </Button>
        </Stack>
      </Tabs.Panel>

      <Tabs.Panel value="advanced" pt="md">
        <Stack>
          <TextInput
            label={t('scheduler.cronExpression')}
            value={advancedValue}
            onChange={(e) => setAdvancedValue(e.currentTarget.value)}
            error={!isCronValid(advancedValue) && t('scheduler.invalidCron')}
          />
          <Text size="xs" color="dimmed">
            {t('common.result')}: <b>{getCronLabel(advancedValue)}</b>
          </Text>
          <Button mt="md" onClick={() => onSave(advancedValue)} disabled={!isCronValid(advancedValue)}>
            {t('common.save')}
          </Button>
        </Stack>
      </Tabs.Panel>
    </Tabs>
  );
}

export async function getServerSideProps({ locale }: { locale?: string }) {
  const { serverSideTranslations } = await import('next-i18next/serverSideTranslations');
  return {
    props: {
      ...(await serverSideTranslations(locale || 'en', ['common', 'settings'])),
    },
  };
}
