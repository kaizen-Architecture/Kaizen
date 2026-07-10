import { useState } from 'react';
import {
  Box,
  Badge,
  Group,
  Select,
  Stack,
  Table,
  Text,
  Title,
  ActionIcon,
  Tooltip,
  ScrollArea,
  Skeleton,
} from '@mantine/core';
import { IconRefresh, IconApi } from '@tabler/icons-react';
import { useTranslation } from 'next-i18next';
import { trpc } from '../../utils/trpc';

function methodColor(method: string) {
  switch (method.toUpperCase()) {
    case 'GET':
      return 'teal';
    case 'POST':
      return 'blue';
    case 'PUT':
    case 'PATCH':
      return 'yellow';
    case 'DELETE':
      return 'red';
    default:
      return 'gray';
  }
}

function uaLabel(ua: string | null | undefined) {
  if (!ua) return '—';
  if (ua.toLowerCase().includes('paperback')) return `📱 ${ua.split('/')[0]}`;
  return ua.length > 40 ? `${ua.substring(0, 40)}…` : ua;
}

export function ApiAuditLog() {
  const { t } = useTranslation('settings');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [limit, setLimit] = useState<string>('100');

  const usersQuery = trpc.auth.getUsers.useQuery();
  const logsQuery = trpc.auth.getApiCallLogs.useQuery(
    {
      userId: selectedUserId ? parseInt(selectedUserId, 10) : undefined,
      limit: parseInt(limit, 10),
    },
    { refetchInterval: 30_000 },
  );

  const serviceUsers = (usersQuery.data || []).filter((u) => u.role === 'SERVICE');

  const userOptions = [
    { value: '', label: t('integrations.auditLog.allUsers', 'All users') },
    ...serviceUsers.map((u) => ({ value: String(u.id), label: u.username })),
  ];

  const limitOptions = [
    { value: '50', label: '50' },
    { value: '100', label: '100' },
    { value: '200', label: '200' },
    { value: '500', label: '500' },
  ];

  return (
    <Stack spacing="md">
      <Group position="apart" align="flex-start">
        <div>
          <Group spacing="xs">
            <IconApi size={20} />
            <Title order={4}>{t('integrations.auditLog.title', 'API Audit Log')}</Title>
          </Group>
          <Text size="sm" color="dimmed" mt={4}>
            {t('integrations.auditLog.desc', 'Recent API calls made by external clients like Paperback.')}
          </Text>
        </div>
        <Group spacing="xs">
          <Select
            size="xs"
            value={selectedUserId ?? ''}
            onChange={(v) => setSelectedUserId(v || null)}
            data={userOptions}
            label={t('integrations.auditLog.filterUser', 'User')}
            sx={{ width: 140 }}
          />
          <Select
            size="xs"
            value={limit}
            onChange={(v) => setLimit(v ?? '100')}
            data={limitOptions}
            label={t('integrations.auditLog.filterLimit', 'Rows')}
            sx={{ width: 80 }}
          />
          <Tooltip label={t('integrations.auditLog.refresh', 'Refresh')} withArrow>
            <ActionIcon
              mt={18}
              variant="light"
              color="indigo"
              onClick={() => logsQuery.refetch()}
              loading={logsQuery.isFetching}
            >
              <IconRefresh size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <ScrollArea>
        <Box sx={{ minWidth: 640 }}>
          {logsQuery.isLoading ? (
            <Stack spacing="xs">
              {Array.from({ length: 5 }).map((_, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <Skeleton key={i} height={32} radius="sm" />
              ))}
            </Stack>
          ) : (logsQuery.data?.length ?? 0) === 0 ? (
            <Text size="sm" color="dimmed" italic align="center" py="lg">
              {t('integrations.auditLog.empty', 'No API calls recorded yet.')}
            </Text>
          ) : (
            <Table fontSize="xs" highlightOnHover verticalSpacing="xs" sx={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={{ width: 160 }}>{t('integrations.auditLog.colDate', 'Date')}</th>
                  <th style={{ width: 60 }}>{t('integrations.auditLog.colMethod', 'Method')}</th>
                  <th>{t('integrations.auditLog.colPath', 'Path')}</th>
                  <th style={{ width: 100 }}>{t('integrations.auditLog.colUser', 'User')}</th>
                  <th>{t('integrations.auditLog.colAgent', 'Client')}</th>
                </tr>
              </thead>
              <tbody>
                {logsQuery.data?.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <Text size="xs" sx={{ whiteSpace: 'nowrap' }}>
                        {new Date(log.createdAt).toLocaleString()}
                      </Text>
                    </td>
                    <td>
                      <Badge size="xs" color={methodColor(log.method)} variant="light">
                        {log.method}
                      </Badge>
                    </td>
                    <td>
                      <Text size="xs" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                        {log.path}
                      </Text>
                    </td>
                    <td>
                      <Text size="xs" weight={600}>
                        {log.user.username}
                      </Text>
                    </td>
                    <td>
                      <Tooltip label={log.userAgent || '—'} withArrow multiline width={320}>
                        <Text size="xs" color="dimmed" sx={{ cursor: 'default' }}>
                          {uaLabel(log.userAgent)}
                        </Text>
                      </Tooltip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Box>
      </ScrollArea>

      <Text size="xs" color="dimmed" align="right">
        {t('integrations.auditLog.showing', 'Showing last {{count}} entries', { count: logsQuery.data?.length ?? 0 })}
      </Text>
    </Stack>
  );
}
