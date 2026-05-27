import { Box, LoadingOverlay, NumberInput, Select, Stack, TextInput } from '@mantine/core';
import { UseFormReturnType } from '@mantine/form';
import { IconFolderPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { getCronLabel, isCronValid, sanitizer } from '../../../utils';
import { trpc } from '../../../utils/trpc';
import type { FormType } from '../form';

export function DownloadStep({ form }: { form: UseFormReturnType<FormType> }) {
  const [data, setData] = useState(() => {
    const randomMinute = Math.floor(Math.random() * 60);
    const randomHour = Math.floor(Math.random() * 6);
    const staggeredDaily = `${randomMinute} ${randomHour} * * *`;

    return [
      { label: `Daily (Staggered: ${getCronLabel(staggeredDaily)})`, value: staggeredDaily },
      { label: getCronLabel('0 0 * * *'), value: '0 0 * * *' },
      { label: getCronLabel('0 * * * *'), value: '0 * * * *' },
      { label: getCronLabel('0 0 * * 7'), value: '0 0 * * 7' },
      { label: 'never', value: 'never' },
    ];
  });
  const libraryQuery = trpc.library.query.useQuery();

  const libraryPath = libraryQuery.data?.path;

  if (libraryQuery.isLoading) {
    return <LoadingOverlay visible />;
  }

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
          data={data}
          label="Download Interval"
          placeholder="Select or create an interval"
          getCreateLabel={(query) => {
            if (isCronValid(query)) {
              return `+ Download ${getCronLabel(query)}`;
            }

            return `+ Create ${query}`;
          }}
          onCreate={(query) => {
            if (!isCronValid(query)) {
              form.setFieldError('interval', 'Invalid interval');
              return null;
            }
            const item = { value: query, label: getCronLabel(query) };
            setData((current) => [...current.filter((i) => i.value !== query), item]);
            return item;
          }}
          {...form.getInputProps('interval')}
        />
        <NumberInput
          label="Chapter Threshold (Plan to Read)"
          description="Do not download until source has at least this number of chapters. Set to 0 to download immediately."
          placeholder="e.g. 10"
          min={0}
          size="sm"
          {...form.getInputProps('minChaptersForDownload')}
        />
        <TextInput
          label="Location"
          size="sm"
          disabled
          icon={<IconFolderPlus size={18} strokeWidth={1.5} />}
          value={downloadPath}
        />
      </Stack>
    </Box>
  );
}
