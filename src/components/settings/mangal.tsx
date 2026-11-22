import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Breadcrumbs,
  Button,
  createStyles,
  Divider,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  PasswordInput,
} from '@mantine/core';
import { IconAlertTriangle, IconArrowBackUp, IconCheck, IconDownload, IconInfoCircle, IconRefresh, IconX } from '@tabler/icons-react';
import { showNotification } from '@mantine/notifications';
import { useTranslation } from 'next-i18next';
import { nanoid } from 'nanoid';
import { useEffect, useState } from 'react';
import { trpc } from '../../utils/trpc';

const useStyles = createStyles((theme) => ({
  card: {
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
  },

  item: {
    '& + &': {
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
    minWidth: 180,
    width: 180,
  },

  title: {
    lineHeight: 1,
  },
}));

export function SwitchItem({
  configKey,
  initialValue,
  onUpdate,
}: {
  configKey: string;
  initialValue: boolean;
  onUpdate: (configKey: string, value: boolean) => void;
}) {
  const { classes } = useStyles();
  return (
    <Switch
      color="red"
      onChange={(event) => onUpdate(configKey, event.currentTarget.checked)}
      onLabel={<IconCheck size={16} />}
      defaultChecked={initialValue}
      offLabel={<IconX size={16} />}
      className={classes.switch}
      size="lg"
    />
  );
}

export function SelectItem({
  configKey,
  initialValue,
  options,
  onUpdate,
}: {
  configKey: string;
  initialValue: string;
  options: { value: string; label: string }[];
  onUpdate: (configKey: string, value: string) => Promise<void> | void;
}) {
  const { t } = useTranslation('settings');
  const [value, setValue] = useState(initialValue || 'cbz');
  const [loading, setLoading] = useState(false);
  const hasChanged = value !== initialValue;

  const handleApply = async () => {
    setLoading(true);
    try {
      await onUpdate(configKey, value);
      showNotification({
        title: t('mangal.appliedTitle', 'Configuración actualizada'),
        message: `${t('mangal.appliedMsg', 'Se aplicó la configuración')}: ${configKey} = ${value}`,
        color: 'teal',
        icon: <IconCheck size={16} />,
      });
    } catch (err: any) {
      showNotification({
        title: t('mangal.errorTitle', 'Error al actualizar'),
        message: err?.message || 'Error desconocido',
        color: 'red',
        icon: <IconX size={16} />,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Group spacing="xs" noWrap>
      <Select
        size="xs"
        value={value}
        data={options}
        onChange={(val) => val && setValue(val)}
        styles={{ input: { minWidth: 260 } }}
      />
      <Button
        size="xs"
        variant={hasChanged ? 'filled' : 'light'}
        color={hasChanged ? 'indigo' : 'gray'}
        disabled={!hasChanged}
        loading={loading}
        leftIcon={<IconCheck size={14} />}
        onClick={handleApply}
      >
        {t('mangal.applyBtn', 'Aplicar')}
      </Button>
    </Group>
  );
}

export function NumberItem({
  configKey,
  initialValue,
  onUpdate,
}: {
  configKey: string;
  initialValue: number;
  onUpdate: (configKey: string, value: number) => Promise<void> | void;
}) {
  const { classes } = useStyles();
  const { t } = useTranslation('settings');
  const [value, setValue] = useState(initialValue);
  const [loading, setLoading] = useState(false);
  const hasChanged = value !== initialValue;

  const handleApply = async () => {
    setLoading(true);
    try {
      await onUpdate(configKey, value);
      showNotification({
        title: t('mangal.appliedTitle', 'Configuración actualizada'),
        message: `${configKey}: ${value}`,
        color: 'teal',
        icon: <IconCheck size={16} />,
      });
    } catch (err: any) {
      showNotification({
        title: t('mangal.errorTitle', 'Error'),
        message: err?.message || 'Error desconocido',
        color: 'red',
        icon: <IconX size={16} />,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Group spacing="xs" noWrap>
      <NumberInput
        size="xs"
        className={classes.numberInput}
        value={value}
        onChange={(newValue) => newValue !== undefined && setValue(newValue)}
      />
      {hasChanged && (
        <Button
          size="xs"
          variant="filled"
          color="indigo"
          loading={loading}
          onClick={handleApply}
        >
          {t('mangal.applyBtn', 'Aplicar')}
        </Button>
      )}
    </Group>
  );
}

export function TextItem({
  configKey,
  initialValue,
  onUpdate,
}: {
  configKey: string;
  initialValue: string | null;
  onUpdate: (configKey: string, value: string) => Promise<void> | void;
}) {
  const { classes } = useStyles();
  const { t } = useTranslation('settings');
  const [value, setValue] = useState(initialValue || '');
  const [loading, setLoading] = useState(false);
  const hasChanged = value !== (initialValue || '');

  const handleApply = async () => {
    setLoading(true);
    try {
      await onUpdate(configKey, value);
      showNotification({
        title: t('mangal.appliedTitle', 'Configuración actualizada'),
        message: `${configKey}: ${value}`,
        color: 'teal',
        icon: <IconCheck size={16} />,
      });
    } catch (err: any) {
      showNotification({
        title: t('mangal.errorTitle', 'Error'),
        message: err?.message || 'Error desconocido',
        color: 'red',
        icon: <IconX size={16} />,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Group spacing="xs" noWrap>
      <TextInput
        size="xs"
        className={classes.textInput}
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && hasChanged) {
            handleApply();
          }
        }}
      />
      {hasChanged && (
        <Button
          size="xs"
          variant="filled"
          color="indigo"
          loading={loading}
          onClick={handleApply}
        >
          {t('mangal.applyBtn', 'Aplicar')}
        </Button>
      )}
    </Group>
  );
}

export function PasswordItem({
  configKey,
  initialValue,
  onUpdate,
}: {
  configKey: string;
  initialValue: string | null;
  onUpdate: (configKey: string, value: string) => void;
}) {
  const { classes } = useStyles();
  const [value, setValue] = useState(initialValue || '');

  return (
    <PasswordInput
      size="xs"
      className={classes.textInput}
      value={value}
      onChange={(event) => event.currentTarget.value !== undefined && setValue(event.currentTarget.value)}
      onBlur={() => {
        if (value !== initialValue) {
          onUpdate(configKey, value);
        }
      }}
    />
  );
}

function ArrayTextItem({
  initialValue,
  onUpdate,
  onRemove,
}: {
  initialValue: string | null;
  onUpdate: (value: string) => void;
  onRemove: () => void;
}) {
  const { classes } = useStyles();
  const [value, setValue] = useState(initialValue || '');

  return (
    <TextInput
      my="sm"
      size="xs"
      className={classes.textInput}
      value={value}
      rightSection={
        <ActionIcon size={18} radius="xl" color="red" variant="filled" onClick={() => onRemove()}>
          <IconX size={16} strokeWidth={1.5} />
        </ActionIcon>
      }
      onChange={(event) => setValue(event.currentTarget.value)}
      onBlur={() => {
        if (value !== initialValue && value) {
          onUpdate(value);
        }
      }}
    />
  );
}

export function ArrayItem({
  configKey,
  initialValue,
  onUpdate,
  itemName,
}: {
  configKey: string;
  initialValue: string[];
  onUpdate: (configKey: string, value: string[]) => void;
  itemName: string;
}) {
  const [value, setValue] = useState<{ [key: string]: string }>(
    initialValue.reduce((acc, v) => ({ ...acc, [nanoid()]: v }), {}),
  );

  useEffect(() => {
    onUpdate(
      configKey,
      Object.values(value).filter((i) => !!i),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey, value]);

  return (
    <Box>
      {Object.entries(value).map(([key, item]) => {
        return (
          <ArrayTextItem
            // eslint-disable-next-line react/no-array-index-key
            key={key}
            initialValue={item}
            onUpdate={(updated) =>
              setValue({
                ...value,
                [key]: updated,
              })
            }
            onRemove={() => {
              const { [key]: removed, ...rest } = value;

              setValue(rest);
            }}
          />
        );
      })}
      <Button fullWidth onClick={() => setValue({ ...value, [nanoid()]: '' })}>
        Add {itemName}
      </Button>
    </Box>
  );
}

export function MangalSettings() {
  const { classes } = useStyles();
  const { t } = useTranslation('settings');
  const utils = trpc.useContext();
  const settings = trpc.settings.query.useQuery();
  const coreStatus = trpc.labs.getStatus.useQuery();
  const mangalUpdate = trpc.settings.update.useMutation();

  const checkCoreUpdatesMutation = trpc.labs.checkCoreUpdates.useMutation({
    onSuccess: async () => {
      await utils.labs.getStatus.invalidate();
    },
  });

  const updateCoreNowMutation = trpc.labs.updateCoreNow.useMutation({
    onSuccess: async (res) => {
      showNotification({
        title: res.success
          ? t('mangal.coreUpdatedTitle', 'Kaizen Core Updated')
          : t('mangal.coreUpdateNoticeTitle', 'Kaizen Core Update'),
        message: res.message,
        color: res.success ? 'teal' : 'orange',
        icon: res.success ? <IconCheck size={16} /> : <IconAlertTriangle size={16} />,
      });
      await Promise.all([utils.labs.getStatus.invalidate(), utils.settings.query.invalidate()]);
    },
  });

  const rollbackCoreMutation = trpc.labs.rollbackCore.useMutation({
    onSuccess: async (res) => {
      showNotification({
        title: res.success
          ? t('mangal.coreRollbackTitle', 'Kaizen Core Rolled Back')
          : t('mangal.coreRollbackNoticeTitle', 'Rollback Notice'),
        message: res.message,
        color: res.success ? 'blue' : 'orange',
        icon: res.success ? <IconCheck size={16} /> : <IconAlertTriangle size={16} />,
      });
      await Promise.all([utils.labs.getStatus.invalidate(), utils.settings.query.invalidate()]);
    },
  });

  const handleUpdate = async (key: string, value: boolean | string | number) => {
    return mangalUpdate
      .mutateAsync({
        key,
        value,
        updateType: 'mangal',
      })
      .then(() => {
        settings.refetch();
      });
  };

  if (settings.isLoading) {
    return null;
  }

  const vc = checkCoreUpdatesMutation.data || coreStatus.data?.diagnostics.versionCheck;
  const doctor = coreStatus.data?.diagnostics.kaizenMangal.doctor;
  const statusColor =
    vc?.compatibilityStatus === 'contract_mismatch'
      ? 'red'
      : vc?.coreUpdateAvailable || vc?.kaizenUpdateAvailable
      ? 'blue'
      : 'teal';

  const formatOptions = [
    { value: 'cbz', label: 'CBZ (Recomendado - Soporte AVIF)' },
    { value: 'zip', label: 'ZIP (Archivo comprimido estándar)' },
    { value: 'pdf', label: 'PDF (Documento - Sin soporte AVIF)' },
    { value: 'plain', label: 'Plain (Imágenes sueltas en carpeta)' },
  ];

  const impersonateOptions = [
    { value: 'chrome_133', label: 'Chrome 133 (Recommended — TLS/HTTP2 Impersonation)' },
    { value: 'chrome_131', label: 'Chrome 131' },
    { value: 'firefox_135', label: 'Firefox 135' },
    { value: 'firefox_133', label: 'Firefox 133' },
    { value: 'safari_16_0', label: 'Safari 16.0' },
    { value: 'none', label: 'None (Standard Go net/http)' },
  ];

  return (
    <Box>
      {/* Kaizen Core Version, Compatibility & Autonomous In-Place Updater */}
      <Paper withBorder p="md" radius="md" mb="lg">
        <Stack spacing="xs">
          <Group position="apart">
            <Group spacing="xs">
              <Title order={5}>{t('mangal.coreUpdaterTitle', 'kaizen-mangal Engine & Autonomous Updater')}</Title>
              <Badge color={statusColor} variant="light">
                {vc?.compatibilityStatus === 'contract_mismatch'
                  ? t('mangal.coreKaizenUpdateRequired', 'Kaizen Update Required')
                  : vc?.coreUpdateAvailable
                  ? t('mangal.coreUpdateAvailable', {
                      version: vc.latestCoreVersion,
                      defaultValue: `Update Available (v${vc.latestCoreVersion})`,
                    })
                  : t('mangal.coreUpToDate', {
                      version: vc?.installedCoreVersion || coreStatus.data?.diagnostics.kaizenMangal.version || '1.2.0',
                      defaultValue: `v${
                        vc?.installedCoreVersion || coreStatus.data?.diagnostics.kaizenMangal.version || '1.2.0'
                      } — Up to Date`,
                    })}
              </Badge>
              <Badge color="gray" variant="outline" size="sm">
                Contract v{vc?.installedContractVersion ?? coreStatus.data?.diagnostics.kaizenMangal.contractVersion ?? 1}
              </Badge>
              {vc?.autoUpdateEnabled && (
                <Badge color="teal" variant="dot" size="sm">
                  {t('mangal.coreAutoUpdateBadge', 'Auto-Update (12h)')}
                </Badge>
              )}
            </Group>
            <Group spacing="xs">
              <Button
                size="xs"
                variant="light"
                color="gray"
                leftIcon={<IconRefresh size={14} />}
                loading={checkCoreUpdatesMutation.isLoading}
                onClick={() => checkCoreUpdatesMutation.mutate({ force: true })}
              >
                {t('mangal.coreCheckNow', 'Check Now')}
              </Button>
              {vc?.coreUpdateAvailable && vc?.contractCompatible && (
                <Button
                  size="xs"
                  color="teal"
                  leftIcon={<IconDownload size={14} />}
                  loading={updateCoreNowMutation.isLoading}
                  onClick={() => updateCoreNowMutation.mutate({ force: false })}
                >
                  {t('mangal.coreUpdateBtn', {
                    version: vc.latestCoreVersion,
                    defaultValue: `Update Core to v${vc.latestCoreVersion}`,
                  })}
                </Button>
              )}
              {vc?.canRollback && (
                <Button
                  size="xs"
                  variant="subtle"
                  color="orange"
                  leftIcon={<IconArrowBackUp size={14} />}
                  loading={rollbackCoreMutation.isLoading}
                  onClick={() => rollbackCoreMutation.mutate()}
                >
                  {t('mangal.coreRollbackBtn', 'Rollback')}
                </Button>
              )}
            </Group>
          </Group>

          <Text size="xs" color="dimmed">
            {vc?.compatibilityMessage ||
              t(
                'mangal.coreUpdaterDesc',
                'Automatically checks GitHub Releases every 12h, verifies SHA-256 checksums and CLI contract compatibility, and updates /config/bin/kaizen-mangal in-place.',
              )}
          </Text>

          <Group spacing="xs">
            <Badge size="xs" variant="outline" color="teal">
              {vc?.usingManagedBinary
                ? t('mangal.coreBinaryManaged', 'Binary: Managed (/config/bin)')
                : t('mangal.coreBinaryBundled', 'Binary: Bundled (/usr/bin)')}
            </Badge>
            {doctor?.tls_profile && (
              <Badge size="xs" variant="outline" color="indigo">
                TLS: {doctor.tls_profile.resolved}
              </Badge>
            )}
            {doctor?.browser && (
              <Badge size="xs" variant="outline" color={doctor.browser.available ? 'teal' : 'orange'}>
                Headless: {doctor.browser.mode}
              </Badge>
            )}
            {doctor?.solver && (
              <Badge size="xs" variant="outline" color={doctor.solver.configured ? 'cyan' : 'gray'}>
                Solver: {doctor.solver.configured ? (doctor.solver.reachable ? 'Online' : 'Unreachable') : 'Off'}
              </Badge>
            )}
            {vc && (
              <Badge size="xs" variant="outline" color={vc.contractCompatible ? 'green' : 'red'}>
                {vc.contractCompatible
                  ? t('mangal.coreContractCompatible', 'Contract Compatible')
                  : t('mangal.coreContractMismatch', 'Contract Mismatch')}
              </Badge>
            )}
          </Group>

          {doctor?.warnings && doctor.warnings.length > 0 && (
            <Alert icon={<IconAlertTriangle size={15} />} color="yellow" p="xs" radius="sm">
              {doctor.warnings.map((w, idx) => (
                <Text key={idx} size="xs">
                  • {w}
                </Text>
              ))}
            </Alert>
          )}
        </Stack>
      </Paper>

      <Divider mb="md" />
      {settings.data?.mangalConfig.map((item) => (
        <Box key={item.key} className={classes.item}>
          <Group position="apart" noWrap spacing="xl">
            <div>
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
                {item.key.split('.').map((val) => val.split('_').join(' '))}
              </Breadcrumbs>
              <Text size="xs" color="dimmed">
                {item.description}
              </Text>
            </div>
            {item.key === 'formats.use' ? (
              <SelectItem
                configKey={item.key}
                initialValue={item.value as string}
                options={formatOptions}
                onUpdate={handleUpdate}
              />
            ) : item.key === 'network.impersonate' ? (
              <SelectItem
                configKey={item.key}
                initialValue={item.value as string}
                options={impersonateOptions}
                onUpdate={handleUpdate}
              />
            ) : item.type === 'bool' ? (
              <SwitchItem configKey={item.key} onUpdate={handleUpdate} initialValue={item.value as boolean} />
            ) : item.type === 'int' ? (
              <NumberItem configKey={item.key} onUpdate={handleUpdate} initialValue={item.value as number} />
            ) : item.type === 'string' &&
              (item.key.toLowerCase().includes('password') ||
              item.key.toLowerCase().includes('token') ||
              item.key.toLowerCase().includes('secret')) ? (
              <PasswordItem configKey={item.key} onUpdate={handleUpdate} initialValue={item.value as string} />
            ) : (
              <TextItem configKey={item.key} onUpdate={handleUpdate} initialValue={item.value as string} />
            )}
          </Group>

          {item.key === 'formats.use' && (
            <Alert
              icon={<IconInfoCircle size={16} />}
              title={t('mangal.formatsAlertTitle', 'Formato de exportación recomendado: CBZ')}
              color="indigo"
              variant="light"
              mt="xs"
              styles={{ title: { fontSize: 13 }, message: { fontSize: 12 } }}
            >
              {t(
                'mangal.formatsAlertDesc',
                'Kaizen y lectores compatibles (Kavita, Komga, Paperback) requieren CBZ. Fuentes con imágenes modernas como AVIF (por ejemplo, Atsumaru) solo se descargan íntegramente en formato CBZ o ZIP. El motor PDF de Mangal no soporta imágenes AVIF y las descarta.',
              )}
            </Alert>
          )}

          {item.key === 'formats.skip_unsupported_images' && (
            <Text size="xs" color="dimmed" mt={4}>
              {t(
                'mangal.skipUnsupportedHint',
                'Nota: En formatos como PDF, omitirá silenciosamente cualquier imagen AVIF.',
              )}
            </Text>
          )}
        </Box>
      ))}
    </Box>
  );
}
