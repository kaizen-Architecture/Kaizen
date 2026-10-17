import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Grid,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core';
import {
  IconBell,
  IconBrandDiscord,
  IconBrandTelegram,
  IconBrandWhatsapp,
  IconCalendarTime,
  IconCheck,
  IconPlayerPlay,
  IconRefresh,
  IconSettings,
} from '@tabler/icons-react';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { showNotification } from '@mantine/notifications';
import { trpc } from '../../../utils/trpc';

export function NotificationStatsCard() {
  const { t } = useTranslation(['dashboard', 'settings', 'common']);
  const utils = trpc.useContext();

  const statsQuery = trpc.settings.getNotificationStats.useQuery(undefined, {
    refetchInterval: 10000,
  });

  const triggerDigestMutation = trpc.settings.triggerNotificationDigest.useMutation({
    onSuccess: (res) => {
      showNotification({
        title: t('dashboard:notifications.digestTriggered', 'Resumen Procesado'),
        message: res.count > 0
          ? t('dashboard:notifications.digestItemsSent', `Se enviaron ${res.count} eventos agrupados.`)
          : t('dashboard:notifications.digestNoPending', 'No hay eventos pendientes para resumir.'),
        color: 'teal',
        icon: <IconCheck size={16} />,
      });
      utils.settings.getNotificationStats.invalidate();
    },
    onError: (err) => {
      showNotification({
        title: t('common:error', 'Error'),
        message: err.message,
        color: 'red',
      });
    },
  });

  const data = statsQuery.data;

  const getDigestLabel = (mode?: string, hour?: number) => {
    switch (mode) {
      case 'IMMEDIATE':
        return t('settings:notifications.digestImmediate', 'Inmediato (Anti-flood)');
      case 'EVERY_6_HOURS':
        return t('settings:notifications.digestEvery6Hours', 'Cada 6 Horas');
      case 'DAILY':
        return `${t('settings:notifications.digestDaily', 'Diario')} (${String(hour ?? 20).padStart(2, '0')}:00)`;
      case 'HOURLY':
      default:
        return t('settings:notifications.digestHourly', 'Cada 1 Hora');
    }
  };

  return (
    <Paper withBorder p="md" radius="md">
      <Stack spacing="sm">
        {/* Header */}
        <Group position="apart">
          <Group spacing="xs">
            <ThemeIcon size={32} radius="md" color="indigo" variant="light">
              <IconBell size={18} />
            </ThemeIcon>
            <div>
              <Title order={5}>
                {t('dashboard:notifications.title', 'Actividad de Notificaciones')}
              </Title>
              <Text size="xs" color="dimmed">
                {t('dashboard:notifications.subtitle', 'Estado de envíos push y consolidación de alertas')}
              </Text>
            </div>
          </Group>

          <Group spacing={8}>
            <Button
              component={Link}
              href="/settings?tab=notifications"
              variant="subtle"
              color="gray"
              size="xs"
              leftIcon={<IconSettings size={14} />}
            >
              {t('common:settings', 'Ajustes')}
            </Button>
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={() => statsQuery.refetch()}
              loading={statsQuery.isFetching}
              size="sm"
            >
              <IconRefresh size={14} />
            </ActionIcon>
          </Group>
        </Group>

        {/* Stat Grid */}
        <SimpleGrid
          cols={4}
          breakpoints={[
            { maxWidth: 'md', cols: 2 },
            { maxWidth: 'xs', cols: 1 },
          ]}
        >
          {/* Total Sent */}
          <Card withBorder p="xs" radius="sm">
            <Text size="xs" color="dimmed" weight={600}>
              {t('dashboard:notifications.todaySent', 'Enviadas Hoy')}
            </Text>
            <Text size="xl" weight={700} color="indigo">
              {data?.todaySent ?? 0}
            </Text>
            <Text size="10px" color="dimmed">
              {t('dashboard:notifications.totalAllTime', 'Total histórico:')} {data?.totalSent ?? 0}
            </Text>
          </Card>

          {/* WhatsApp */}
          <Card withBorder p="xs" radius="sm">
            <Group position="apart">
              <Text size="xs" color="dimmed" weight={600}>
                WhatsApp
              </Text>
              <ThemeIcon size={20} color="teal" variant="light">
                <IconBrandWhatsapp size={12} />
              </ThemeIcon>
            </Group>
            <Text size="xl" weight={700} color="teal">
              {data?.byChannel.whatsapp ?? 0}
            </Text>
            <Text size="10px" color="dimmed">
              CallMeBot API
            </Text>
          </Card>

          {/* Discord */}
          <Card withBorder p="xs" radius="sm">
            <Group position="apart">
              <Text size="xs" color="dimmed" weight={600}>
                Discord
              </Text>
              <ThemeIcon size={20} color="indigo" variant="light">
                <IconBrandDiscord size={12} />
              </ThemeIcon>
            </Group>
            <Text size="xl" weight={700} color="indigo">
              {data?.byChannel.discord ?? 0}
            </Text>
            <Text size="10px" color="dimmed">
              Webhooks
            </Text>
          </Card>

          {/* Telegram */}
          <Card withBorder p="xs" radius="sm">
            <Group position="apart">
              <Text size="xs" color="dimmed" weight={600}>
                Telegram
              </Text>
              <ThemeIcon size={20} color="blue" variant="light">
                <IconBrandTelegram size={12} />
              </ThemeIcon>
            </Group>
            <Text size="xl" weight={700} color="blue">
              {data?.byChannel.telegram ?? 0}
            </Text>
            <Text size="10px" color="dimmed">
              Bot API
            </Text>
          </Card>
        </SimpleGrid>

        {/* Digest Status Footer */}
        <Group
          position="apart"
          sx={(theme) => ({
            paddingTop: theme.spacing.xs,
            borderTop: `1px solid ${
              theme.colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[2]
            }`,
            [`@media (max-width: ${theme.breakpoints.xs}px)`]: {
              flexDirection: 'column',
              alignItems: 'stretch',
              gap: theme.spacing.xs,
            },
          })}
        >
          <Group spacing="xs">
            <IconCalendarTime size={16} color="gray" />
            <Text size="xs" color="dimmed">
              {t('dashboard:notifications.digestActive', 'Resumen programado:')}
            </Text>
            <Badge size="sm" variant="light" color="indigo">
              {getDigestLabel(data?.digest.mode, data?.digest.hour)}
            </Badge>
            {data?.digest.pendingCount ? (
              <Badge size="sm" variant="filled" color="orange">
                {data.digest.pendingCount} {t('dashboard:notifications.pendingItems', 'pendientes')}
              </Badge>
            ) : null}
          </Group>

          <Button
            size="xs"
            variant="light"
            color="indigo"
            leftIcon={<IconPlayerPlay size={14} />}
            loading={triggerDigestMutation.isLoading}
            onClick={() => triggerDigestMutation.mutate()}
          >
            {t('dashboard:notifications.runDigestNow', 'Procesar Resumen Ahora')}
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
