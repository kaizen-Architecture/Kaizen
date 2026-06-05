import { Paper, Text, Group, ThemeIcon, Stack, RingProgress, Center, Title, Badge, Button } from '@mantine/core';
import { IconCheck, IconX, IconRefresh, IconAlertTriangle } from '@tabler/icons-react';

interface IntegrationHealthCardProps {
  name: string;
  status: 'healthy' | 'unhealthy' | 'connecting';
  syncedCount: number;
  totalCount: number;
  failedCount?: number;
  onSync?: () => void;
  onViewFailed?: () => void;
  isLoading?: boolean;
  action?: React.ReactNode;
}

export function IntegrationHealthCard({
  name,
  status,
  syncedCount,
  totalCount,
  failedCount = 0,
  onSync,
  onViewFailed,
  isLoading,
  action,
}: IntegrationHealthCardProps) {
  const percentage = totalCount > 0 ? Math.round((syncedCount / totalCount) * 100) : 0;
  const failedPercentage = failedCount > 0 && totalCount > 0 ? Math.round((failedCount / totalCount) * 100) : 0;
  const color = status === 'healthy' ? 'teal' : status === 'unhealthy' ? 'red' : 'yellow';

  const ringSections = [
    { value: percentage, color: 'teal' },
    ...(failedCount > 0 ? [{ value: failedPercentage, color: 'red' }] : []),
  ];

  return (
    <Paper withBorder p="md" radius="md">
      <Group position="apart">
        <Stack spacing={0}>
          <Title order={5}>{name}</Title>
          <Group spacing={5}>
            <ThemeIcon color={color} size="xs" radius="xl">
              {status === 'healthy' ? <IconCheck size={10} /> : <IconX size={10} />}
            </ThemeIcon>
            <Text size="xs" color="dimmed">
              {status === 'healthy' ? 'Healthy' : status === 'unhealthy' ? 'Disconnected' : 'Connecting...'}
            </Text>
          </Group>
        </Stack>
        <RingProgress
          size={80}
          roundCaps
          thickness={8}
          sections={ringSections}
          label={
            <Center>
              <Text size="xs" weight={700}>
                {percentage}%
              </Text>
            </Center>
          }
        />
      </Group>

      <Stack spacing="xs" mt="md">
        <Group position="apart">
          <Text size="sm" color="dimmed">
            Sync Status
          </Text>
          <Text size="sm" weight={500}>
            {syncedCount} / {totalCount} mangas
          </Text>
        </Group>

        {failedCount > 0 && (
          <Group position="apart">
            <Text size="sm" color="red">
              Failed Integrations
            </Text>
            <Badge
              color="red"
              variant="light"
              size="sm"
              style={{ cursor: onViewFailed ? 'pointer' : 'default' }}
              onClick={onViewFailed}
            >
              {failedCount} failed
            </Badge>
          </Group>
        )}

        <Group position="right" spacing={8} mt={failedCount > 0 ? 'xs' : 0}>
          {failedCount > 0 && onViewFailed && (
            <Button
              variant="subtle"
              color="red"
              size="xs"
              compact
              leftIcon={<IconAlertTriangle size={14} />}
              onClick={onViewFailed}
              styles={{ root: { paddingLeft: 4, paddingRight: 4 } }}
            >
              Ver Fallados
            </Button>
          )}

          {onSync && (
            <ThemeIcon variant="light" color="indigo" size="sm" sx={{ cursor: 'pointer' }} onClick={onSync}>
              <IconRefresh size={14} className={isLoading ? 'animate-spin' : ''} />
            </ThemeIcon>
          )}

          {action}
        </Group>
      </Stack>
    </Paper>
  );
}
