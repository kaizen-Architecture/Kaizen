import { Box, Group, SegmentedControl, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconDatabase } from '@tabler/icons-react';
import { useTranslation } from 'next-i18next';
import { trpc } from '../../utils/trpc';

export function MetadataSettings() {
  const { t } = useTranslation('settings');
  const settings = trpc.settings.query.useQuery();
  const update = trpc.settings.update.useMutation({
    onSuccess: () => settings.refetch(),
  });

  const currentProviders = settings.data?.appConfig?.metadataProviders || ['anilist', 'mangadex'];
  const value = currentProviders[0] === 'mangadex' ? 'mangadex' : 'anilist';

  const handleChange = (val: string) => {
    const newProviders = val === 'mangadex' ? ['mangadex', 'anilist'] : ['anilist', 'mangadex'];
    update.mutate({ updateType: 'app', key: 'metadataProviders' as any, value: newProviders });
  };

  if (settings.isLoading || !settings.data) return null;

  return (
    <Stack spacing="md" mt="md">
      <Group spacing="sm">
        <ThemeIcon size={36} radius="md" color="indigo" variant="light">
          <IconDatabase size={20} />
        </ThemeIcon>
        <Box>
          <Title order={5}>{t('maintenance.metadataPriorityTitle', 'Metadata Priority / Fallback Order')}</Title>
          <Text size="xs" color="dimmed">
            {t(
              'maintenance.metadataPriorityDesc',
              'Choose which provider to use as the primary source for fetching manga covers, summaries, and genres.',
            )}
          </Text>
        </Box>
      </Group>

      <Box>
        <SegmentedControl
          fullWidth
          value={value}
          onChange={handleChange}
          disabled={update.isLoading}
          data={[
            {
              value: 'anilist',
              label: (
                <Stack spacing={2} py={4}>
                  <Text size="sm" weight={600}>
                    {t('maintenance.anilistFirst', 'AniList First')}
                  </Text>
                  <Text size="xs" color="dimmed">
                    {t('maintenance.anilistFallback', 'AniList → MangaDex Fallback')}
                  </Text>
                </Stack>
              ),
            },
            {
              value: 'mangadex',
              label: (
                <Stack spacing={2} py={4}>
                  <Text size="sm" weight={600}>
                    {t('maintenance.mangadexFirst', 'MangaDex First')}
                  </Text>
                  <Text size="xs" color="dimmed">
                    {t('maintenance.mangadexFallback', 'MangaDex → AniList Fallback')}
                  </Text>
                </Stack>
              ),
            },
          ]}
        />
      </Box>
    </Stack>
  );
}
