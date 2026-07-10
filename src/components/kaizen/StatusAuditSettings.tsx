import { Box, Button, Divider, Group, SegmentedControl, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { IconActivity, IconBolt, IconCheck, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'next-i18next';
import { trpc } from '../../utils/trpc';

export function StatusAuditSettings() {
  const { t } = useTranslation('settings');
  const settings = trpc.settings.query.useQuery();
  const update = trpc.settings.update.useMutation({
    onSuccess: () => settings.refetch(),
  });

  const cleanupMutation = trpc.manga.cleanupDuplicates.useMutation();

  const handleCleanupDuplicates = async () => {
    try {
      showNotification({
        title: t('maintenance.cleanupLoading', 'Cleaning duplicates...'),
        message: t('maintenance.cleanupScanning', 'Scanning all chapters database...'),
        loading: true,
      });

      const result = await cleanupMutation.mutateAsync();

      showNotification({
        title: t('maintenance.cleanupCompleted', 'Cleanup Completed'),
        message: t('maintenance.cleanupSuccessMsg', 'Successfully deleted {{count}} duplicate chapters globally.', {
          count: result.deleted,
        }),
        color: 'teal',
        icon: <IconCheck size={18} />,
      });
    } catch (err) {
      showNotification({
        title: t('maintenance.cleanupError', 'Error'),
        message: t('maintenance.cleanupFailedMsg', 'Failed to run duplicate chapters cleanup.'),
        color: 'red',
      });
    }
  };

  const triggerAudit = trpc.manga.triggerStatusAudit.useMutation({
    onSuccess: () => {
      showNotification({
        title: t('maintenance.statusAuditTriggeredTitle', 'Auditoría Disparada'),
        message: t(
          'maintenance.statusAuditTriggeredMsg',
          'Se ha iniciado la revisión ligera en segundo plano de todas las series activas.',
        ),
        color: 'teal',
        icon: <IconCheck size={18} />,
      });
    },
  });

  const intervalValue = (settings.data?.appConfig as any)?.refreshStatusInterval || 'weekly';
  const windowValue = (settings.data?.appConfig as any)?.refreshStatusWindow || 'night';

  const handleIntervalChange = (val: string) => {
    update.mutate({ updateType: 'app', key: 'refreshStatusInterval' as any, value: val });
  };

  const handleWindowChange = (val: string) => {
    update.mutate({ updateType: 'app', key: 'refreshStatusWindow' as any, value: val });
  };

  if (settings.isLoading || !settings.data) return null;

  return (
    <Stack spacing="md" mt="xs">
      <Group position="apart" align="flex-start">
        <Group spacing="sm">
          <ThemeIcon size={36} radius="md" color="teal" variant="light">
            <IconActivity size={20} />
          </ThemeIcon>
          <Box>
            <Title order={5}>
              {t('maintenance.statusAuditTitle', 'Mantenimiento Automático de Estados de Publicación')}
            </Title>
            <Text size="xs" color="dimmed">
              {t(
                'maintenance.statusAuditDesc',
                'Consulta periódicamente y de forma ultra-ligera si las series Ongoing han concluido o entrado en Hiatus, actualizando tu biblioteca sin sobrecargar servidores.',
              )}
            </Text>
          </Box>
        </Group>
        <Button
          leftIcon={<IconBolt size={16} />}
          size="xs"
          variant="light"
          color="teal"
          loading={triggerAudit.isLoading}
          onClick={() => triggerAudit.mutate()}
        >
          {t('maintenance.statusAuditBtn', 'Auditar Ahora')}
        </Button>
      </Group>

      <Stack spacing="xs">
        <Text size="xs" weight={500} color="dimmed">
          {t('maintenance.statusAuditFreqLabel', 'Frecuencia de Revisión Automática')}
        </Text>
        <SegmentedControl
          fullWidth
          value={intervalValue}
          onChange={handleIntervalChange}
          disabled={update.isLoading}
          data={[
            { value: 'daily', label: t('maintenance.freqDaily', 'Diario') },
            { value: 'weekly', label: t('maintenance.freqWeekly', 'Semanal (Recomendado)') },
            { value: 'monthly', label: t('maintenance.freqMonthly', 'Mensual') },
            { value: 'never', label: t('maintenance.freqNever', 'Desactivado') },
          ]}
        />
      </Stack>

      {intervalValue !== 'never' && (
        <Stack spacing="xs">
          <Text size="xs" weight={500} color="dimmed">
            {t('maintenance.statusAuditWindowLabel', 'Ventana Horaria de Ejecución')}
          </Text>
          <SegmentedControl
            fullWidth
            value={windowValue}
            onChange={handleWindowChange}
            disabled={update.isLoading}
            data={[
              {
                value: 'night',
                label: (
                  <Group spacing={4} position="center">
                    <span>🌙</span>
                    <Text size="xs">{t('maintenance.windowNight', 'Nocturna (Madrugada)')}</Text>
                  </Group>
                ),
              },
              {
                value: 'day',
                label: (
                  <Group spacing={4} position="center">
                    <span>☀️</span>
                    <Text size="xs">{t('maintenance.windowDay', 'Diurna (Mediodía)')}</Text>
                  </Group>
                ),
              },
            ]}
          />
        </Stack>
      )}

      <Divider my="sm" variant="dashed" />

      <Box>
        <Group position="apart" align="flex-start">
          <Stack spacing={2}>
            <Text weight={600} size="sm">
              {t('maintenance.cleanupTitle', 'Duplicate Chapters Cleanup')}
            </Text>
            <Text size="xs" color="dimmed" sx={{ maxWidth: 450 }}>
              {t(
                'maintenance.cleanupDesc',
                'Scan your global library to locate and remove duplicate chapter files from disk, reclaiming storage space.',
              )}
            </Text>
          </Stack>
          <Button
            leftIcon={<IconTrash size={16} />}
            variant="light"
            color="red"
            size="xs"
            onClick={handleCleanupDuplicates}
            loading={cleanupMutation.isLoading}
          >
            {t('maintenance.cleanupBtn', 'Run Global Cleanup')}
          </Button>
        </Group>
      </Box>
    </Stack>
  );
}
