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
} from '@tabler/icons-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'next-i18next';
import React, { useState } from 'react';
import { trpc } from '../utils/trpc';

export default function UsersPage() {
  const { t } = useTranslation('settings');
  const modals = useModals();

  const users = trpc.auth.getUsers.useQuery();
  const isDefaultPasswordQuery = trpc.auth.checkAdminDefaultPassword.useQuery();

  const handleCopyToken = (token: string) => {
    const showSuccess = () => {
      showNotification({
        title: t('users.notifications.tokenCopiedTitle', 'Token Copiado'),
        message: t('users.notifications.tokenCopiedDesc', 'El token se ha copiado al portapapeles.'),
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
          message: 'No se pudo copiar el token al portapapeles.',
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
        title: t('users.notifications.roleUpdatedTitle', 'Rol Actualizado'),
        message: t('users.notifications.roleUpdatedDesc', 'El rol del usuario ha sido actualizado correctamente.'),
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
        title: t('users.notifications.passwordUpdatedTitle', 'Contraseña Actualizada'),
        message: t(
          'users.notifications.passwordUpdatedDesc',
          'La contraseña del administrador ha sido cambiada exitosamente.',
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
      title: t('users.list.tokenModal.title', 'API Token Generado'),
      centered: true,
      children: (
        <Stack spacing="md">
          <Text size="sm">
            {t(
              'users.list.tokenModal.description',
              'Por favor, copia este token ahora. Por tu seguridad, no se volverá a mostrar.',
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
            {t('users.list.copyToken', 'Copiar Token')}
          </Button>
        </Stack>
      ),
    });
  };

  const generateTokenMutation = trpc.auth.generateApiToken.useMutation({
    onSuccess: (data) => {
      users.refetch();
      showNotification({
        title: t('users.notifications.tokenGeneratedTitle', 'Token Generado'),
        message: t('users.notifications.tokenGeneratedDesc', 'El API Token ha sido generado correctamente.'),
        color: 'teal',
        icon: <IconCheck size={18} />,
      });
      if (data?.apiToken) {
        showTokenModal(data.apiToken);
      }
    },
    onError: (err) => {
      showNotification({
        title: t('users.notifications.tokenErrorTitle', 'Error Generando Token'),
        message: err.message,
        color: 'red',
      });
    },
  });

  const createUser = trpc.auth.createUser.useMutation({
    onSuccess: () => {
      users.refetch();
      showNotification({
        title: t('users.notifications.userCreatedTitle', 'Usuario Creado'),
        message: t('users.notifications.userCreatedDesc', 'La nueva cuenta de usuario se ha registrado correctamente.'),
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
        title: t('users.notifications.userDeletedTitle', 'Cuenta Eliminada'),
        message: t('users.notifications.userDeletedDesc', 'El acceso del usuario ha sido revocado permanentemente.'),
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
        title: t('users.adminPassword.mismatchTitle', 'Contraseñas no coinciden'),
        message: t(
          'users.adminPassword.mismatchDesc',
          'Por favor, asegúrate de escribir exactamente la misma contraseña en ambos campos.',
        ),
        color: 'orange',
      });
      return;
    }

    const adminAccount = users.data?.find((u) => u.username === 'admin');
    if (!adminAccount) {
      showNotification({
        title: t('common.error', 'Error'),
        message: t('users.adminPassword.notFound', 'No se pudo localizar la cuenta principal del administrador.'),
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
      title: t('users.delete.confirmTitle', 'Confirmar eliminación de cuenta'),
      children: (
        <Text size="sm">
          {t(
            'users.delete.confirmDesc',
            '¿Estás completamente seguro de que deseas revocar y eliminar el acceso para el usuario ',
            { username },
          )}{' '}
          <b>{username}</b>?
        </Text>
      ),
      labels: {
        confirm: t('users.delete.confirmButton', 'Eliminar'),
        cancel: t('users.delete.cancelButton', 'Cancelar'),
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
            <Title order={2}>{t('users.title', 'Centro de Cuentas y Control de Acceso')}</Title>
          </Group>
          <Text size="sm" color="dimmed">
            {t(
              'users.description',
              'Gestiona la seguridad y los niveles de autorización de todos los usuarios de la plataforma Kaizen.',
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
              {t('users.defaultPasswordAlert.title', '¡Atención! Contraseña Predeterminada de Administrador Activa')}
            </Text>
            <Text size="xs" mt={2}>
              {t(
                'users.defaultPasswordAlert.desc',
                'Hemos detectado que tu cuenta principal admin sigue configurada con la contraseña de fábrica. Por tu absoluta privacidad y seguridad web, es de suma importancia que la modifiques en este momento utilizando el panel inferior.',
              )}
              importancia que la modifiques en este momento utilizando el panel inferior.
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
                {t('users.adminPassword.title', 'Actualizar Contraseña del Administrador Principal')}
              </Title>
            </Group>
            <Text size="xs" color="dimmed" mb="md">
              {t(
                'users.adminPassword.desc',
                'Cambia la contraseña de la cuenta raíz admin para salvaguardar la configuración del descargador.',
              )}
            </Text>

            <form onSubmit={handlePasswordSubmit}>
              <Grid align="flex-end" gutter="md">
                <Grid.Col xs={12} md={4}>
                  <PasswordInput
                    size="sm"
                    label={t('users.adminPassword.newPassword', 'Nueva Contraseña')}
                    placeholder={t('users.adminPassword.newPasswordPlaceholder', 'Escribe la nueva clave segura')}
                    value={adminNewPassword}
                    onChange={(e) => setAdminNewPassword(e.currentTarget.value)}
                    required
                  />
                </Grid.Col>
                <Grid.Col xs={12} md={4}>
                  <PasswordInput
                    size="sm"
                    label={t('users.adminPassword.confirmPassword', 'Confirmar Contraseña')}
                    placeholder={t('users.adminPassword.confirmPasswordPlaceholder', 'Vuelve a escribir la clave')}
                    value={adminConfirmPassword}
                    onChange={(e) => setAdminConfirmPassword(e.currentTarget.value)}
                    required
                  />
                </Grid.Col>
                <Grid.Col xs={12} md={4}>
                  <Button type="submit" size="sm" fullWidth color="violet" loading={updatePasswordMutation.isLoading}>
                    {t('users.adminPassword.saveButton', 'Guardar Contraseña')}
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
              <Title order={4}>{t('users.management.title', 'Gestión y Creación de Usuarios Locales')}</Title>
            </Group>
            <Text size="xs" color="dimmed" mb="md">
              {t(
                'users.management.desc',
                'Crea sub-cuentas con roles específicos de acceso: Admin (control total), Gestor (descargas y series) o Lector (sólo lectura de la biblioteca).',
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
                {t('users.management.addAccount', 'Añadir Nueva Cuenta')}
              </Text>
              <form onSubmit={handleCreateSubmit}>
                <Grid align="flex-end" gutter="md">
                  <Grid.Col xs={12} sm={6} md={3}>
                    <TextInput
                      size="sm"
                      label={t('users.management.username', 'Nombre de Usuario')}
                      placeholder={t('users.management.usernamePlaceholder', 'ej. editor')}
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.currentTarget.value)}
                      required
                    />
                  </Grid.Col>
                  <Grid.Col xs={12} sm={6} md={3}>
                    <PasswordInput
                      size="sm"
                      label={t('users.management.password', 'Contraseña')}
                      placeholder="••••••••"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.currentTarget.value)}
                      required
                    />
                  </Grid.Col>
                  <Grid.Col xs={12} sm={6} md={3}>
                    <Text size="xs" weight={500} mb={5} sx={{ fontSize: 12 }}>
                      {t('users.management.role', 'Nivel de Permisos')}
                    </Text>
                    <SegmentedControl
                      size="sm"
                      fullWidth
                      value={newRole}
                      onChange={(val: any) => setNewRole(val)}
                      data={[
                        { value: 'SUPERADMIN', label: t('users.roles.superadmin', 'Admin') },
                        { value: 'MANAGER', label: t('users.roles.manager', 'Gestor') },
                        { value: 'READER', label: t('users.roles.reader', 'Lector') },
                        { value: 'SERVICE', label: t('users.roles.service', 'Servicio') },
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
                      {t('users.management.addButton', 'Añadir Usuario')}
                    </Button>
                  </Grid.Col>
                </Grid>
              </form>
            </Box>

            <Text size="sm" weight={600} mb="xs">
              {t('users.list.title', 'Usuarios Registrados Activos')}
            </Text>
            <Box sx={{ overflowX: 'auto' }}>
              <Table fontSize="sm" highlightOnHover verticalSpacing="sm" sx={{ minWidth: 600 }}>
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>{t('users.list.id', 'ID')}</th>
                    <th>{t('users.list.username', 'Usuario')}</th>
                    <th>{t('users.list.role', 'Rol Asignado')}</th>
                    <th>{t('users.list.integrations', 'Integraciones')}</th>
                    <th>{t('users.list.apiToken', 'API Token')}</th>
                    <th>{t('users.list.lastActiveAt', 'Última Actividad API')}</th>
                    <th style={{ width: 80, textAlign: 'right' }}>{t('users.list.actions', 'Acciones')}</th>
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
                              { value: 'MANAGER', label: t('users.roles.manager', 'Gestor') },
                              { value: 'READER', label: t('users.roles.reader', 'Lector') },
                              { value: 'SERVICE', label: t('users.roles.service', 'Servicio') },
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
                              title={t('users.list.copyToken', 'Copiar Token')}
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
                              {u.apiCallCount || 0} {t('users.list.apiRequests', 'peticiones')}
                            </Text>
                          </Stack>
                        ) : (
                          <Text size="xs" color="dimmed" italic>
                            {t('users.list.never', 'Nunca')}
                          </Text>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <ActionIcon
                          color="red"
                          variant="subtle"
                          disabled={u.username === 'admin'}
                          onClick={() => confirmDelete(u.id, u.username)}
                          title={
                            u.username === 'admin'
                              ? t('users.delete.disabledAdmin', 'La cuenta principal no puede ser eliminada')
                              : t('users.delete.confirmButton', 'Eliminar usuario')
                          }
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Box>
          </Paper>
        </motion.div>
      </Stack>
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
