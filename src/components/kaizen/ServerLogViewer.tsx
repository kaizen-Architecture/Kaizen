import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Center,
  Code,
  Divider,
  Group,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core';
import {
  IconActivity,
  IconCopy,
  IconDownload,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconSearch,
  IconTerminal,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';
import { showNotification } from '@mantine/notifications';
import { trpc } from '../../utils/trpc';

export default function ServerLogViewer() {
  const { t } = useTranslation('common');
  const [level, setLevel] = useState<string>('all');
  const [search, setSearch] = useState<string>('all');
  const [customSearch, setCustomSearch] = useState<string>('');
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [limit, setLimit] = useState<string>('100');

  const serverLogLevel = trpc.settings.getLogLevel.useQuery();
  const setLogLevelMutation = trpc.settings.setLogLevel.useMutation({
    onSuccess: () => {
      serverLogLevel.refetch();
    },
  });

  // Trigger query with state
  const logsQuery = trpc.settings.getLogs.useQuery(
    {
      limit: parseInt(limit, 10),
      level: level === 'all' ? undefined : level,
      search: search === 'custom' ? customSearch : search === 'all' ? undefined : search,
    },
    {
      // Refetch every 3 seconds if not paused
      refetchInterval: isPaused ? false : 3000,
      keepPreviousData: true,
    },
  );

  const handleCopyLogs = () => {
    if (!logsQuery.data) return;
    const text = logsQuery.data.map((l) => `[${l.time}] [${l.level.toUpperCase()}] ${l.msg}`).join('\n');

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          showNotification({
            title: t('maintenance.logs.copiedTitle', 'Logs Copiados'),
            message: t('maintenance.logs.copiedDesc', 'Los registros se han copiado al portapapeles.'),
            color: 'teal',
          });
        })
        .catch(() => {
          fallbackCopyText(text);
        });
    } else {
      fallbackCopyText(text);
    }
  };

  const fallbackCopyText = (text: string) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.position = 'fixed';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      showNotification({
        title: t('maintenance.logs.copiedTitle', 'Logs Copiados'),
        message: t('maintenance.logs.copiedDesc', 'Los registros se han copiado al portapapeles.'),
        color: 'teal',
      });
    } catch (err) {
      console.error('Fallback copy failed', err);
      showNotification({
        title: 'Error',
        message: 'No se pudo copiar los logs al portapapeles.',
        color: 'red',
      });
    }
    document.body.removeChild(textArea);
  };

  const getLevelColor = (lvl: string) => {
    switch (lvl) {
      case 'error':
      case 'fatal':
        return 'red';
      case 'warn':
        return 'yellow';
      case 'info':
        return 'teal';
      case 'debug':
      case 'trace':
        return 'indigo';
      default:
        return 'gray';
    }
  };

  return (
    <Stack spacing="md">
      <Paper
        withBorder
        p="md"
        radius="md"
        sx={(theme) => ({
          background: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
        })}
      >
        <Stack spacing="md">
          {/* Header Section */}
          <Group position="apart">
            <Group spacing="sm">
              <ThemeIcon size={32} radius="md" color="indigo" variant="light">
                <IconTerminal size={18} />
              </ThemeIcon>
              <div>
                <Title order={4}>{t('maintenance.logs.title', 'Registros del Servidor en Tiempo Real')}</Title>
                <Text size="xs" color="dimmed">
                  {t(
                    'maintenance.logs.subtitle',
                    'Supervisión en vivo de descargas, Kavita, Komga y errores de ejecución.',
                  )}
                </Text>
              </div>
            </Group>

            <Group spacing={8}>
              <Select
                placeholder="Nivel de Servidor"
                value={serverLogLevel.data || 'info'}
                onChange={(val) => val && setLogLevelMutation.mutate(val as any)}
                data={[
                  { value: 'trace', label: 'Server: TRACE' },
                  { value: 'debug', label: 'Server: DEBUG' },
                  { value: 'info', label: 'Server: INFO' },
                  { value: 'warn', label: 'Server: WARN' },
                  { value: 'error', label: 'Server: ERROR' },
                ]}
                size="xs"
                sx={{ width: 130 }}
                styles={(theme) => ({
                  input: {
                    borderColor: theme.colors.indigo[4],
                    fontWeight: 600,
                    fontSize: '11px',
                    '&:focus': {
                      borderColor: theme.colors.indigo[6],
                    },
                  },
                })}
              />

              <Tooltip
                label={
                  isPaused
                    ? t('maintenance.logs.play', 'Activar actualización')
                    : t('maintenance.logs.pause', 'Pausar actualización')
                }
              >
                <ActionIcon
                  variant="light"
                  color={isPaused ? 'teal' : 'yellow'}
                  onClick={() => setIsPaused(!isPaused)}
                  size="md"
                >
                  {isPaused ? <IconPlayerPlay size={16} /> : <IconPlayerPause size={16} />}
                </ActionIcon>
              </Tooltip>

              <Button
                variant="subtle"
                color="indigo"
                size="xs"
                leftIcon={<IconCopy size={14} />}
                onClick={handleCopyLogs}
                disabled={!logsQuery.data || logsQuery.data.length === 0}
              >
                {t('maintenance.logs.copy', 'Copiar Logs')}
              </Button>

              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={() => logsQuery.refetch()}
                loading={logsQuery.isFetching}
                size="md"
              >
                <IconRefresh size={16} />
              </ActionIcon>
            </Group>
          </Group>

          <Divider />

          {/* Filtering Controls */}
          <Group spacing="sm" grow sx={{ flexWrap: 'wrap' }}>
            <Select
              label={t('maintenance.logs.levelLabel', 'Nivel de Depuración')}
              value={level}
              onChange={(val) => setLevel(val || 'all')}
              data={[
                { value: 'all', label: t('maintenance.logs.lvlAll', 'Todos los Niveles') },
                { value: 'info', label: 'INFO' },
                { value: 'warn', label: 'WARNING' },
                { value: 'error', label: 'ERROR' },
                { value: 'debug', label: 'DEBUG' },
              ]}
              size="xs"
            />

            <Select
              label={t('maintenance.logs.categoryLabel', 'Filtro de Categoría / Acción')}
              value={search}
              onChange={(val) => setSearch(val || 'all')}
              data={[
                { value: 'all', label: t('maintenance.logs.catAll', 'Cualquier Categoría') },
                { value: 'kavita', label: t('maintenance.logs.catSync', 'Sincronización (Kavita/Integraciones)') },
                { value: 'download', label: t('maintenance.logs.catDownload', 'Descargas de Capítulos') },
                { value: 'custom', label: t('maintenance.logs.catCustom', 'Buscar por Palabra Clave') },
              ]}
              size="xs"
            />

            {search === 'custom' && (
              <TextInput
                label={t('maintenance.logs.searchLabel', 'Palabra Clave')}
                placeholder={t('maintenance.logs.searchPlaceholder', 'Escribe algo a buscar...')}
                value={customSearch}
                onChange={(e) => setCustomSearch(e.currentTarget.value)}
                size="xs"
                icon={<IconSearch size={14} />}
              />
            )}

            <Select
              label={t('maintenance.logs.limitLabel', 'Cantidad de Líneas')}
              value={limit}
              onChange={(val) => setLimit(val || '100')}
              data={[
                { value: '50', label: '50' },
                { value: '100', label: '100' },
                { value: '250', label: '250' },
                { value: '500', label: '500' },
              ]}
              size="xs"
              sx={{ maxWidth: 120 }}
            />
          </Group>

          {/* Terminal Console View */}
          <Paper
            withBorder
            p="sm"
            radius="md"
            sx={(theme) => ({
              backgroundColor: theme.colorScheme === 'dark' ? '#0b0c10' : '#f8f9fa',
              border: `1px solid ${theme.colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[3]}`,
              fontFamily: 'JetBrains Mono, Courier New, Courier, monospace',
            })}
          >
            <ScrollArea sx={{ height: 380 }} type="auto" offsetScrollbars>
              <Stack spacing={4}>
                {logsQuery.data && logsQuery.data.length > 0 ? (
                  logsQuery.data.map((log) => (
                    <Group
                      key={log.id}
                      spacing="xs"
                      align="flex-start"
                      noWrap
                      sx={{
                        padding: '2px 4px',
                        borderRadius: 4,
                        '&:hover': {
                          backgroundColor: 'rgba(255, 255, 255, 0.03)',
                        },
                      }}
                    >
                      <Text size="xs" color="dimmed" sx={{ width: 68, flexShrink: 0 }}>
                        {dayjs(log.time).format('HH:mm:ss')}
                      </Text>
                      <Badge
                        color={getLevelColor(log.level)}
                        variant="light"
                        size="xs"
                        sx={{ width: 60, flexShrink: 0, textAlign: 'center' }}
                      >
                        {log.level.toUpperCase()}
                      </Badge>
                      <Code
                        sx={(theme) => ({
                          background: 'transparent',
                          color:
                            log.level === 'error' || log.level === 'fatal'
                              ? theme.colors.red[5]
                              : log.level === 'warn'
                              ? theme.colors.yellow[5]
                              : theme.colorScheme === 'dark'
                              ? theme.colors.gray[3]
                              : theme.colors.gray[8],
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                          padding: 0,
                          fontSize: '11px',
                        })}
                      >
                        {log.msg}
                      </Code>
                    </Group>
                  ))
                ) : (
                  <Center py="xl">
                    <Stack align="center" spacing="xs">
                      <ThemeIcon size={40} radius="xl" color="gray" variant="light">
                        <IconActivity size={20} />
                      </ThemeIcon>
                      <Text color="dimmed" size="xs">
                        {t('maintenance.logs.noLogs', 'No se encontraron registros coincidentes.')}
                      </Text>
                    </Stack>
                  </Center>
                )}
              </Stack>
            </ScrollArea>
          </Paper>
        </Stack>
      </Paper>
    </Stack>
  );
}
