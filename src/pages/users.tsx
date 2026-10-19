import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Container,
  Grid,
  Group,
  Paper,
  PasswordInput,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Select,
  MultiSelect,
  Switch,
} from '@mantine/core';
import { useModals } from '@mantine/modals';
import { showNotification } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconKey,
  IconPlus,
  IconShieldLock,
  IconTrash,
  IconUserPlus,
  IconBook,
  IconBell,
  IconBrandWhatsapp,
  IconBrandDiscord,
  IconBrandTelegram,
} from '@tabler/icons-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'next-i18next';
import React, { useState } from 'react';
import { trpc } from '../utils/trpc';
import { UserSettingsModal } from '../components/user/UserSettingsModal';

export default function UsersPage() {
  const { t } = useTranslation('settings');
  const modals = useModals();

  const users = trpc.auth.getUsers.useQuery();
  const isDefaultPasswordQuery = trpc.auth.checkAdminDefaultPassword.useQuery();
  const librariesQuery = trpc.library.list.useQuery();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const updateSettingsMutation = trpc.auth.updateUserSettings.useMutation({
    onSuccess: () => {
      users.refetch();
    },
  });

  const updateLibrariesMutation = trpc.auth.updateUserLibraries.useMutation({
    onSuccess: () => {
      users.refetch();
      showNotification({
        title: t('users.libraries.updatedTitle', 'Libraries Updated'),
        message: t('users.libraries.updatedDesc', 'User libraries updated successfully.'),
        color: 'teal',
        icon: <IconCheck size={18} />,
      });
    },
    onError: (err) => {
      showNotification({
        title: t('common.error', 'Error'),
        message: err.message,
        color: 'red',
      });
    },
  });

  const handleCopyToken = (token: string) => {
    const showSuccess = () => {
      showNotification({
        title: t('users.notifications.tokenCopiedTitle', 'Token Copied'),
        message: t('users.notifications.tokenCopiedDesc', 'The token has been copied to the clipboard.'),
        color: 'teal',
        icon: <IconCheck size={18} />,
      });
    };

    const fallbackCopy = (text: string) => {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.top = '0';
      textArea.style.left = '0';
      textArea.style.position = 'fixed';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        const successful = document.execCommand('copy');
        if (successful) {
          showSuccess();
        } else {
          throw new Error('execCommand returned false');
        }
      } catch (err) {
        console.error('Fallback copy failed', err);
        showNotification({
          title: t('common.error', 'Error'),
          message: t('users.notifications.tokenCopyFailed', 'Could not copy token to clipboard.'),
          color: 'red',
        });
      }
      document.body.removeChild(textArea);
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(token)
        .then(showSuccess)
        .catch(() => fallbackCopy(token));
    } else {
      fallbackCopy(token);
    }
  };

  // Formularios de Estado
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');

  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'SUPERADMIN' | 'MANAGER' | 'READER' | 'SERVICE'>('MANAGER');

  const updateRoleMutation = trpc.auth.updateUserRole.useMutation({
    onSuccess: () => {
      users.refetch();
      showNotification({
        title: t('users.notifications.roleUpdatedTitle', 'Role Updated'),
        message: t('users.notifications.roleUpdatedDesc', 'User role has been successfully updated.'),
        color: 'teal',
        icon: <IconCheck size={18} />,
      });
    },
    onError: (err) => {
      showNotification({
        title: t('common.error', 'Error'),
        message: err.message,
        color: 'red',
      });
    },
  });

  const updatePasswordMutation = trpc.auth.updateUserPassword.useMutation({
    onSuccess: () => {
      isDefaultPasswordQuery.refetch();
      showNotification({
        title: t('users.notifications.passwordUpdatedTitle', 'Password Updated'),
        message: t(
          'users.notifications.passwordUpdatedDesc',
          'Admin password has been changed successfully.',
        ),
        color: 'teal',
        icon: <IconCheck size={18} />,
      });
      setAdminNewPassword('');
      setAdminConfirmPassword('');
    },
    onError: (err) => {
      showNotification({
        title: t('common.error', 'Error'),
        message: err.message,
        color: 'red',
      });
    },
  });

  const showTokenModal = (token: string) => {
    modals.openModal({
      title: t('users.list.tokenModal.title', 'API Token Generated'),
      centered: true,
      children: (
        <Stack spacing="md">
          <Text size="sm">
            {t(
              'users.list.tokenModal.description',
              'Please copy this token now. For security reasons, it will not be shown again.',
            )}
          </Text>
          <Paper
            withBorder
            p="xs"
            radius="xs"
            sx={{
              background: 'rgba(0, 0, 0, 0.02)',
              fontFamily: 'monospace',
              fontSize: 13,
              wordBreak: 'break-all',
              userSelect: 'all',
            }}
          >
            {token}
          </Paper>
          <Button
            color="violet"
            leftIcon={<IconCopy size={16} />}
            onClick={() => {
              handleCopyToken(token);
              modals.closeAll();
            }}
          >
            {t('users.list.copyToken', 'Copy Token')}
          </Button>
        </Stack>
      ),
    });
  };

  const generateTokenMutation = trpc.auth.generateApiToken.useMutation({
    onSuccess: (data) => {
      users.refetch();
      showNotification({
        title: t('users.notifications.tokenGeneratedTitle', 'Token Generated'),
        message: t('users.notifications.tokenGeneratedDesc', 'The API Token was successfully generated.'),
        color: 'teal',
        icon: <IconCheck size={18} />,
      });
      if (data?.apiToken) {
        showTokenModal(data.apiToken);
      }
    },
    onError: (err) => {
      showNotification({
        title: t('users.notifications.tokenErrorTitle', 'Error Generating Token'),
        message: err.message,
        color: 'red',
      });
    },
  });

  const createUser = trpc.auth.createUser.useMutation({
    onSuccess: () => {
      users.refetch();
      showNotification({
        title: t('users.notifications.userCreatedTitle', 'User Created'),
        message: t('users.notifications.userCreatedDesc', 'The new user account has been successfully registered.'),
        color: 'teal',
        icon: <IconCheck size={18} />,
      });
      setNewUsername('');
      setNewPassword('');
    },
    onError: (err) => {
      showNotification({
        title: t('common.error', 'Error'),
        message: err.message,
        color: 'red',
      });
    },
  });

  const deleteUser = trpc.auth.deleteUser.useMutation({
    onSuccess: () => {
      users.refetch();
      showNotification({
        title: t('users.notifications.userDeletedTitle', 'Account Deleted'),
        message: t('users.notifications.userDeletedDesc', 'User access has been permanently revoked.'),
        color: 'teal',
        icon: <IconCheck size={18} />,
      });
    },
    onError: (err) => {
      showNotification({
        title: t('common.error', 'Error'),
        message: err.message,
        color: 'red',
      });
    },
  });

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminNewPassword) return;
    if (adminNewPassword !== adminConfirmPassword) {
      showNotification({
        title: t('users.adminPassword.mismatchTitle', 'Passwords Do Not Match'),
        message: t(
          'users.adminPassword.mismatchDesc',
          'Please ensure both password fields match exactly.',
        ),
        color: 'orange',
      });
      return;
    }

    const adminAccount = users.data?.find((u) => u.username === 'admin');
    if (!adminAccount) {
      showNotification({
        title: t('common.error', 'Error'),
        message: t('users.adminPassword.notFound', 'Could not locate the main administrator account.'),
        color: 'red',
      });
      return;
    }

    updatePasswordMutation.mutate({ id: adminAccount.id, newPassword: adminNewPassword });
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newPassword) return;
    createUser.mutate({ username: newUsername, password: newPassword, role: newRole });
  };

  const confirmDelete = (userId: number, username: string) => {
    modals.openConfirmModal({
      title: t('users.delete.confirmTitle', 'Confirm Account Deletion'),
      children: (
        <Text size="sm">
          {t(
            'users.delete.confirmDesc',
            'Are you completely sure you want to revoke and delete access for user {{username}}?',
            { username },
          )}
        </Text>
      ),
      labels: {
        confirm: t('users.delete.confirmButton', 'Delete'),
        cancel: t('users.delete.cancelButton', 'Cancel'),
      },
      confirmProps: { color: 'red' },
      onConfirm: () => deleteUser.mutate({ id: userId }),
    });
  };

  return (
    <Container size="xl" py="md">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Stack spacing="xs" mb="xl">
          <Group spacing="xs">
            <IconShieldLock size={28} style={{ color: '#8B5CF6' }} />
            <Title order={2}>{t('users.title', 'Accounts Center & Access Control')}</Title>
          </Group>
          <Text size="sm" color="dimmed">
            {t(
              'users.description',
              'Manage security and authorization levels for all users of the Kaizen platform.',
            )}
          </Text>
        </Stack>
      </motion.div>

      {isDefaultPasswordQuery.data === true && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Alert icon={<IconAlertTriangle size={20} />} color="orange" radius="md" variant="filled" mb="xl">
            <Text size="sm" weight={700}>
              {t('users.defaultPasswordAlert.title', 'Warning! Default Admin Password Active')}
            </Text>
            <Text size="xs" mt={2}>
              {t(
                'users.defaultPasswordAlert.desc',
                'We have detected that your main admin account is still using the default password. For absolute security, please change it now using the form below.',
              )}
            </Text>
          </Alert>
        </motion.div>
      )}

      <Stack spacing="lg">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.1 }}>
          <Paper
            withBorder
            p="lg"
            radius="md"
            shadow="sm"
            sx={{ borderColor: isDefaultPasswordQuery.data ? '#F97316' : undefined }}
          >
            <Group spacing="sm" mb="md">
              <IconKey size={20} style={{ color: '#8B5CF6' }} />
              <Title order={4}>
                {t('users.adminPassword.title', 'Update Main Admin Password')}
              </Title>
            </Group>
            <Text size="xs" color="dimmed" mb="md">
              {t(
                'users.adminPassword.desc',
                'Change the password of the root admin account to secure downloader settings.',
              )}
            </Text>

            <form onSubmit={handlePasswordSubmit}>
              <Grid align="flex-end" gutter="md">
                <Grid.Col xs={12} md={4}>
                  <PasswordInput
                    size="sm"
                    label={t('users.adminPassword.newPassword', 'New Password')}
                    placeholder={t('users.adminPassword.newPasswordPlaceholder', 'Enter secure new password')}
                    value={adminNewPassword}
                    onChange={(e) => setAdminNewPassword(e.currentTarget.value)}
                    required
                  />
                </Grid.Col>
                <Grid.Col xs={12} md={4}>
                  <PasswordInput
                    size="sm"
                    label={t('users.adminPassword.confirmPassword', 'Confirm Password')}
                    placeholder={t('users.adminPassword.confirmPasswordPlaceholder', 'Re-enter password')}
                    value={adminConfirmPassword}
                    onChange={(e) => setAdminConfirmPassword(e.currentTarget.value)}
                    required
                  />
                </Grid.Col>
                <Grid.Col xs={12} md={4}>
                  <Button type="submit" size="sm" fullWidth color="violet" loading={updatePasswordMutation.isLoading}>
                    {t('users.adminPassword.saveButton', 'Save Password')}
                  </Button>
                </Grid.Col>
              </Grid>
            </form>
          </Paper>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.2 }}>
          <Paper withBorder p="lg" radius="md" shadow="sm">
            <Group spacing="sm" mb="md">
              <IconUserPlus size={20} style={{ color: '#8B5CF6' }} />
              <Title order={4}>{t('users.management.title', 'Local User Management')}</Title>
            </Group>
            <Text size="xs" color="dimmed" mb="md">
              {t(
                'users.management.desc',
                'Create sub-accounts with specific access roles: Admin (full control), Manager (downloads & library) or Reader (read-only library access).',
              )}
            </Text>

            <Box
              p="md"
              mb="lg"
              sx={{
                background: 'rgba(139, 92, 246, 0.04)',
                borderRadius: 8,
                border: '1px solid rgba(139, 92, 246, 0.12)',
              }}
            >
              <Text size="xs" weight={600} color="violet" mb="xs">
                {t('users.management.addAccount', 'Add New Account')}
              </Text>
              <form onSubmit={handleCreateSubmit}>
                <Grid align="flex-end" gutter="md">
                  <Grid.Col xs={12} sm={6} md={3}>
                    <TextInput
                      size="sm"
                      label={t('users.management.username', 'Username')}
                      placeholder={t('users.management.usernamePlaceholder', 'e.g., editor')}
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.currentTarget.value)}
                      required
                    />
                  </Grid.Col>
                  <Grid.Col xs={12} sm={6} md={3}>
                    <PasswordInput
                      size="sm"
                      label={t('users.management.password', 'Password')}
                      placeholder="••••••••"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.currentTarget.value)}
                      required
                    />
                  </Grid.Col>
                  <Grid.Col xs={12} sm={6} md={3}>
                    <Text size="xs" weight={500} mb={5} sx={{ fontSize: 12 }}>
                      {t('users.management.role', 'Permissions Level')}
                    </Text>
                    <SegmentedControl
                      size="sm"
                      fullWidth
                      value={newRole}
                      onChange={(val: any) => setNewRole(val)}
                      data={[
                        { value: 'SUPERADMIN', label: t('users.roles.superadmin', 'Admin') },
                        { value: 'MANAGER', label: t('users.roles.manager', 'Manager') },
                        { value: 'READER', label: t('users.roles.reader', 'Reader') },
                        { value: 'SERVICE', label: t('users.roles.service', 'Service') },
                      ]}
                    />
                  </Grid.Col>
                  <Grid.Col xs={12} sm={6} md={3}>
                    <Button
                      type="submit"
                      size="sm"
                      fullWidth
                      color="violet"
                      leftIcon={<IconPlus size={14} />}
                      loading={createUser.isLoading}
                    >
                      {t('users.management.addButton', 'Add User')}
                    </Button>
                  </Grid.Col>
                </Grid>
              </form>
            </Box>

            <Text size="sm" weight={600} mb="xs">
              {t('users.list.title', 'Active Registered Users')}
            </Text>
            <Box sx={{ overflowX: 'auto' }}>
              <Table
                fontSize="sm"
                highlightOnHover
                verticalSpacing="sm"
                sx={{
                  minWidth: 1000,
                  '& th': { whiteSpace: 'nowrap' },
                  '& td': { whiteSpace: 'nowrap' },
                }}
              >
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>{t('users.list.id', 'ID')}</th>
                    <th>{t('users.list.username', 'User')}</th>
                    <th>{t('users.list.role', 'Assigned Role')}</th>
                    <th style={{ minWidth: 200 }}>{t('users.list.libraries', 'Assigned Libraries')}</th>
                    <th style={{ minWidth: 150 }}>{t('users.list.notifications', 'Notifications')}</th>
                    <th>{t('users.list.integrations', 'Integrations')}</th>
                    <th>{t('users.list.apiToken', 'API Token')}</th>
                    <th>{t('users.list.lastActiveAt', 'Last API Activity')}</th>
                    <th style={{ width: 100, textAlign: 'right' }}>{t('users.list.actions', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.data?.map((u) => (
                    <tr key={u.id}>
                      <td>{u.id}</td>
                      <td style={{ fontWeight: 600 }}>{u.username}</td>
                      <td>
                        {u.username === 'admin' ? (
                          <Badge color="violet" variant="light">
                            {t('users.roles.superadmin', 'Admin')}
                          </Badge>
                        ) : (
                          <Select
                            size="xs"
                            value={u.role}
                            onChange={(val: any) => {
                              if (val) {
                                updateRoleMutation.mutate({ id: u.id, role: val });
                              }
                            }}
                            disabled={updateRoleMutation.isLoading}
                            data={[
                              { value: 'SUPERADMIN', label: t('users.roles.superadmin', 'Admin') },
                              { value: 'MANAGER', label: t('users.roles.manager', 'Manager') },
                              { value: 'READER', label: t('users.roles.reader', 'Reader') },
                              { value: 'SERVICE', label: t('users.roles.service', 'Service') },
                            ]}
                            styles={(theme) => ({
                              input: {
                                fontSize: 11,
                                height: '24px',
                                minHeight: '24px',
                                fontWeight: 700,
                                backgroundColor:
                                  u.role === 'SUPERADMIN'
                                    ? theme.colorScheme === 'dark'
                                      ? 'rgba(139, 92, 246, 0.15)'
                                      : 'rgba(139, 92, 246, 0.1)'
                                    : u.role === 'MANAGER'
                                    ? theme.colorScheme === 'dark'
                                      ? 'rgba(20, 184, 166, 0.15)'
                                      : 'rgba(20, 184, 166, 0.1)'
                                    : u.role === 'READER'
                                    ? theme.colorScheme === 'dark'
                                      ? 'rgba(107, 114, 128, 0.15)'
                                      : 'rgba(107, 114, 128, 0.1)'
                                    : theme.colorScheme === 'dark'
                                    ? 'rgba(249, 115, 22, 0.15)'
                                    : 'rgba(249, 115, 22, 0.1)',
                                color:
                                  u.role === 'SUPERADMIN'
                                    ? '#8B5CF6'
                                    : u.role === 'MANAGER'
                                    ? '#14B8A6'
                                    : u.role === 'READER'
                                    ? '#6B7280'
                                    : '#F97316',
                                borderColor: 'transparent',
                                borderRadius: '4px',
                                width: 120,
                                textAlign: 'center',
                                paddingRight: '14px',
                              },
                              rightSection: {
                                pointerEvents: 'none',
                                svg: {
                                  width: '10px',
                                  height: '10px',
                                },
                              },
                            })}
                          />
                        )}
                      </td>
                      <td>
                        {u.role === 'SUPERADMIN' ? (
                          <Badge color="violet" variant="outline" size="xs">
                            {t('users.libraries.all', 'All Libraries')}
                          </Badge>
                        ) : (
                          <MultiSelect
                            size="xs"
                            placeholder={t('users.libraries.selectPlaceholder', 'None (no access)')}
                            value={u.libraries?.map((lib) => String(lib.id)) || []}
                            data={
                              librariesQuery.data?.map((lib) => ({
                                value: String(lib.id),
                                label: lib.name || lib.path.split(/[\\/]/).pop() || `Librería #${lib.id}`,
                              })) || []
                            }
                            onChange={(values) => {
                              updateLibrariesMutation.mutate({
                                userId: u.id,
                                libraryIds: values.map((v) => parseInt(v, 10)),
                              });
                            }}
                            disabled={updateLibrariesMutation.isLoading}
                            styles={(theme) => ({
                              values: { minHeight: 24 },
                              input: {
                                fontSize: 11,
                                minHeight: 24,
                                minWidth: 150,
                                backgroundColor:
                                  theme.colorScheme === 'dark' ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)',
                              },
                            })}
                          />
                        )}
                      </td>
                      <td>
                        <Group spacing="xs" noWrap>
                          <Switch
                            size="xs"
                            color="teal"
                            checked={u.notificationsEnabled !== false}
                            onChange={(e) => {
                              updateSettingsMutation.mutate({
                                userId: u.id,
                                key: 'notificationsEnabled',
                                value: e.currentTarget.checked,
                              });
                            }}
                            disabled={updateSettingsMutation.isLoading}
                            title={
                              u.notificationsEnabled !== false
                                ? t('users.list.notificationsActive', 'Notifications Enabled')
                                : t('users.list.notificationsDisabled', 'Notifications Disabled')
                            }
                          />
                          {u.notificationsEnabled !== false ? (
                            <Group spacing={4} noWrap>
                              {u.whatsappEnabled && (
                                <Badge size="xs" color="teal" variant="light" sx={{ padding: '0 4px' }} title={t('users.list.whatsappActive', 'WhatsApp Active')}>
                                  WA
                                </Badge>
                              )}
                              {u.discordEnabled && (
                                <Badge size="xs" color="indigo" variant="light" sx={{ padding: '0 4px' }} title={t('users.list.discordActive', 'Discord Active')}>
                                  DC
                                </Badge>
                              )}
                              {u.telegramEnabled && (
                                <Badge size="xs" color="blue" variant="light" sx={{ padding: '0 4px' }} title={t('users.list.telegramActive', 'Telegram Active')}>
                                  TG
                                </Badge>
                              )}
                              {!u.whatsappEnabled && !u.discordEnabled && !u.telegramEnabled && (
                                <Text size="xs" color="dimmed" italic sx={{ fontSize: 10 }}>
                                  {t('users.list.noChannels', 'No channels')}
                                </Text>
                              )}
                            </Group>
                          ) : (
                            <Badge size="xs" color="gray" variant="outline" sx={{ padding: '0 4px' }}>
                              {t('users.list.disabled', 'Disabled')}
                            </Badge>
                          )}
                        </Group>
                      </td>
                      <td>
                        {u.anilistEnabled && u.anilistUsername ? (
                          <Badge color="teal" variant="light" size="xs">
                            AniList: @{u.anilistUsername}
                          </Badge>
                        ) : (
                          <Text size="xs" color="dimmed">
                            -
                          </Text>
                        )}
                      </td>
                      <td>
                        {u.apiToken ? (
                          <Group spacing="xs">
                            <Text size="xs" color="dimmed" sx={{ fontFamily: 'monospace' }}>
                              {u.apiToken.substring(0, 8)}...
                            </Text>
                            <ActionIcon
                              variant="subtle"
                              size="xs"
                              color="violet"
                              title={t('users.list.copyToken', 'Copy Token')}
                              onClick={() => handleCopyToken(u.apiToken!)}
                            >
                              <IconCopy size={14} />
                            </ActionIcon>
                            <Button
                              variant="subtle"
                              size="xs"
                              compact
                              onClick={() => {
                                modals.openConfirmModal({
                                  title: t('users.list.regenerateConfirmTitle', 'Regenerate API Token'),
                                  children: (
                                    <Text size="sm">
                                      {t(
                                        'users.list.regenerateConfirm',
                                        'Are you sure you want to regenerate the API token for this user? Any applications using the old token will lose access.',
                                      )}
                                    </Text>
                                  ),
                                  labels: {
                                    confirm: t('users.list.regenerate', 'Regenerate'),
                                    cancel: t('users.delete.cancelButton', 'Cancel'),
                                  },
                                  confirmProps: { color: 'red' },
                                  onConfirm: () => {
                                    generateTokenMutation.mutate({ id: u.id });
                                  },
                                });
                              }}
                            >
                              {t('users.list.regenerate', 'Regenerate')}
                            </Button>
                          </Group>
                        ) : (
                          <Button
                            variant="light"
                            size="xs"
                            compact
                            onClick={() => generateTokenMutation.mutate({ id: u.id })}
                          >
                            {t('users.list.generate', 'Generate Token')}
                          </Button>
                        )}
                      </td>
                      <td>
                        {u.lastActiveAt ? (
                          <Stack spacing={2}>
                            <Text size="xs" sx={{ whiteSpace: 'nowrap' }}>
                              {new Date(u.lastActiveAt).toLocaleString()}
                            </Text>
                            <Text size="xs" color="dimmed">
                              {u.apiCallCount || 0} {t('users.list.apiRequests', 'requests')}
                            </Text>
                          </Stack>
                        ) : (
                          <Text size="xs" color="dimmed" italic>
                            {t('users.list.never', 'Never')}
                          </Text>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Group spacing={4} position="right" noWrap>
                          <ActionIcon
                            color="violet"
                            variant="subtle"
                            size="sm"
                            title={t('users.list.configureNotifications', 'Configure Notifications & Profile')}
                            onClick={() => setSelectedUserId(u.id)}
                          >
                            <IconBell size={16} />
                          </ActionIcon>
                          <ActionIcon
                            color="red"
                            variant="subtle"
                            size="sm"
                            disabled={u.username === 'admin'}
                            onClick={() => confirmDelete(u.id, u.username)}
                            title={
                              u.username === 'admin'
                                ? t('users.delete.disabledAdmin', 'The main administrator account cannot be deleted')
                                : t('users.delete.confirmButton', 'Delete user')
                            }
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Group>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Box>
          </Paper>
        </motion.div>
      </Stack>

      {selectedUserId && (
        <UserSettingsModal
          opened={selectedUserId !== null}
          onClose={() => {
            setSelectedUserId(null);
            users.refetch();
          }}
          userId={selectedUserId}
          initialTab="notifications"
        />
      )}
    </Container>
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
