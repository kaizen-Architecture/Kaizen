import { Switch, Text, Loader } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { trpc } from '../../utils/trpc';

export function ReaderModuleToggle() {
  const { t } = useTranslation('settings');
  const settings = trpc.settings.query.useQuery();
  const update = trpc.settings.update.useMutation({
    onSuccess: () => {
      settings.refetch();
    },
  });

  if (settings.isLoading || !settings.data) {
    return <Loader size="sm" />;
  }

  const enabled = (settings.data?.appConfig as any)?.readerEnabled !== false;

  const handleChange = (checked: boolean) => {
    update.mutate({
      updateType: 'app',
      key: 'readerEnabled',
      value: checked,
    });
  };

  return (
    <div>
      <Switch
        label={t('auth.readerToggleLabel', 'Enable Reader module')}
        checked={enabled}
        onChange={(event) => handleChange(event.currentTarget.checked)}
        size="md"
        disabled={update.isLoading}
      />
      <Text size="xs" color="dimmed" mt={4}>
        {enabled
          ? t('auth.readerToggleHelpEnabled', 'The Reader switch will appear in the header for authorized users.')
          : t('auth.readerToggleHelpDisabled', 'The Reader module is completely disabled. The switch will not appear.')}
      </Text>
    </div>
  );
}
