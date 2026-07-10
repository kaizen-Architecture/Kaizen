import {
  Box,
  Button,
  Card,
  Divider,
  Group,
  NumberInput,
  Stack,
  Text,
  TextInput,
  PasswordInput,
  ThemeIcon,
  Title,
  Alert,
  Badge,
  FileButton,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import {
  IconDatabase,
  IconDatabaseExport,
  IconUpload,
  IconCheck,
  IconAlertCircle,
  IconDeviceFloppy,
  IconLoader,
} from '@tabler/icons-react';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { trpc } from '../../utils/trpc';

export function DatabaseSettings() {
  const [connectionString, setConnectionString] = useState('');
  const [connectionLimit, setConnectionLimit] = useState<number>(25);
  const [poolTimeout, setPoolTimeout] = useState<number>(30);
  const [isRestoring, setIsRestoring] = useState(false);

  const dbConfig = trpc.settings.getDatabaseConfig.useQuery();
  const saveMutation = trpc.settings.saveDatabaseConfig.useMutation({
    onSuccess: () => {
      showNotification({
        title: 'Settings Saved',
        message: 'Database configuration has been saved. Please restart the Docker container to apply changes.',
        color: 'teal',
        icon: <IconCheck size={16} />,
      });
      dbConfig.refetch();
    },
    onError: (err) => {
      showNotification({
        title: 'Error Saving Settings',
        message: err.message,
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
    },
  });

  useEffect(() => {
    if (dbConfig.data) {
      setConnectionString(dbConfig.data.connectionString);
      setConnectionLimit(dbConfig.data.connectionLimit);
      setPoolTimeout(dbConfig.data.poolTimeout);
    }
  }, [dbConfig.data]);

  const handleSave = () => {
    saveMutation.mutate({
      connectionString,
      connectionLimit,
      poolTimeout,
    });
  };

  const handleExport = () => {
    try {
      showNotification({
        title: 'Export Starting',
        message: 'Preparing your structured database backup for download...',
        color: 'indigo',
        icon: <IconLoader className="animate-spin" size={16} />,
      });
      window.open('/api/v1/database/backup', '_blank');
    } catch (e) {
      showNotification({
        title: 'Export Failed',
        message: (e as Error).message,
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
    }
  };

  const handleRestore = async (file: File | null) => {
    if (!file) return;

    setIsRestoring(true);
    showNotification({
      title: 'Restoration Starting',
      message: 'Reading backup file and preparing schema restoration...',
      color: 'indigo',
      loading: true,
      autoClose: false,
      id: 'restore-notify',
    });

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const rawText = e.target?.result as string;
          const parsed = JSON.parse(rawText);

          if (!parsed.data) {
            throw new Error('Invalid backup file: Missing "data" key');
          }

          const response = await fetch('/api/v1/database/restore', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ data: parsed.data }),
          });

          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.error || 'Restore request failed');
          }

          showNotification({
            id: 'restore-notify',
            title: 'Database Restored Successfully',
            message: 'All records have been recovered. Reloading application to refresh workspace...',
            color: 'teal',
            icon: <IconCheck size={16} />,
            autoClose: 3000,
          });

          setTimeout(() => {
            window.location.reload();
          }, 2000);
        } catch (err) {
          showNotification({
            id: 'restore-notify',
            title: 'Restoration Failed',
            message: (err as Error).message,
            color: 'red',
            icon: <IconAlertCircle size={16} />,
            autoClose: 5000,
          });
        } finally {
          setIsRestoring(false);
        }
      };
      reader.readAsText(file);
    } catch (err) {
      showNotification({
        id: 'restore-notify',
        title: 'Failed to read file',
        message: (err as Error).message,
        color: 'red',
        icon: <IconAlertCircle size={16} />,
        autoClose: 5000,
      });
      setIsRestoring(false);
    }
  };

  if (dbConfig.isLoading) {
    return (
      <Group position="center" py="xl">
        <IconLoader className="animate-spin" size={32} />
        <Text size="sm" color="dimmed">
          Loading database configurations...
        </Text>
      </Group>
    );
  }

  return (
    <Stack spacing="xl">
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <Card withBorder padding="lg" radius="md">
          <Stack spacing="md">
            <Group spacing="sm">
              <ThemeIcon size={36} radius="md" color="indigo" variant="light">
                <IconDatabase size={20} />
              </ThemeIcon>
              <Box>
                <Title order={5}>Connection Settings</Title>
                <Text size="xs" color="dimmed">
                  Manage the PostgreSQL database parameters. Changes require container restart.
                </Text>
              </Box>
            </Group>

            <PasswordInput
              label="Database Connection URL"
              description="PostgreSQL connection string (e.g. postgresql://user:pass@host:5432/db)"
              value={connectionString}
              onChange={(e) => setConnectionString(e.currentTarget.value)}
              placeholder="postgresql://kaizoku:kaizoku@db:5432/kaizoku"
              radius="md"
            />

            <Group grow spacing="md">
              <NumberInput
                label="Connection Pool Limit"
                description="Max concurrent active database connections"
                value={connectionLimit}
                onChange={(val) => setConnectionLimit(val || 25)}
                min={1}
                max={200}
                radius="md"
              />

              <NumberInput
                label="Pool Timeout (seconds)"
                description="Max seconds to wait for a connection from the pool"
                value={poolTimeout}
                onChange={(val) => setPoolTimeout(val || 30)}
                min={1}
                max={600}
                radius="md"
              />
            </Group>

            <Alert icon={<IconAlertCircle size={16} />} color="yellow" radius="md">
              <Text size="xs">
                Modifying the connection URL or limits will write directly to `/config/database.json`. Make sure your
                Docker container has write permissions to `/config`.
              </Text>
            </Alert>

            <Group position="right">
              <Button
                leftIcon={<IconDeviceFloppy size={16} />}
                loading={saveMutation.isLoading}
                onClick={handleSave}
                radius="md"
              >
                Save Connection Configuration
              </Button>
            </Group>
          </Stack>
        </Card>
      </motion.div>

      <Divider label="Migration & Backup Management" labelPosition="center" />

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
      >
        <Group grow spacing="lg">
          <Card withBorder padding="lg" radius="md" sx={{ height: '100%' }}>
            <Stack justify="space-between" sx={{ height: '100%' }} spacing="md">
              <Stack spacing="xs">
                <Group spacing="sm">
                  <ThemeIcon size={36} radius="md" color="teal" variant="light">
                    <IconDatabaseExport size={20} />
                  </ThemeIcon>
                  <Title order={5}>Export Database Backup</Title>
                </Group>
                <Text size="xs" color="dimmed">
                  Generate and download a complete database backup in a structured, portable JSON format. This backup
                  contains libraries, mangas, chapters, and all configuration parameters, ideal for migrating to a fresh
                  Kaizen deployment.
                </Text>
              </Stack>
              <Button
                leftIcon={<IconDatabaseExport size={16} />}
                color="teal"
                variant="light"
                onClick={handleExport}
                radius="md"
                fullWidth
              >
                Export / Download Backup
              </Button>
            </Stack>
          </Card>

          <Card withBorder padding="lg" radius="md" sx={{ height: '100%' }}>
            <Stack justify="space-between" sx={{ height: '100%' }} spacing="md">
              <Stack spacing="xs">
                <Group spacing="sm">
                  <ThemeIcon size={36} radius="md" color="orange" variant="light">
                    <IconUpload size={20} />
                  </ThemeIcon>
                  <Title order={5}>Restore / Recover Backup</Title>
                </Group>
                <Text size="xs" color="dimmed">
                  Upload a previously exported JSON database backup file. <strong>Warning:</strong> This will completely
                  clean the current database tables and restore the records exactly as in the backup file. This
                  operation is atomic and irreversible.
                </Text>
              </Stack>

              <FileButton onChange={handleRestore} accept="application/json">
                {(props) => (
                  <Button
                    {...props}
                    leftIcon={<IconUpload size={16} />}
                    color="orange"
                    variant="light"
                    loading={isRestoring}
                    radius="md"
                    fullWidth
                  >
                    Upload & Restore Backup
                  </Button>
                )}
              </FileButton>
            </Stack>
          </Card>
        </Group>
      </motion.div>
    </Stack>
  );
}
