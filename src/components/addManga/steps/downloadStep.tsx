import { Box, LoadingOverlay, NumberInput, Select, Stack, TextInput } from '@mantine/core';
import { UseFormReturnType } from '@mantine/form';
import { IconFolderPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { getCronLabel, isCronValid, sanitizer } from '../../../utils';
import { trpc } from '../../../utils/trpc';
import type { FormType } from '../form';

export function DownloadStep({ form }: { form: UseFormReturnType<FormType> }) {
  const { t } = useTranslation(['common']);
  const [staggeredDaily] = useState(() => {
    const randomMinute = Math.floor(Math.random() * 60);
    const randomHour = Math.floor(Math.random() * 6);
    return `${randomMinute} ${randomHour} * * *`;
  });
  const [customCrons, setCustomCrons] = useState<string[]>([]);

  const libraryQuery = trpc.library.query.useQuery();

  const libraryPath = libraryQuery.data?.path;

  if (libraryQuery.isLoading) {
    return <LoadingOverlay visible />;
  }

  const selectData = [
    {
      label: t('common:addManga.download.dailyStaggered', {
        cron: getCronLabel(staggeredDaily),
        defaultValue: `Daily (Staggered: ${getCronLabel(staggeredDaily)})`,
      }),
      value: staggeredDaily,
    },
    { label: getCronLabel('0 0 * * *'), value: '0 0 * * *' },
    { label: getCronLabel('0 * * * *'), value: '0 * * * *' },
    { label: getCronLabel('0 0 * * 7'), value: '0 0 * * 7' },
    { label: t('common:addManga.download.never', 'never'), value: 'never' },
    ...customCrons.map((cron) => ({ label: getCronLabel(cron), value: cron })),
  ];

  const downloadPath = `${libraryPath}/${sanitizer(form.values.mangaTitle)}`;

  return (
    <Box>
      <Stack>
        <Select
          data-autofocus
          searchable
          clearable
          creatable
          size="sm"
          data={selectData}
          label={t('common:addManga.download.intervalLabel', 'Download Interval') as string}
          placeholder={t('common:addManga.download.intervalPlaceholder', 'Select or create an interval') as string}
          getCreateLabel={(query) => {
            if (isCronValid(query)) {
              return `+ Download ${getCronLabel(query)}`;
            }

            return `+ Create ${query}`;
          }}
          onCreate={(query) => {
            if (!isCronValid(query)) {
              form.setFieldError(
                'interval',
                t('common:addManga.validation.invalidInterval', 'Invalid interval') as string,
              );
              return null;
            }
            const item = { value: query, label: getCronLabel(query) };
            setCustomCrons((current) => [...current.filter((i) => i !== query), query]);
            return item;
          }}
          {...form.getInputProps('interval')}
        />
        <NumberInput
          label={t('common:addManga.download.thresholdLabel', 'Chapter Threshold (Plan to Read)') as string}
          description={
            t(
              'common:addManga.download.thresholdDesc',
              'Do not download until source has at least this number of chapters. Set to 0 to download immediately.',
            ) as string
          }
          placeholder="e.g. 10"
          min={0}
          size="sm"
          {...form.getInputProps('minChaptersForDownload')}
        />
        <TextInput
          label={t('common:addManga.download.locationLabel', 'Location') as string}
          size="sm"
          disabled
          icon={<IconFolderPlus size={18} strokeWidth={1.5} />}
          value={downloadPath}
        />
      </Stack>
    </Box>
  );
}
