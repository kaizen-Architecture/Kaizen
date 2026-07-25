import { Accordion, Alert, Anchor, Badge, Box, Breadcrumbs, Button, Center, createStyles, Group, Image, Loader, Text, ThemeIcon } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { showNotification } from '@mantine/notifications';
import { IconAlertCircle, IconBook, IconCheck, IconDownload, IconUpload } from '@tabler/icons-react';
import { trpc } from '../../utils/trpc';
import { ArrayItem, SwitchItem, TextItem, PasswordItem } from './mangal';

const useStyles = createStyles((theme) => ({
  item: {
    '&': {
      paddingTop: theme.spacing.sm,
      marginTop: theme.spacing.sm,
      borderTop: `1px solid ${theme.colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[2]}`,
    },
  },

  switch: {
    '& *': {
      cursor: 'pointer',
    },
  },

  numberInput: {
    maxWidth: 60,
  },

  textInput: {
    maxWidth: 120,
  },

  title: {
    lineHeight: 1,
  },
}));

export function IntegrationSettings() {
  const { t } = useTranslation('settings');
  const { classes } = useStyles();
  const update = trpc.settings.update.useMutation();
  const settings = trpc.settings.query.useQuery();
  const testMutation = trpc.settings.testIntegration.useMutation();
  const syncMutation = trpc.settings.syncAniListProgress.useMutation();

  const handleUpdate = async (key: string, value: boolean | string | number | string[]) => {
    await update.mutateAsync({
      key,
      value,
      updateType: 'app',
    });
    await settings.refetch();
  };

  if (settings.isLoading) {
    return (
      <Center py="xl">
        <Loader size="md" color="indigo" />
      </Center>
    );
  }

  if (settings.isError || !settings.data) {
    return (
      <Alert icon={<IconAlertCircle size={16} />} title="Error loading integrations" color="red">
        {settings.error?.message || 'Failed to fetch settings from server.'}
      </Alert>
    );
  }

  return (
    <Accordion variant="contained">
      <Accordion.Item value="komga">
        <Accordion.Control icon={<Image src="/brand/komga.png" width={20} height={20} />}>Komga</Accordion.Control>
        <Accordion.Panel>
          <Group position="apart" className={classes.item} spacing="xl" noWrap>
            <Box>
              <Breadcrumbs
                separator="/"
                styles={{
                  separator: {
                    marginLeft: 4,
                    marginRight: 4,
                  },
                  breadcrumb: {
                    textTransform: 'capitalize',
                    fontSize: 13,
                    fontWeight: 500,
                  },
                  root: {
                    marginBottom: 5,
                  },
                }}
              >
                Enabled
              </Breadcrumbs>
              <Text size="xs" color="dimmed">
                Enable Komga integration to trigger library scan and metadata refresh tasks
              </Text>
            </Box>
            <SwitchItem
              configKey="komgaEnabled"
              onUpdate={handleUpdate}
              initialValue={settings.data.appConfig.komgaEnabled}
            />
          </Group>
          <Group position="apart" className={classes.item} spacing="xl" noWrap>
            <Box>
              <Breadcrumbs
                separator="/"
                styles={{
                  separator: {
                    marginLeft: 4,
                    marginRight: 4,
                  },
                  breadcrumb: {
                    textTransform: 'capitalize',
                    fontSize: 13,
                    fontWeight: 500,
                  },
                  root: {
                    marginBottom: 5,
                  },
                }}
              >
                Host
              </Breadcrumbs>
              <Text size="xs" color="dimmed">
                Komga host or ip
              </Text>
            </Box>
            <TextItem configKey="komgaHost" onUpdate={handleUpdate} initialValue={settings.data.appConfig.komgaHost} />
          </Group>
          <Group position="apart" className={classes.item} spacing="xl" noWrap>
            <Box>
              <Breadcrumbs
                separator="/"
                styles={{
                  separator: {
                    marginLeft: 4,
                    marginRight: 4,
                  },
                  breadcrumb: {
                    textTransform: 'capitalize',
                    fontSize: 13,
                    fontWeight: 500,
                  },
                  root: {
                    marginBottom: 5,
                  },
                }}
              >
                Email
              </Breadcrumbs>
              <Text size="xs" color="dimmed">
                Komga user
              </Text>
            </Box>
            <TextItem configKey="komgaUser" onUpdate={handleUpdate} initialValue={settings.data.appConfig.komgaUser} />
          </Group>
          <Group position="apart" className={classes.item} spacing="xl" noWrap>
            <Box>
              <Breadcrumbs
                separator="/"
                styles={{
                  separator: {
                    marginLeft: 4,
                    marginRight: 4,
                  },
                  breadcrumb: {
                    textTransform: 'capitalize',
                    fontSize: 13,
                    fontWeight: 500,
                  },
                  root: {
                    marginBottom: 5,
                  },
                }}
              >
                Password
              </Breadcrumbs>
              <Text size="xs" color="dimmed">
                Komga user password
              </Text>
            </Box>
            <PasswordItem
              configKey="komgaPassword"
              onUpdate={handleUpdate}
              initialValue={settings.data.appConfig.komgaPassword}
            />
          </Group>
        </Accordion.Panel>
      </Accordion.Item>

      <Accordion.Item value="kavita">
        <Accordion.Control icon={<Image src="/brand/kavita.png" width={20} height={20} />}>Kavita</Accordion.Control>
        <Accordion.Panel>
          <Group position="apart" className={classes.item} spacing="xl" noWrap>
            <Box>
              <Breadcrumbs
                separator="/"
                styles={{
                  separator: {
                    marginLeft: 4,
                    marginRight: 4,
                  },
                  breadcrumb: {
                    textTransform: 'capitalize',
                    fontSize: 13,
                    fontWeight: 500,
                  },
                  root: {
                    marginBottom: 5,
                  },
                }}
              >
                Enabled
              </Breadcrumbs>
              <Text size="xs" color="dimmed">
                Enable Kavita integration to trigger library scan and metadata refresh tasks
              </Text>
            </Box>
            <SwitchItem
              configKey="kavitaEnabled"
              onUpdate={handleUpdate}
              initialValue={settings.data.appConfig.kavitaEnabled}
            />
          </Group>
          <Group position="apart" className={classes.item} spacing="xl" noWrap>
            <Box>
              <Breadcrumbs
                separator="/"
                styles={{
                  separator: {
                    marginLeft: 4,
                    marginRight: 4,
                  },
                  breadcrumb: {
                    textTransform: 'capitalize',
                    fontSize: 13,
                    fontWeight: 500,
                  },
                  root: {
                    marginBottom: 5,
                  },
                }}
              >
                Host
              </Breadcrumbs>
              <Text size="xs" color="dimmed">
                Kavita host or ip
              </Text>
            </Box>
            <TextItem
              configKey="kavitaHost"
              onUpdate={handleUpdate}
              initialValue={settings.data.appConfig.kavitaHost}
            />
          </Group>
          <Group position="apart" className={classes.item} spacing="xl" noWrap>
            <Box>
              <Breadcrumbs
                separator="/"
                styles={{
                  separator: {
                    marginLeft: 4,
                    marginRight: 4,
                  },
                  breadcrumb: {
                    textTransform: 'capitalize',
                    fontSize: 13,
                    fontWeight: 500,
                  },
                  root: {
                    marginBottom: 5,
                  },
                }}
              >
                Username
              </Breadcrumbs>
              <Text size="xs" color="dimmed">
                Kavita user
              </Text>
            </Box>
            <TextItem
              configKey="kavitaUser"
              onUpdate={handleUpdate}
              initialValue={settings.data.appConfig.kavitaUser}
            />
          </Group>
          <Group position="apart" className={classes.item} spacing="xl" noWrap>
            <Box>
              <Breadcrumbs
                separator="/"
                styles={{
                  separator: {
                    marginLeft: 4,
                    marginRight: 4,
                  },
                  breadcrumb: {
                    textTransform: 'capitalize',
                    fontSize: 13,
                    fontWeight: 500,
                  },
                  root: {
                    marginBottom: 5,
                  },
                }}
              >
                Password
              </Breadcrumbs>
              <Text size="xs" color="dimmed">
                Kavita user password
              </Text>
            </Box>
            <PasswordItem
              configKey="kavitaPassword"
              onUpdate={handleUpdate}
              initialValue={settings.data.appConfig.kavitaPassword}
            />
          </Group>
          <Group position="apart" className={classes.item} spacing="xl" noWrap>
            <Box>
              <Breadcrumbs
                separator="/"
                styles={{
                  separator: {
                    marginLeft: 4,
                    marginRight: 4,
                  },
                  breadcrumb: {
                    textTransform: 'capitalize',
                    fontSize: 13,
                    fontWeight: 500,
                  },
                  root: {
                    marginBottom: 5,
                  },
                }}
              >
                Libraries
              </Breadcrumbs>
              <Text size="xs" color="dimmed">
                Scan specific Kavita libraries
              </Text>
            </Box>
            <ArrayItem
              configKey="kavitaLibraries"
              onUpdate={handleUpdate}
              initialValue={settings.data.appConfig.kavitaLibraries}
              itemName="Library"
            />
          </Group>
        </Accordion.Panel>
      </Accordion.Item>

      <Accordion.Item value="anilist">
        <Accordion.Control
          icon={
            <ThemeIcon color="blue" variant="light" size={24} radius="xl">
              <IconBook size={14} />
            </ThemeIcon>
          }
        >
          <Group spacing="xs">
            <Text fw={500}>{t('integrations.anilist.title', 'AniList Read Progress Sync')}</Text>
            {settings.data.appConfig.anilistEnabled && settings.data.appConfig.anilistUsername && (
              <Badge color="blue" size="xs" variant="filled">
                @{settings.data.appConfig.anilistUsername}
              </Badge>
            )}
          </Group>
        </Accordion.Control>
        <Accordion.Panel>
          <Text size="xs" color="dimmed" mb="md">
            {t('integrations.anilist.description')}
          </Text>

          <Group position="apart" className={classes.item} spacing="xl" noWrap>
            <Box>
              <Breadcrumbs
                separator="/"
                styles={{
                  separator: { marginLeft: 4, marginRight: 4 },
                  breadcrumb: { textTransform: 'capitalize', fontSize: 13, fontWeight: 500 },
                  root: { marginBottom: 5 },
                }}
              >
                {t('integrations.anilist.enabledLabel')}
              </Breadcrumbs>
              <Text size="xs" color="dimmed">
                {t('integrations.anilist.enabledDesc')}
              </Text>
            </Box>
            <SwitchItem
              configKey="anilistEnabled"
              onUpdate={handleUpdate}
              initialValue={settings.data.appConfig.anilistEnabled}
            />
          </Group>

          <Group position="apart" className={classes.item} spacing="xl" noWrap>
            <Box>
              <Breadcrumbs
                separator="/"
                styles={{
                  separator: { marginLeft: 4, marginRight: 4 },
                  breadcrumb: { textTransform: 'capitalize', fontSize: 13, fontWeight: 500 },
                  root: { marginBottom: 5 },
                }}
              >
                {t('integrations.anilist.clientIdLabel', 'Client ID (Optional)')}
              </Breadcrumbs>
              <Text size="xs" color="dimmed">
                {t('integrations.anilist.clientIdDesc', 'Your own custom AniList API Client ID from Developer Settings')}
              </Text>
            </Box>
            <TextItem
              configKey="anilistClientId"
              onUpdate={handleUpdate}
              initialValue={settings.data.appConfig.anilistClientId || ''}
            />
          </Group>

          <Group position="apart" className={classes.item} spacing="xl" noWrap>
            <Box>
              <Breadcrumbs
                separator="/"
                styles={{
                  separator: { marginLeft: 4, marginRight: 4 },
                  breadcrumb: { textTransform: 'capitalize', fontSize: 13, fontWeight: 500 },
                  root: { marginBottom: 5 },
                }}
              >
                {t('integrations.anilist.tokenLabel')}
              </Breadcrumbs>
              <Text size="xs" color="dimmed">
                {t('integrations.anilist.tokenDesc')}{' '}
                <Anchor
                  href={`https://anilist.co/api/v2/oauth/authorize?client_id=${
                    settings.data.appConfig.anilistClientId?.trim() || '26692'
                  }&response_type=token`}
                  target="_blank"
                  rel="noopener noreferrer"
                  size="xs"
                >
                  {t('integrations.anilist.getTokenLink')}
                </Anchor>
              </Text>
            </Box>
            <PasswordItem
              configKey="anilistToken"
              onUpdate={handleUpdate}
              initialValue={settings.data.appConfig.anilistToken || ''}
            />
          </Group>

          <Group position="apart" className={classes.item} spacing="xl" noWrap>
            <Box>
              <Breadcrumbs
                separator="/"
                styles={{
                  separator: { marginLeft: 4, marginRight: 4 },
                  breadcrumb: { textTransform: 'capitalize', fontSize: 13, fontWeight: 500 },
                  root: { marginBottom: 5 },
                }}
              >
                {t('integrations.anilist.autoSyncLabel')}
              </Breadcrumbs>
              <Text size="xs" color="dimmed">
                {t('integrations.anilist.autoSyncDesc')}
              </Text>
            </Box>
            <SwitchItem
              configKey="anilistAutoSync"
              onUpdate={handleUpdate}
              initialValue={settings.data.appConfig.anilistAutoSync}
            />
          </Group>

          <Group position="apart" className={classes.item} pt="md">
            <Group spacing="sm">
              <Button
                size="xs"
                variant="light"
                color="blue"
                loading={testMutation.isLoading}
                onClick={async () => {
                  try {
                    const res = await testMutation.mutateAsync({
                      type: 'anilist',
                      customToken: settings.data.appConfig.anilistToken || undefined,
                    });
                    if (res.status === 'healthy' && res.username) {
                      await handleUpdate('anilistUsername', res.username);
                      showNotification({
                        title: t('integrations.anilist.testSuccessTitle'),
                        message: t('integrations.anilist.testSuccessMsg', { username: res.username }),
                        color: 'teal',
                        icon: <IconCheck size={16} />,
                      });
                    } else {
                      showNotification({
                        title: t('integrations.anilist.testFailedTitle'),
                        message: res.message || 'Error connecting to AniList',
                        color: 'red',
                      });
                    }
                  } catch (err: any) {
                    showNotification({
                      title: t('integrations.anilist.testFailedTitle'),
                      message: err?.message || 'Connection test failed',
                      color: 'red',
                    });
                  }
                }}
              >
                {t('integrations.anilist.testBtn')}
              </Button>

              <Button
                size="xs"
                variant="outline"
                color="teal"
                leftIcon={<IconDownload size={14} />}
                loading={syncMutation.isLoading}
                disabled={!settings.data.appConfig.anilistEnabled || !settings.data.appConfig.anilistUsername}
                onClick={async () => {
                  try {
                    const res = await syncMutation.mutateAsync({ mode: 'import' });
                    showNotification({
                      title: t('integrations.anilist.syncSuccessTitle', 'Sync Complete'),
                      message: res.message,
                      color: 'teal',
                      icon: <IconCheck size={16} />,
                    });
                    await settings.refetch();
                  } catch (err: any) {
                    showNotification({
                      title: t('integrations.anilist.syncFailedTitle', 'Sync Failed'),
                      message: err?.message || 'Failed to import progress from AniList',
                      color: 'red',
                    });
                  }
                }}
              >
                {t('integrations.anilist.importBtn', 'Import Progress from AniList')}
              </Button>

              <Button
                size="xs"
                variant="outline"
                color="indigo"
                leftIcon={<IconUpload size={14} />}
                loading={syncMutation.isLoading}
                disabled={!settings.data.appConfig.anilistEnabled || !settings.data.appConfig.anilistUsername}
                onClick={async () => {
                  try {
                    const res = await syncMutation.mutateAsync({ mode: 'export' });
                    showNotification({
                      title: t('integrations.anilist.syncSuccessTitle', 'Sync Complete'),
                      message: res.message,
                      color: 'teal',
                      icon: <IconCheck size={16} />,
                    });
                  } catch (err: any) {
                    showNotification({
                      title: t('integrations.anilist.syncFailedTitle', 'Sync Failed'),
                      message: err?.message || 'Failed to export progress to AniList',
                      color: 'red',
                    });
                  }
                }}
              >
                {t('integrations.anilist.exportBtn', 'Export Progress to AniList')}
              </Button>

              {settings.data.appConfig.anilistUsername && (
                <Text size="xs" color="dimmed">
                  {t('integrations.anilist.usernameLabel')}: <strong>@{settings.data.appConfig.anilistUsername}</strong>
                </Text>
              )}
            </Group>
          </Group>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
