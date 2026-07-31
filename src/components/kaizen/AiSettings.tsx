import {
  Accordion,
  Alert,
  Badge,
  Box,
  Button,
  Center,
  createStyles,
  Group,
  Loader,
  PasswordInput,
  Select,
  Stack,
  Text,
  TextInput,
  Paper,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { showNotification } from '@mantine/notifications';
import {
  IconAlertCircle,
  IconCheck,
  IconRobot,
  IconPlug,
  IconCloud,
  IconServer,
  IconKey,
} from '@tabler/icons-react';
import { useState } from 'react';
import { trpc } from '../../utils/trpc';

const useStyles = createStyles((theme) => ({
  item: {
    paddingTop: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    borderTop: `1px solid ${
      theme.colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[2]
    }`,
  },
}));

export function AiSettings() {
  const { t } = useTranslation('settings');
  const { classes } = useStyles();
  const settings = trpc.settings.query.useQuery();
  const update = trpc.settings.update.useMutation();

  const [testLoading, setTestLoading] = useState(false);

  if (settings.isLoading) {
    return (
      <Center py="xl">
        <Loader size="md" color="violet" />
      </Center>
    );
  }

  const appConfig = settings.data?.appConfig || {};

  const handleUpdate = async (key: string, value: any) => {
    try {
      await update.mutateAsync({
        key,
        value,
        updateType: 'app',
      });
      await settings.refetch();
      showNotification({
        title: t('common.saved', 'Guardado'),
        message: `Ajustes de IA actualizados (${key})`,
        color: 'teal',
        icon: <IconCheck size={18} />,
      });
    } catch (err: any) {
      showNotification({
        title: t('common.error', 'Error'),
        message: err.message || 'No se pudo guardar la configuración.',
        color: 'red',
      });
    }
  };

  const handleTestConnection = async () => {
    setTestLoading(true);
    try {
      const gatewayUrl = appConfig.aiGatewayUrl || 'https://kaizen-ai-gateway.d4nj3s.workers.dev';
      const res = await fetch(`${gatewayUrl.replace(/\/$/, '')}/`, { method: 'GET' }).catch(() => null);

      if (res && res.ok) {
        showNotification({
          title: 'Conexión Exitosa ⚡',
          message: `Respuesta correcta del Gateway de IA (${gatewayUrl})`,
          color: 'teal',
          icon: <IconCheck size={18} />,
        });
      } else {
        showNotification({
          title: 'Aviso de Gateway',
          message: `El servidor respondió pero verifica la URL o tu API Key (${gatewayUrl})`,
          color: 'yellow',
          icon: <IconAlertCircle size={18} />,
        });
      }
    } catch (err: any) {
      showNotification({
        title: 'Error de Conexión',
        message: err.message || 'No se pudo conectar con el Gateway de IA.',
        color: 'red',
      });
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <Stack spacing="lg">
      <Paper withBorder p="md" radius="md">
        <Group position="apart" mb="md">
          <Group spacing="xs">
            <IconRobot size={24} color="#8a2be2" />
            <Text weight={700} size="lg">Configuración de Inteligencia Artificial</Text>
          </Group>
          <Button
            leftIcon={<IconPlug size={18} />}
            variant="light"
            color="violet"
            loading={testLoading}
            onClick={handleTestConnection}
          >
            Probar Conexión Gateway ⚡
          </Button>
        </Group>

        <Text size="sm" color="dimmed" mb="lg">
          Configura tus proveedores de IA y tu Gateway de generación automática de scrapers. Las API Keys se procesan de forma privada y nunca se exponen públicamente.
        </Text>

        <Stack spacing="md">
          <TextInput
            label="Gateway / Proxy Endpoint URL (Kaizen AI Gateway)"
            placeholder="https://kaizen-ai-gateway.d4nj3s.workers.dev"
            description="URL del microservicio Cloudflare Worker o Vercel que procesa los scrapers."
            value={appConfig.aiGatewayUrl || ''}
            onBlur={(e) => handleUpdate('aiGatewayUrl', e.target.value)}
          />

          <Select
            label="Proveedor de IA Predeterminado"
            description="Modelo por defecto utilizado al generar nuevos scrapers en Kaizen."
            value={appConfig.aiProvider || 'openai'}
            onChange={(val) => handleUpdate('aiProvider', val || 'openai')}
            data={[
              { value: 'openai', label: 'OpenAI (GPT-4o)' },
              { value: 'anthropic', label: 'Anthropic (Claude 3.5 Sonnet)' },
              { value: 'deepseek', label: 'DeepSeek (DeepSeek V3)' },
              { value: 'gemini', label: 'Google Cloud Gemini (Gemini 1.5 Pro)' },
              { value: 'azure_openai', label: 'Microsoft Azure OpenAI Service' },
              { value: 'aws_bedrock', label: 'Amazon Web Services (AWS Bedrock)' },
              { value: 'ollama', label: 'Ollama (Local / Self-hosted LLM)' },
            ]}
          />
        </Stack>
      </Paper>

      <Accordion variant="contained" radius="md">
        <Accordion.Item value="openai">
          <Accordion.Control icon={<IconKey size={18} color="#10a37f" />}>OpenAI & DeepSeek</Accordion.Control>
          <Accordion.Panel>
            <Stack spacing="md">
              <PasswordInput
                label="OpenAI API Key"
                placeholder="sk-proj-..."
                value={appConfig.aiOpenAiKey || ''}
                onBlur={(e) => handleUpdate('aiOpenAiKey', e.target.value)}
              />
              <PasswordInput
                label="DeepSeek API Key"
                placeholder="sk-..."
                value={appConfig.aiDeepseekKey || ''}
                onBlur={(e) => handleUpdate('aiDeepseekKey', e.target.value)}
              />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="anthropic_gemini">
          <Accordion.Control icon={<IconCloud size={18} color="#d97706" />}>Anthropic Claude & Google Gemini</Accordion.Control>
          <Accordion.Panel>
            <Stack spacing="md">
              <PasswordInput
                label="Anthropic Claude API Key"
                placeholder="sk-ant-api..."
                value={appConfig.aiAnthropicKey || ''}
                onBlur={(e) => handleUpdate('aiAnthropicKey', e.target.value)}
              />
              <PasswordInput
                label="Google Gemini API Key"
                placeholder="AIzaSy..."
                value={appConfig.aiGeminiKey || ''}
                onBlur={(e) => handleUpdate('aiGeminiKey', e.target.value)}
              />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="azure_aws">
          <Accordion.Control icon={<IconCloud size={18} color="#0284c7" />}>Cloud Providers (Azure OpenAI & AWS Bedrock)</Accordion.Control>
          <Accordion.Panel>
            <Stack spacing="md">
              <Text weight={600} size="sm">Microsoft Azure OpenAI Service</Text>
              <PasswordInput
                label="Azure OpenAI API Key"
                placeholder="Azure API Key"
                value={appConfig.aiAzureKey || ''}
                onBlur={(e) => handleUpdate('aiAzureKey', e.target.value)}
              />
              <TextInput
                label="Azure OpenAI Endpoint URL"
                placeholder="https://your-resource.openai.azure.com"
                value={appConfig.aiAzureEndpoint || ''}
                onBlur={(e) => handleUpdate('aiAzureEndpoint', e.target.value)}
              />

              <Text weight={600} size="sm" mt="sm">Amazon Web Services (AWS Bedrock)</Text>
              <TextInput
                label="AWS Access Key ID"
                placeholder="AKIA..."
                value={appConfig.aiAwsAccessKey || ''}
                onBlur={(e) => handleUpdate('aiAwsAccessKey', e.target.value)}
              />
              <PasswordInput
                label="AWS Secret Access Key"
                placeholder="AWS Secret Key"
                value={appConfig.aiAwsSecretKey || ''}
                onBlur={(e) => handleUpdate('aiAwsSecretKey', e.target.value)}
              />
              <TextInput
                label="AWS Region"
                placeholder="us-east-1"
                value={appConfig.aiAwsRegion || ''}
                onBlur={(e) => handleUpdate('aiAwsRegion', e.target.value)}
              />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="ollama">
          <Accordion.Control icon={<IconServer size={18} color="#64748b" />}>Ollama (Local LLM Server)</Accordion.Control>
          <Accordion.Panel>
            <Stack spacing="md">
              <TextInput
                label="Ollama Server URL"
                placeholder="http://localhost:11434"
                description="Servidor local Ollama para ejecutar modelos open-source (ej. Llama 3, Qwen 2.5, DeepSeek R1) gratis."
                value={appConfig.aiOllamaUrl || ''}
                onBlur={(e) => handleUpdate('aiOllamaUrl', e.target.value)}
              />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}
