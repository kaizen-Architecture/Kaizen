import { Switch, Text, Loader } from '@mantine/core';
import { trpc } from '../../utils/trpc';

export function ReaderModuleToggle() {
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
      key: 'readerEnabled' as any,
      value: checked,
    });
  };

  return (
    <div>
      <Switch
        label="Habilitar módulo Reader / Enable Reader module"
        checked={enabled}
        onChange={(event) => handleChange(event.currentTarget.checked)}
        size="md"
        disabled={update.isLoading}
      />
      <Text size="xs" color="dimmed" mt={4}>
        {enabled
          ? 'El interruptor de Reader aparecerá en el header para usuarios con permisos.'
          : 'El módulo Reader está completamente desactivado. El interruptor no aparecerá.'}
      </Text>
    </div>
  );
}
