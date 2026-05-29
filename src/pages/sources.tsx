import {
  Badge,
  Button,
  Container,
  Group,
  Paper,
  Stack,
  Text,
  Title,
  ActionIcon,
  Tooltip,
  LoadingOverlay,
  Box,
  SimpleGrid,
  Avatar,
  Divider,
  Switch,
} from '@mantine/core';
import React from 'react';
import { showNotification } from '@mantine/notifications';
import {
  IconCheck,
  IconTrash,
  IconX,
  IconRefresh,
  IconPlus,
  IconPower,
  IconCloudDownload,
  IconBrandGithub,
  IconAlertTriangle,
} from '@tabler/icons-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { trpc } from '../utils/trpc';

const getFavicon = (name: string) => {
  if (name.includes(' ') || name.includes('_') || name.includes('-')) {
    return null;
  }
  const domain = `${name.toLowerCase()}.com`;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
};

const KAIZEN_FALLBACK_LOGO =
  'https://raw.githubusercontent.com/kaizen-Architecture/Kaizen/main/public/logo.png';

export default function SourcesPage() {
  const { t } = useTranslation(['common', 'sources']);
  const sourcesQuery = trpc.sources.list.useQuery();
  const syncMutation = trpc.sources.sync.useMutation();
  const syncKaizenMutation = trpc.sources.syncKaizen.useMutation();
  const uploadMutation = trpc.sources.upload.useMutation();
  const toggleMutation = trpc.sources.toggle.useMutation();
  const removeMutation = trpc.sources.remove.useMutation();
  const utils = trpc.useContext();

  const handleSyncKaizen = async () => {
    try {
      await syncKaizenMutation.mutateAsync();
      showNotification({
        title: t('sources:syncKaizen.status'),
        message: t('sources:syncKaizen.description'),
        color: 'teal',
        icon: <IconCheck size={18} />,
      });
      utils.sources.list.refetch();
    } catch (err: any) {
      showNotification({
        title: t('common.error'),
        message: err.message || t('sources:notifications.error'),
        color: 'red',
        icon: <IconX size={18} />,
      });
    }
  };

  const handleSync = async () => {
    try {
      await syncMutation.mutateAsync();
      showNotification({
        title: t('sources:sync.status'),
        message: t('sources:sync.description'),
        color: 'teal',
        icon: <IconCheck size={18} />,
      });
      utils.sources.list.refetch();
    } catch (err: any) {
      showNotification({
        title: t('common.error'),
        message: err.message || t('sources:notifications.error'),
        color: 'red',
        icon: <IconX size={18} />,
      });
    }
  };

  const handleManualUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.lua';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        const content = event.target?.result as string;
        try {
          await uploadMutation.mutateAsync({ name: file.name, content });
          showNotification({
            title: t('sources:notifications.activated'),
            message: t('sources:notifications.activated'),
            color: 'teal',
            icon: <IconCheck size={18} />,
          });
          utils.sources.list.refetch();
        } catch (err) {
          showNotification({
            title: t('common.error'),
            message: t('sources:notifications.error'),
            color: 'red',
          });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleToggle = async (name: string, activate: boolean, isFailed?: boolean) => {
    try {
      await toggleMutation.mutateAsync({ name, activate, isFailed });
      showNotification({
        title: activate ? t('sources:notifications.activated') : t('sources:notifications.deactivated'),
        message: activate ? t('sources:notifications.activated') : t('sources:notifications.deactivated'),
        color: activate ? 'teal' : 'gray',
        icon: <IconPower size={18} />,
      });
      utils.sources.list.refetch();
    } catch (err) {
      showNotification({
        title: t('common.error'),
        message: t('sources.notifications.toggleError'),
        color: 'red',
      });
    }
  };

  const handleRemove = async (name: string, isActive: boolean, isFailed?: boolean) => {
    if (!window.confirm(t('sources:confirmRemove', { name }) as string)) return;

    try {
      await removeMutation.mutateAsync({ name, isActive, isFailed });
      showNotification({
        title: t('sources:notifications.removed'),
        message: t('sources:notifications.removed'),
        color: 'teal',
        icon: <IconCheck size={18} />,
      });
      utils.sources.list.refetch();
    } catch (err) {
      showNotification({
        title: t('common.error'),
        message: t('sources:notifications.error'),
        color: 'red',
      });
    }
  };

  if (sourcesQuery.isLoading) return <LoadingOverlay visible />;

  const sources = sourcesQuery.data || [];
  const officialSources = sources.filter((s) => s.origin === 'OFFICIAL' && !s.isFailed);
  const githubSources = sources.filter((s) => s.origin === 'GITHUB' && !s.isFailed);
  const localSources = sources.filter((s) => (s.origin === 'LOCAL' || !s.origin) && !s.isFailed);
  const failedSources = sources.filter((s) => s.isFailed);

  function SourceCard({ source }: { source: any }) {
    const [imgError, setImgError] = React.useState(false);
    const faviconUrl = getFavicon(source.name);

    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
      >
        <Paper
          withBorder
          p="xs"
          radius="md"
          sx={(theme) => ({
            backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
            opacity: source.isActive ? 1 : 0.6,
            transition: 'all 0.2s ease',
            '&:hover': {
              boxShadow: theme.shadows.md,
              borderColor: source.isFailed
                ? theme.colors.red[4]
                : source.isActive
                ? theme.colors.indigo[4]
                : theme.colors.gray[4],
            },
          })}
        >
          <Group position="apart" noWrap>
            <Group spacing="sm" sx={{ flex: 1 }}>
              <Avatar
                src={imgError || !faviconUrl ? KAIZEN_FALLBACK_LOGO : faviconUrl}
                size="sm"
                radius="xl"
                styles={{ placeholder: { backgroundColor: 'transparent' } }}
                imageProps={{
                  onError: () => setImgError(true),
                }}
              >
                {source.name[0]}
              </Avatar>
              <Stack spacing={0} sx={{ overflow: 'hidden' }}>
                <Text
                  weight={600}
                  size="sm"
                  sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  {source.name}
                </Text>
                <Group spacing={4}>
                  <Badge
                    size="xs"
                    variant="outline"
                    color={source.origin === 'GITHUB' ? 'blue' : 'gray'}
                    sx={{ width: 'fit-content' }}
                  >
                    {source.origin || 'LOCAL'}
                  </Badge>
                  {source.isFailed && (
                    <Badge color="red" variant="filled" size="xs">
                      {t('sources.failed')}
                    </Badge>
                  )}
                </Group>
              </Stack>
            </Group>

            <Group spacing={4} noWrap>
              {source.isFailed ? (
                <Tooltip label={t('sources.reactivate')}>
                  <Button
                    size="xs"
                    variant="light"
                    color="indigo"
                    onClick={() => handleToggle(source.name, true, true)}
                  >
                    {t('sources.reactivate')}
                  </Button>
                </Tooltip>
              ) : (
                <Tooltip label={source.isActive ? t('common.deactivate') : t('common.activate')}>
                  <Switch
                    size="xs"
                    checked={source.isActive}
                    onChange={(e) => handleToggle(source.name, e.currentTarget.checked)}
                    color="indigo"
                  />
                </Tooltip>
              )}
              <Tooltip label={t('common.delete')}>
                <ActionIcon
                  color="red"
                  variant="subtle"
                  size="sm"
                  onClick={() => handleRemove(source.name, source.isActive, source.isFailed)}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
        </Paper>
      </motion.div>
    );
  }

  return (
    <Container size="xl" py="md">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Group position="apart" mb="xl">
          <Stack spacing={0}>
            <Title order={2}>{t('sources:title')}</Title>
            <Text size="sm" color="dimmed">
              {t('sources:description')}
            </Text>
          </Stack>
          <Group>
            <Button
              leftIcon={<IconCloudDownload size={18} />}
              variant="outline"
              color="teal"
              loading={syncKaizenMutation.isLoading}
              onClick={handleSyncKaizen}
            >
              {t('sources:syncKaizen.button')}
            </Button>
            <Button
              leftIcon={<IconCloudDownload size={18} />}
              variant="outline"
              color="indigo"
              loading={syncMutation.isLoading}
              onClick={handleSync}
            >
              {t('sources:sync.button')}
            </Button>
            <Button
              leftIcon={<IconPlus size={18} />}
              variant="filled"
              color="indigo"
              onClick={handleManualUpload}
              loading={uploadMutation.isLoading}
            >
              {t('sources:manualUpload')}
            </Button>
          </Group>
        </Group>
      </motion.div>

      <Stack spacing="xl">
        {failedSources.length > 0 && (
          <Stack spacing="md">
            <Group spacing="xs">
              <IconAlertTriangle size={20} color="red" />
              <Title order={4} color="red">
                {t('sources.failedSources')}
              </Title>
              <Badge color="red" variant="filled">
                {failedSources.length}
              </Badge>
            </Group>
            <Divider variant="dashed" color="red" />
            <SimpleGrid
              cols={3}
              spacing="md"
              breakpoints={[
                { maxWidth: 'md', cols: 2 },
                { maxWidth: 'sm', cols: 1 },
              ]}
            >
              <AnimatePresence>
                {failedSources.map((source) => (
                  <SourceCard key={source.name} source={source} />
                ))}
              </AnimatePresence>
            </SimpleGrid>
          </Stack>
        )}

        {officialSources.length > 0 && (
          <Stack spacing="md">
            <Group spacing="xs">
              <IconCloudDownload size={20} color="teal" />
              <Title order={4}>{t('sources:official.title')}</Title>
              <Badge color="teal" variant="filled">
                {officialSources.length}
              </Badge>
            </Group>
            <Divider variant="dashed" color="teal" />
            <SimpleGrid
              cols={3}
              spacing="md"
              breakpoints={[
                { maxWidth: 'md', cols: 2 },
                { maxWidth: 'sm', cols: 1 },
              ]}
            >
              <AnimatePresence>
                {officialSources.map((source) => (
                  <SourceCard key={source.name} source={source} />
                ))}
              </AnimatePresence>
            </SimpleGrid>
          </Stack>
        )}

        {githubSources.length > 0 && (
          <Stack spacing="md">
            <Group spacing="xs">
              <IconBrandGithub size={20} />
              <Title order={4}>GitHub Sync</Title>
              <Badge color="blue" variant="filled">
                {githubSources.length}
              </Badge>
            </Group>
            <Divider variant="dashed" />
            <SimpleGrid
              cols={3}
              spacing="md"
              breakpoints={[
                { maxWidth: 'md', cols: 2 },
                { maxWidth: 'sm', cols: 1 },
              ]}
            >
              <AnimatePresence>
                {githubSources.map((source) => (
                  <SourceCard key={source.name} source={source} />
                ))}
              </AnimatePresence>
            </SimpleGrid>
          </Stack>
        )}

        <Stack spacing="md">
          <Group spacing="xs">
            <IconPlus size={20} />
            <Title order={4}>Local / Manual</Title>
            <Badge color="gray" variant="filled">
              {localSources.length}
            </Badge>
          </Group>
          <Divider variant="dashed" />
          <SimpleGrid
            cols={3}
            spacing="md"
            breakpoints={[
              { maxWidth: 'md', cols: 2 },
              { maxWidth: 'sm', cols: 1 },
            ]}
          >
            <AnimatePresence>
              {localSources.map((source) => (
                <SourceCard key={source.name} source={source} />
              ))}
            </AnimatePresence>
          </SimpleGrid>
          {localSources.length === 0 && githubSources.length === 0 && officialSources.length === 0 && failedSources.length === 0 && (
            <Text size="sm" color="dimmed" align="center" py="xl">
              {t('sources:noSources')}
            </Text>
          )}
        </Stack>
      </Stack>
    </Container>
  );
}

export async function getServerSideProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ['common', 'sources', 'settings'])),
    },
  };
}
