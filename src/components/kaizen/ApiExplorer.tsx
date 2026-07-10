import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
  Badge,
  Code,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { IconSend, IconCopy, IconCheck, IconAlertCircle } from '@tabler/icons-react';
import { showNotification } from '@mantine/notifications';
import { useTranslation } from 'next-i18next';

export function ApiExplorer() {
  const { t } = useTranslation('settings');
  const [endpoint, setEndpoint] = useState('/api/v1/mangas');
  const [token, setToken] = useState('');
  const [mangaId, setMangaId] = useState('1');
  const [queryParams, setQueryParams] = useState('');
  const [requestBody, setRequestBody] = useState('{\n  "isRead": true\n}');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  // Prepopulate template bodies when endpoint changes
  useEffect(() => {
    if (endpoint === 'PATCH /api/v1/mangas/{id}') {
      setRequestBody('{\n  "isRead": true\n}');
    }
  }, [endpoint]);

  const handleSend = async () => {
    setLoading(true);
    setResponse(null);
    try {
      let targetUrl = '';
      let method = 'GET';

      if (endpoint === '/api/v1/mangas') {
        targetUrl = '/api/v1/mangas';
        if (queryParams.trim()) {
          const cleanQuery = queryParams.trim().startsWith('?') ? queryParams.trim() : `?${queryParams.trim()}`;
          targetUrl += cleanQuery;
        }
      } else if (endpoint === '/api/v1/mangas/{id}') {
        targetUrl = `/api/v1/mangas/${mangaId}`;
      } else if (endpoint === 'PATCH /api/v1/mangas/{id}') {
        targetUrl = `/api/v1/mangas/${mangaId}`;
        method = 'PATCH';
      }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };

      let body: string | undefined;
      if (method === 'PATCH') {
        headers['Content-Type'] = 'application/json';
        body = requestBody;
      }

      const res = await fetch(targetUrl, {
        method,
        headers,
        body,
      });

      const { status } = res;
      const { statusText } = res;
      let data: any;
      try {
        data = await res.json();
      } catch (e) {
        data = await res.text();
      }

      setResponse({
        status,
        statusText,
        ok: res.ok,
        data,
      });
    } catch (err: any) {
      setResponse({
        status: 500,
        statusText: 'Internal Server Error',
        ok: false,
        data: { error: err.message || err },
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!response) return;
    navigator.clipboard.writeText(JSON.stringify(response.data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showNotification({
      title: t('auth.copiedTitle', 'Copiado'),
      message: t('auth.copiedDesc', 'Respuesta de la API copiada al portapapeles'),
      color: 'teal',
    });
  };

  return (
    <Stack spacing="md">
      <Box>
        <Title order={5}>{t('auth.testerTitle', 'Probador de API REST Interactivo')}</Title>
        <Text size="xs" color="dimmed">
          {t(
            'auth.testerDesc',
            'Realiza llamadas reales a la API directamente desde tu navegador para verificar el funcionamiento y las respuestas en tiempo real.',
          )}
        </Text>
      </Box>

      <Paper
        p="md"
        radius="md"
        withBorder
        sx={(theme) => ({
          backgroundColor: theme.colorScheme === 'dark' ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.02)',
          borderColor: theme.colorScheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
        })}
      >
        <Stack spacing="sm">
          <Group grow spacing="md" sx={{ flexWrap: 'wrap' }}>
            <Select
              label={t('auth.endpointLabel', 'Endpoint de la API')}
              value={endpoint}
              onChange={(val) => setEndpoint(val || '/api/v1/mangas')}
              data={[
                { value: '/api/v1/mangas', label: 'GET /api/v1/mangas (Listar / Filtrar)' },
                { value: '/api/v1/mangas/{id}', label: 'GET /api/v1/mangas/{id} (Detalles con Lectura)' },
                {
                  value: 'PATCH /api/v1/mangas/{id}',
                  label: 'PATCH /api/v1/mangas/{id} (Actualizar Estado de Lectura)',
                },
              ]}
              size="sm"
            />
            <TextInput
              label={t('auth.tokenLabel', 'API Token (Bearer)')}
              placeholder={t('auth.tokenPlaceholder', 'Pega tu token de acceso aquí')}
              value={token}
              onChange={(e) => setToken(e.currentTarget.value)}
              size="sm"
            />
          </Group>

          {endpoint === '/api/v1/mangas' && (
            <TextInput
              label={t('auth.queryParamsLabel', 'Parámetros de Búsqueda / Filtros (Opcional)')}
              placeholder="ej. genre=Acción&status=Ongoing o author=Jules"
              value={queryParams}
              onChange={(e) => setQueryParams(e.currentTarget.value)}
              size="sm"
            />
          )}

          {(endpoint === '/api/v1/mangas/{id}' || endpoint === 'PATCH /api/v1/mangas/{id}') && (
            <TextInput
              label={t('auth.mangaIdLabel', 'ID del Manga')}
              placeholder="ej. 1"
              value={mangaId}
              onChange={(e) => setMangaId(e.currentTarget.value)}
              size="sm"
              style={{ maxWidth: '50%' }}
            />
          )}

          {endpoint === 'PATCH /api/v1/mangas/{id}' && (
            <Textarea
              label={t('auth.requestBodyLabel', 'Cuerpo de la Petición (JSON Request Body)')}
              placeholder="ej. { 'isRead': true }"
              value={requestBody}
              onChange={(e) => setRequestBody(e.currentTarget.value)}
              minRows={3}
              maxRows={6}
              autosize
              styles={{ input: { fontFamily: 'monospace', fontSize: '12px' } }}
            />
          )}

          <Group position="right" mt="xs">
            <Button onClick={handleSend} loading={loading} leftIcon={<IconSend size={16} />} color="indigo" size="sm">
              {t('auth.sendRequestButton', 'Enviar Petición')}
            </Button>
          </Group>
        </Stack>
      </Paper>

      {response && (
        <Stack spacing="xs">
          <Group position="apart">
            <Group spacing="xs">
              <Text size="xs" weight={700}>
                {t('auth.responseLabel', 'RESPUESTA:')}
              </Text>
              <Badge color={response.ok ? 'green' : 'red'} variant="filled" size="sm">
                HTTP {response.status} {response.statusText}
              </Badge>
            </Group>
            <Tooltip label={copied ? t('auth.copied', '¡Copiado!') : t('auth.copyJson', 'Copiar JSON')}>
              <ActionIcon onClick={handleCopy} color="indigo" variant="light" size="sm">
                {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
              </ActionIcon>
            </Tooltip>
          </Group>

          <Paper
            p="xs"
            radius="md"
            sx={(theme) => ({
              backgroundColor: theme.colorScheme === 'dark' ? '#0f172a' : '#f8fafc',
              border: `1px solid ${theme.colorScheme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`,
              overflow: 'auto',
              maxHeight: 350,
            })}
          >
            <Code
              block
              color="blue"
              sx={(theme) => ({
                background: 'transparent',
                fontFamily: 'monospace',
                fontSize: '11px',
                color: theme.colorScheme === 'dark' ? '#38bdf8' : '#0369a1',
              })}
            >
              {JSON.stringify(response.data, null, 2)}
            </Code>
          </Paper>
        </Stack>
      )}
    </Stack>
  );
}
