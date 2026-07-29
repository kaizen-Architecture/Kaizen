import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Group,
  LoadingOverlay,
  Modal,
  PasswordInput,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { IconBrandGithub, IconCheck, IconLock, IconLockOpen, IconPlus, IconTrash, IconX } from '@tabler/icons-react';
import { useTranslation } from 'next-i18next';
import { trpc } from '../../utils/trpc';

export function GithubSettings() {
  const { t } = useTranslation('settings');
  const [opened, { open, close }] = useDisclosure(false);
  const reposQuery = trpc.sources.listRepos.useQuery();
  const addRepoMutation = trpc.sources.addRepo.useMutation();
  const removeRepoMutation = trpc.sources.removeRepo.useMutation();

  const form = useForm({
    initialValues: {
      url: '',
      token: '',
      isPrivate: false,
    },
  });

  const handleSubmit = async (values: typeof form.values) => {
    if (!values.url.trim()) return;
    try {
      await addRepoMutation.mutateAsync({
        url: values.url,
        token: values.isPrivate ? values.token : null,
        isPrivate: values.isPrivate,
      });

      showNotification({
        title: t('scraperRepos.notifications.addedTitle'),
        message: t('scraperRepos.notifications.addedMsg', { url: values.url }),
        color: 'teal',
        icon: <IconCheck size={18} />,
      });
      form.reset();
      close();
      reposQuery.refetch();
    } catch (err: any) {
      showNotification({
        title: t('scraperRepos.notifications.errorTitle'),
        message: err.message || t('scraperRepos.notifications.addedErrorMsg'),
        color: 'red',
        icon: <IconX size={18} />,
      });
    }
  };

  const handleRemove = async (id: number, url: string) => {
    if (!window.confirm(t('scraperRepos.confirmRemove', { url }))) return;
    try {
      await removeRepoMutation.mutateAsync({ id });
      showNotification({
        title: t('scraperRepos.notifications.removedTitle'),
        message: t('scraperRepos.notifications.removedMsg'),
        color: 'teal',
        icon: <IconCheck size={18} />,
      });
      reposQuery.refetch();
    } catch (err) {
      showNotification({
        title: t('scraperRepos.notifications.errorTitle'),
        message: t('scraperRepos.notifications.removedErrorMsg'),
        color: 'red',
      });
    }
  };

  const repos = reposQuery.data || [];

  return (
    <Box sx={{ position: 'relative' }}>
      <LoadingOverlay visible={reposQuery.isLoading} />

      <Stack spacing="md">
        <Group position="apart">
          <Stack spacing={2}>
            <Text weight={600} size="sm">
              {t('scraperRepos.title')}
            </Text>
            <Text size="xs" color="dimmed">
              {t('scraperRepos.description')}
            </Text>
          </Stack>
          <Button leftIcon={<IconPlus size={16} />} size="xs" variant="light" onClick={open}>
            {t('scraperRepos.addBtn')}
          </Button>
        </Group>

        {repos.length === 0 ? (
          <Text size="sm" color="dimmed" align="center" py="xl">
            {t('scraperRepos.noRepos')}
          </Text>
        ) : (
          <Table verticalSpacing="sm" highlightOnHover>
            <thead>
              <tr>
                <th>{t('scraperRepos.tableHeaderUrl')}</th>
                <th>{t('scraperRepos.tableHeaderAccess')}</th>
                <th style={{ width: 80, textAlign: 'right' }}>{t('scraperRepos.tableHeaderActions')}</th>
              </tr>
            </thead>
            <tbody>
              {repos.map((repo) => (
                <tr key={repo.id}>
                  <td>
                    <Group spacing="xs">
                      <IconBrandGithub size={16} />
                      <Text size="sm" weight={500}>
                        {repo.url}
                      </Text>
                    </Group>
                  </td>
                  <td>
                    {repo.isPrivate || repo.token ? (
                      <Badge color="red" variant="light" leftSection={<IconLock size={10} style={{ marginTop: 3 }} />}>
                        {t('scraperRepos.badgePrivate')}
                      </Badge>
                    ) : (
                      <Badge
                        color="teal"
                        variant="light"
                        leftSection={<IconLockOpen size={10} style={{ marginTop: 3 }} />}
                      >
                        {t('scraperRepos.badgePublic')}
                      </Badge>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <ActionIcon color="red" variant="subtle" onClick={() => handleRemove(repo.id, repo.url)}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Stack>

      <Modal opened={opened} onClose={close} title={<Text weight={600}>{t('scraperRepos.modalTitle')}</Text>} centered>
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack spacing="md">
            <TextInput
              label={t('scraperRepos.inputUrlLabel')}
              placeholder={t('scraperRepos.inputUrlPlaceholder')}
              description={t('scraperRepos.inputUrlDesc')}
              required
              {...form.getInputProps('url')}
            />
            <Checkbox
              label={t('scraperRepos.inputPrivateLabel')}
              {...form.getInputProps('isPrivate', { type: 'checkbox' })}
            />
            {form.values.isPrivate && (
              <PasswordInput
                label={t('scraperRepos.inputTokenLabel')}
                placeholder={t('scraperRepos.inputTokenPlaceholder')}
                description={t('scraperRepos.inputTokenDesc')}
                required={form.values.isPrivate}
                {...form.getInputProps('token')}
              />
            )}
            <Group position="right" mt="sm">
              <Button variant="subtle" onClick={close}>
                {t('scraperRepos.cancelBtn')}
              </Button>
              <Button type="submit" loading={addRepoMutation.isLoading}>
                {t('scraperRepos.saveBtn')}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Box>
  );
}
