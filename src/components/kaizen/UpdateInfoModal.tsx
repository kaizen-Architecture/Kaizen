import { Modal, Button, Group, Stack, Text, ScrollArea, Code, ThemeIcon, Box, Divider, Paper } from '@mantine/core';
import { IconAlertCircle, IconBrandGithub } from '@tabler/icons-react';
import { useTranslation } from 'next-i18next';

interface UpdateInfoModalProps {
  opened: boolean;
  onClose: () => void;
  updateInfo: {
    updateAvailable: boolean;
    latestVersion: string;
    currentVersion: string;
    changelog: string;
    publishedAt: string;
    url: string;
  } | null;
}

export function UpdateInfoModal({ opened, onClose, updateInfo }: UpdateInfoModalProps) {
  const { t } = useTranslation('settings');

  if (!updateInfo) return null;

  const formattedDate = updateInfo.publishedAt
    ? new Date(updateInfo.publishedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '';

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group spacing="xs">
          <ThemeIcon color="orange" variant="light" size="md" radius="sm">
            <IconAlertCircle size={18} />
          </ThemeIcon>
          <Text weight={700} size="md">
            {t('updates.updateAvailable', 'Update Available')}
          </Text>
        </Group>
      }
      size="lg"
      radius="md"
      overlayOpacity={0.55}
      overlayBlur={3}
    >
      <Stack spacing="md" mt="xs">
        {/* Version info row */}
        <Paper
          withBorder
          p="sm"
          radius="md"
          sx={(theme) => ({
            backgroundColor: theme.colorScheme === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)',
          })}
        >
          <Group position="apart">
            <Box>
              <Text size="xs" color="dimmed" weight={500}>
                {t('updates.currentVersion', 'Current Version')}
              </Text>
              <Text weight={700} size="md">
                v{updateInfo.currentVersion}
              </Text>
            </Box>
            <Box style={{ textAlign: 'right' }}>
              <Text size="xs" color="dimmed" weight={500}>
                {t('updates.latestVersion', 'Latest Version')}
              </Text>
              <Text weight={700} size="md" color="orange">
                v{updateInfo.latestVersion}
              </Text>
            </Box>
          </Group>
          {formattedDate && (
            <Text size="xs" color="dimmed" mt={8} style={{ textAlign: 'center' }}>
              {formattedDate}
            </Text>
          )}
        </Paper>

        {/* Release notes */}
        <Box>
          <Text size="sm" weight={600} mb="xs">
            {t('updates.releaseNotes', 'Release Notes')}
          </Text>
          <Paper
            withBorder
            p="md"
            radius="md"
            sx={(theme) => ({
              backgroundColor: theme.colorScheme === 'dark' ? '#0f172a' : '#f8fafc',
            })}
          >
            <ScrollArea style={{ height: 250 }} offsetScrollbars>
              <Text
                size="sm"
                sx={(theme) => ({
                  whiteSpace: 'pre-wrap',
                  fontFamily: theme.fontFamilyMonospace,
                  lineHeight: 1.5,
                })}
              >
                {updateInfo.changelog || 'No release notes provided.'}
              </Text>
            </ScrollArea>
          </Paper>
        </Box>

        <Divider />

        {/* Update instructions */}
        <Box>
          <Text size="sm" weight={600} mb="xs">
            {t('updates.howToUpdate', 'How to Update')}
          </Text>
          <Text size="xs" color="dimmed" mb={8}>
            {t(
              'updates.howToUpdateDesc',
              'To update Kaizen, run the following commands in the directory of your docker-compose.yml file:',
            )}
          </Text>
          <Code block sx={{ padding: '12px', borderRadius: '6px' }}>
            {`docker compose pull\ndocker compose up -d --force-recreate`}
          </Code>
        </Box>

        {/* Footer buttons */}
        <Group position="right" mt="md">
          {updateInfo.url && (
            <Button
              component="a"
              href={updateInfo.url}
              target="_blank"
              rel="noopener noreferrer"
              variant="light"
              color="indigo"
              leftIcon={<IconBrandGithub size={16} />}
            >
              {t('updates.viewReleaseNotes', 'View Release Notes')}
            </Button>
          )}
          <Button onClick={onClose} variant="default">
            {t('common.close', 'Cerrar')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
