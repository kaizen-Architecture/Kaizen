import {
  Alert,
  Box,
  Group,
  SegmentedControl,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Button,
  Collapse,
  Paper,
} from '@mantine/core';
import { IconAlertCircle, IconCode, IconChevronDown, IconChevronUp, IconBook, IconBookOpen } from '@tabler/icons-react';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { trpc } from '../../utils/trpc';

const SwaggerUI = dynamic(() => import('swagger-ui-react'), { ssr: false });

export function DeveloperSettings() {
  const { t } = useTranslation('settings');
  const [showDocs, setShowDocs] = useState(false);

  const settings = trpc.settings.query.useQuery();
  const update = trpc.settings.update.useMutation({
    onSuccess: () => {
      settings.refetch().then(() => {
        window.location.reload();
      });
    },
  });

  const apiEnabledValue = (settings.data?.appConfig as any)?.apiEnabled === true ? 'yes' : 'no';
  const readerEnabledValue = (settings.data?.appConfig as any)?.readerEnabled !== false ? 'yes' : 'no';

  const handleApiToggle = (val: string) => {
    update.mutate({ updateType: 'app', key: 'apiEnabled' as any, value: val === 'yes' });
  };

  const handleReaderToggle = (val: string) => {
    update.mutate({ updateType: 'app', key: 'readerEnabled' as any, value: val === 'yes' });
  };

  if (settings.isLoading || !settings.data) return null;

  return (
    <Stack spacing="md" mt="xs">
      <Group spacing="sm">
        <ThemeIcon size={36} radius="md" color="indigo" variant="light">
          <IconCode size={20} />
        </ThemeIcon>
        <Box>
          <Title order={5}>{t('auth.developerTitle', 'Opciones de la API de Desarrollo')}</Title>
          <Text size="xs" color="dimmed">
            {t(
              'auth.developerDesc',
              'Habilita el acceso externo a los metadatos de tu biblioteca mediante una REST API segura para clientes de terceros y scripts personalizados.',
            )}
          </Text>
        </Box>
      </Group>

      <Stack spacing="xs">
        <Text size="xs" weight={500} color="dimmed">
          {t('auth.apiEnabledLabel', 'REST API Externa')}
        </Text>
        <SegmentedControl
          fullWidth
          value={apiEnabledValue}
          onChange={handleApiToggle}
          disabled={update.isLoading}
          data={[
            { value: 'yes', label: t('auth.apiEnabled', 'Activada') },
            { value: 'no', label: t('auth.apiDisabled', 'Desactivada') },
          ]}
        />
      </Stack>

      <Group spacing="sm" mt="md">
        <ThemeIcon size={36} radius="md" color="teal" variant="light">
          <IconBook size={20} />
        </ThemeIcon>
        <Box>
          <Title order={5}>{t('auth.readerTitle', 'Lector de Manga y Cómics')}</Title>
          <Text size="xs" color="dimmed">
            {t(
              'auth.readerDesc',
              'Habilita o deshabilita el lector web integrado para archivos CBZ de tu biblioteca.',
            )}
          </Text>
        </Box>
      </Group>

      <Stack spacing="xs">
        <SegmentedControl
          fullWidth
          value={readerEnabledValue}
          onChange={handleReaderToggle}
          disabled={update.isLoading}
          data={[
            { value: 'yes', label: t('auth.readerEnabled', 'Activado') },
            { value: 'no', label: t('auth.readerDisabled', 'Desactivado') },
          ]}
        />
      </Stack>

      {apiEnabledValue === 'yes' && (
        <Stack spacing="md" mt="sm">
          <Alert icon={<IconAlertCircle size={16} />} color="indigo" radius="md" variant="light">
            <Stack spacing="xs">
              <Box>
                <Text size="sm" weight={600} mb={4}>
                  {t('auth.docsTitle', 'Documentación Interactiva de la API')}
                </Text>
                <Text size="xs">
                  {t(
                    'auth.docsDesc',
                    'Explora y prueba las rutas REST disponibles en vivo usando nuestra interfaz de Swagger.',
                  )}
                </Text>
              </Box>
              <Group position="left">
                <Button
                  variant="light"
                  color={showDocs ? 'red' : 'indigo'}
                  size="xs"
                  leftIcon={showDocs ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                  onClick={() => setShowDocs(!showDocs)}
                >
                  {showDocs ? t('common.close', 'Cerrar') : t('auth.docsButton', 'Ver Docs')}
                </Button>
              </Group>
            </Stack>
          </Alert>

          <Collapse in={showDocs}>
            <Paper
              p="md"
              radius="md"
              shadow="md"
              sx={(theme) => ({
                backgroundColor: theme.colorScheme === 'dark' ? '#1e293b' : '#ffffff',
                border: `1px solid ${theme.colorScheme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`,
                overflow: 'hidden',

                '& .swagger-ui': {
                  filter: theme.colorScheme === 'dark' ? 'invert(88%) hue-rotate(180deg)' : 'none',

                  '& .info': {
                    margin: '10px 0',
                    '& .title': {
                      fontFamily: 'inherit',
                      fontWeight: 800,
                      fontSize: '20px',
                    },
                  },
                },
              })}
            >
              <SwaggerUI url="/swagger.json" />
            </Paper>
          </Collapse>
        </Stack>
      )}
    </Stack>
  );
}
