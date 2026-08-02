import {
  Accordion,
  Button,
  Center,
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
import { IconAlertCircle, IconCheck, IconRobot, IconPlug, IconCloud, IconServer, IconKey } from '@tabler/icons-react';
import { useState } from 'react';
import { trpc } from '../../utils/trpc';

interface AiInputProps {
  label?: string;
  placeholder?: string;
  description?: React.ReactNode;
  value: string;
  onUpdate: (val: string) => void;
  style?: React.CSSProperties;
}

function AiTextInput({
  label = undefined,
  placeholder = undefined,
  description = undefined,
  value: initialValue,
  onUpdate,
  style = undefined,
}: AiInputProps) {
  const [val, setVal] = useState(initialValue || '');

  return (
    <TextInput
      style={style}
      label={label}
      placeholder={placeholder}
      description={description}
      value={val}
      onChange={(e) => setVal(e.currentTarget.value)}
      onBlur={() => {
        if (val !== initialValue) {
          onUpdate(val);
        }
      }}
    />
  );
}

function AiPasswordInput({
  label = undefined,
  placeholder = undefined,
  description = undefined,
  value: initialValue,
  onUpdate,
  style = undefined,
}: AiInputProps) {
  const [val, setVal] = useState(initialValue || '');

  return (
    <PasswordInput
      style={style}
      label={label}
      placeholder={placeholder}
      description={description}
      value={val}
      onChange={(e) => setVal(e.currentTarget.value)}
      onBlur={() => {
        if (val !== initialValue) {
          onUpdate(val);
        }
      }}
    />
  );
}

export function AiSettings() {
  const { t } = useTranslation('settings');
  const settings = trpc.settings.query.useQuery();
  const update = trpc.settings.update.useMutation();
  const testConnectionMutation = trpc.settings.testAiConnection.useMutation();

  const [testingProvider, setTestingProvider] = useState<string | null>(null);

  const appConfig = settings.data?.appConfig || {};
  const currentProvider = appConfig.aiProvider || 'openai';

  const modelsQuery = trpc.settings.listAiModels.useQuery(
    { provider: currentProvider },
    { enabled: !!currentProvider },
  );

  if (settings.isLoading) {
    return (
      <Center py="xl">
        <Loader size="md" color="violet" />
      </Center>
    );
  }

  const handleUpdate = async (key: string, value: any) => {
    try {
      await update.mutateAsync({
        key,
        value,
        updateType: 'app',
      });
      await settings.refetch();
      showNotification({
        title: t('common.saved', 'Saved'),
        message: t('ai.savedNotification', `AI settings updated (${key})`, { key }),
        color: 'teal',
        icon: <IconCheck size={18} />,
      });
    } catch (err: any) {
      showNotification({
        title: t('common.error', 'Error'),
        message: err.message || t('ai.saveFailed', 'Could not save settings.'),
        color: 'red',
      });
    }
  };

  const handleTestProvider = async (provider: string, params: Record<string, any> = {}) => {
    setTestingProvider(provider);
    try {
      const res = await testConnectionMutation.mutateAsync({
        provider,
        ...params,
      });

      if (res.success) {
        showNotification({
          title: t('ai.connectionSuccessTitle', 'Connection Successful ⚡'),
          message: res.message,
          color: 'teal',
          icon: <IconCheck size={18} />,
        });
      } else {
        showNotification({
          title: t('ai.connectionFailedTitle', 'Connection Failed ⚠️'),
          message: res.message,
          color: 'red',
          icon: <IconAlertCircle size={18} />,
        });
      }
    } catch (err: any) {
      showNotification({
        title: t('ai.connectionErrorTitle', 'Connection Error'),
        message: err.message || t('ai.serverCommunicationFailed', 'Communication with the server failed.'),
        color: 'red',
      });
    } finally {
      setTestingProvider(null);
    }
  };

  const availableModels = (modelsQuery.data || []).map((m) => ({ value: m, label: m }));

  return (
    <Stack spacing="lg">
      <Paper withBorder p="md" radius="md">
        <Group position="apart" mb="md">
          <Group spacing="xs">
            <IconRobot size={24} color="#8a2be2" />
            <Text weight={700} size="lg">
              {t('ai.title', 'Artificial Intelligence Settings')}
            </Text>
          </Group>
          <Button
            leftIcon={<IconPlug size={18} />}
            variant="light"
            color="violet"
            loading={testingProvider === 'gateway'}
            onClick={() => handleTestProvider('gateway')}
          >
            {t('ai.testGatewayBtn', 'Test Gateway Connection ⚡')}
          </Button>
        </Group>

        <Text size="sm" color="dimmed" mb="lg">
          {t(
            'ai.description',
            'Configure your AI providers and Scraper Generation AI Gateway. API keys are processed securely and never exposed publicly.',
          )}
        </Text>

        <Stack spacing="md">
          <AiTextInput
            label={t('ai.gatewayUrlLabel', 'Gateway / Proxy Endpoint URL (Kaizen AI Gateway)')}
            placeholder="https://kaizen-ai-gateway.kaizen-architecture.workers.dev"
            description={t(
              'ai.gatewayUrlDesc',
              'URL of the Cloudflare Worker or Vercel microservice processing scraper generation.',
            )}
            value={appConfig.aiGatewayUrl || ''}
            onUpdate={(val) => handleUpdate('aiGatewayUrl', val)}
          />

          <Group grow alignment="flex-start">
            <Select
              label={t('ai.defaultProviderLabel', 'Default AI Provider')}
              description={t('ai.defaultProviderDesc', 'Primary service for scraper analysis and generation.')}
              value={currentProvider}
              onChange={(val) => handleUpdate('aiProvider', val || 'openai')}
              data={[
                { value: 'openai', label: 'OpenAI' },
                { value: 'anthropic', label: 'Anthropic Claude' },
                { value: 'deepseek', label: 'DeepSeek AI' },
                { value: 'gemini', label: 'Google Cloud Gemini' },
                { value: 'azure_openai', label: 'Microsoft Azure OpenAI' },
                { value: 'aws_bedrock', label: 'Amazon AWS Bedrock' },
                { value: 'ollama', label: 'Ollama (Local LLM)' },
              ]}
            />

            <Select
              label={t('ai.modelLabel', 'AI Model')}
              description={t('ai.modelDesc', 'Specific model to utilize.')}
              searchable
              creatable
              getCreateLabel={(query) => t('ai.customModelPrompt', `+ Use custom model: "${query}"`, { query })}
              onCreate={(query) => {
                handleUpdate('aiModel', query);
                return query;
              }}
              value={appConfig.aiModel || availableModels[0]?.value || 'gpt-4o'}
              onChange={(val) => handleUpdate('aiModel', val)}
              data={availableModels.length > 0 ? availableModels : [{ value: 'gpt-4o', label: 'gpt-4o' }]}
            />
          </Group>
        </Stack>
      </Paper>

      <Accordion variant="contained" radius="md">
        <Accordion.Item value="openai">
          <Accordion.Control icon={<IconKey size={18} color="#10a37f" />}>
            {t('ai.providers.openai', 'OpenAI & DeepSeek')}
          </Accordion.Control>
          <Accordion.Panel>
            <Stack spacing="md">
              <Group position="apart" align="flex-end">
                <AiPasswordInput
                  style={{ flex: 1 }}
                  label="OpenAI API Key"
                  placeholder="sk-proj-..."
                  value={appConfig.aiOpenAiKey || ''}
                  onUpdate={(val) => handleUpdate('aiOpenAiKey', val)}
                />
                <Button
                  variant="outline"
                  color="teal"
                  loading={testingProvider === 'openai'}
                  onClick={() => handleTestProvider('openai')}
                >
                  {t('ai.providers.testOpenai', 'Test OpenAI')}
                </Button>
              </Group>

              <Group position="apart" align="flex-end">
                <AiPasswordInput
                  style={{ flex: 1 }}
                  label="DeepSeek API Key"
                  placeholder="sk-..."
                  value={appConfig.aiDeepseekKey || ''}
                  onUpdate={(val) => handleUpdate('aiDeepseekKey', val)}
                />
                <Button
                  variant="outline"
                  color="blue"
                  loading={testingProvider === 'deepseek'}
                  onClick={() => handleTestProvider('deepseek')}
                >
                  {t('ai.providers.testDeepseek', 'Test DeepSeek')}
                </Button>
              </Group>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="anthropic_gemini">
          <Accordion.Control icon={<IconCloud size={18} color="#d97706" />}>
            {t('ai.providers.anthropic', 'Anthropic Claude & Google Gemini')}
          </Accordion.Control>
          <Accordion.Panel>
            <Stack spacing="md">
              <Group position="apart" align="flex-end">
                <AiPasswordInput
                  style={{ flex: 1 }}
                  label="Anthropic Claude API Key"
                  placeholder="sk-ant-api..."
                  value={appConfig.aiAnthropicKey || ''}
                  onUpdate={(val) => handleUpdate('aiAnthropicKey', val)}
                />
                <Button
                  variant="outline"
                  color="orange"
                  loading={testingProvider === 'anthropic'}
                  onClick={() => handleTestProvider('anthropic')}
                >
                  {t('ai.providers.testAnthropic', 'Test Anthropic')}
                </Button>
              </Group>

              <Group position="apart" align="flex-end">
                <AiPasswordInput
                  style={{ flex: 1 }}
                  label="Google Gemini API Key"
                  placeholder="AIzaSy..."
                  value={appConfig.aiGeminiKey || ''}
                  onUpdate={(val) => handleUpdate('aiGeminiKey', val)}
                />
                <Button
                  variant="outline"
                  color="grape"
                  loading={testingProvider === 'gemini'}
                  onClick={() => handleTestProvider('gemini')}
                >
                  {t('ai.providers.testGemini', 'Test Gemini')}
                </Button>
              </Group>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="azure_aws">
          <Accordion.Control icon={<IconCloud size={18} color="#0284c7" />}>
            {t('ai.providers.cloud', 'Cloud Providers (Azure OpenAI & AWS Bedrock)')}
          </Accordion.Control>
          <Accordion.Panel>
            <Stack spacing="md">
              <Group position="apart">
                <Text weight={600} size="sm">
                  Microsoft Azure OpenAI Service
                </Text>
                <Button
                  size="xs"
                  variant="outline"
                  color="cyan"
                  loading={testingProvider === 'azure_openai'}
                  onClick={() => handleTestProvider('azure_openai')}
                >
                  {t('ai.providers.testAzure', 'Test Azure OpenAI')}
                </Button>
              </Group>
              <AiPasswordInput
                label="Azure OpenAI API Key"
                placeholder="Azure API Key"
                value={appConfig.aiAzureKey || ''}
                onUpdate={(val) => handleUpdate('aiAzureKey', val)}
              />
              <AiTextInput
                label="Azure OpenAI Endpoint URL"
                placeholder="https://solearningai.services.ai.azure.com/openai/v1"
                value={appConfig.aiAzureEndpoint || ''}
                onUpdate={(val) => handleUpdate('aiAzureEndpoint', val)}
              />

              <Group position="apart" mt="sm">
                <Text weight={600} size="sm">
                  Amazon Web Services (AWS Bedrock)
                </Text>
                <Button
                  size="xs"
                  variant="outline"
                  color="yellow"
                  loading={testingProvider === 'aws_bedrock'}
                  onClick={() => handleTestProvider('aws_bedrock')}
                >
                  {t('ai.providers.testAws', 'Test AWS Bedrock')}
                </Button>
              </Group>
              <AiTextInput
                label="AWS Access Key ID"
                placeholder="AKIA..."
                value={appConfig.aiAwsAccessKey || ''}
                onUpdate={(val) => handleUpdate('aiAwsAccessKey', val)}
              />
              <AiPasswordInput
                label="AWS Secret Access Key"
                placeholder="AWS Secret Key"
                value={appConfig.aiAwsSecretKey || ''}
                onUpdate={(val) => handleUpdate('aiAwsSecretKey', val)}
              />
              <AiTextInput
                label="AWS Region"
                placeholder="us-east-1"
                value={appConfig.aiAwsRegion || ''}
                onUpdate={(val) => handleUpdate('aiAwsRegion', val)}
              />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="ollama">
          <Accordion.Control icon={<IconServer size={18} color="#64748b" />}>
            {t('ai.providers.ollama', 'Ollama (Local LLM Server)')}
          </Accordion.Control>
          <Accordion.Panel>
            <Stack spacing="md">
              <Group position="apart" align="flex-end">
                <AiTextInput
                  style={{ flex: 1 }}
                  label="Ollama Server URL"
                  placeholder="http://localhost:11434"
                  description={t(
                    'ai.providers.ollamaUrlDesc',
                    'Local Ollama server to run open-source models (e.g. Llama 3, Qwen 2.5, DeepSeek R1) for free.',
                  )}
                  value={appConfig.aiOllamaUrl || ''}
                  onUpdate={(val) => handleUpdate('aiOllamaUrl', val)}
                />
                <Button
                  variant="outline"
                  color="dark"
                  loading={testingProvider === 'ollama'}
                  onClick={() => handleTestProvider('ollama')}
                >
                  {t('ai.providers.testOllama', 'Test Ollama')}
                </Button>
              </Group>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}
