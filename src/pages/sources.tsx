import {
  Badge,
  Button,
  Container,
  Group,
  Paper,
  Stack,
  Text,
  Title,
  ActionIcon,
  Tooltip,
  LoadingOverlay,
  Box,
  SimpleGrid,
  Avatar,
  Divider,
  Switch,
  Modal,
  TextInput,
  Select,
  Menu,
  Stepper,
  Loader,
} from '@mantine/core';
import React, { useState } from 'react';
import { showNotification, updateNotification } from '@mantine/notifications';
import {
  IconCheck,
  IconTrash,
  IconX,
  IconRefresh,
  IconPlus,
  IconPower,
  IconCloudDownload,
  IconBrandGithub,
  IconAlertTriangle,
  IconRobot,
  IconBan,
  IconSparkles,
  IconSearch,
  IconList,
  IconPhoto,
} from '@tabler/icons-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'next-i18next';
import { trpc } from '../utils/trpc';

const getFavicon = (name: string) => {
  const clean = name.replace(/_AI$/, '').replace(/_IA$/, '');
  if (clean.includes(' ') || clean.includes('_') || clean.includes('-')) {
    return null;
  }
  const domain = `${clean.toLowerCase()}.com`;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
};

const KAIZEN_FALLBACK_LOGO = 'https://raw.githubusercontent.com/kaizen-Architecture/Kaizen/main/public/logo.png';

export default function SourcesPage() {
  const { t, i18n } = useTranslation(['common', 'sources']);
  const sourcesQuery = trpc.sources.list.useQuery();
  const blockedSitesQuery = trpc.sources.listBlockedSites.useQuery();
  const syncMutation = trpc.sources.sync.useMutation();
  const generateAiMutation = trpc.sources.generateAiScraper.useMutation();
  const removeBlockedSiteMutation = trpc.sources.removeBlockedSite.useMutation();
  const uploadMutation = trpc.sources.upload.useMutation();
  const toggleMutation = trpc.sources.toggle.useMutation();
  const removeMutation = trpc.sources.remove.useMutation();
  const utils = trpc.useContext();

  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiSiteUrl, setAiSiteUrl] = useState('');
  const [aiSearchUrl, setAiSearchUrl] = useState('');
  const [showAdvancedAi, setShowAdvancedAi] = useState(false);
  const [aiProvider, setAiProvider] = useState<string>('openai');
  const [aiApiKey, setAiApiKey] = useState('');
  const [activeRefiningSource, setActiveRefiningSource] = useState<string | null>(null);
  const [generationFinished, setGenerationFinished] = useState<{ success: boolean; name?: string; error?: string } | null>(null);

  const aiProgressQuery = trpc.sources.getAiProgress.useQuery(undefined, {
    refetchInterval: generateAiMutation.isLoading ? 600 : false,
  });
  const aiProgress = aiProgressQuery.data;

  const settingsQuery = trpc.settings.query.useQuery();
  const appConfig = settingsQuery.data?.appConfig as any;

  // Build the list of providers that actually have credentials saved
  const configuredProviders = (() => {
    if (!appConfig) return [];
    const all = [
      { value: 'openai', label: 'OpenAI', hasKey: !!appConfig.aiOpenAiKey },
      { value: 'anthropic', label: 'Anthropic Claude', hasKey: !!appConfig.aiAnthropicKey },
      { value: 'deepseek', label: 'DeepSeek', hasKey: !!appConfig.aiDeepseekKey },
      { value: 'gemini', label: 'Google Gemini', hasKey: !!appConfig.aiGeminiKey },
      { value: 'azure_openai', label: 'Azure OpenAI', hasKey: !!appConfig.aiAzureKey && !!appConfig.aiAzureEndpoint },
      { value: 'ollama', label: 'Ollama (Local LLM)', hasKey: !!appConfig.aiOllamaUrl },
    ];
    return all
      .filter((p) => p.hasKey)
      .map((p) => ({
        value: p.value,
        label: p.value === (appConfig.aiProvider || 'openai') ? `${p.label} ★` : p.label,
      }));
  })();

  const handleGenerateAi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiSiteUrl) {
      showNotification({
        title: t('common.error'),
        message: t('sources:modal.urlRequired'),
        color: 'red',
      });
      return;
    }

    setGenerationFinished(null);
    try {
      const res = await generateAiMutation.mutateAsync({
        siteUrl: aiSiteUrl,
        ...(aiSearchUrl ? { searchUrl: aiSearchUrl } : {}),
        ...(showAdvancedAi ? { provider: aiProvider, ...(aiApiKey ? { apiKey: aiApiKey } : {}) } : {}),
      });

      setGenerationFinished({ success: true, name: res.name });
      showNotification({
        title: t('sources:notifications.aiGenerated'),
        message: t('sources:notifications.aiGeneratedMessage', { name: res.name }),
        color: 'teal',
        icon: <IconCheck size={18} />,
      });

      setTimeout(() => {
        setAiModalOpen(false);
        setAiSiteUrl('');
        setAiSearchUrl('');
        setGenerationFinished(null);
        utils.sources.list.refetch();
      }, 2000);
    } catch (err: any) {
      setGenerationFinished({ success: false, error: err.message });
      showNotification({
        title: t('common.error'),
        message: err.message || t('sources:notifications.error'),
        color: 'red',
        icon: <IconX size={18} />,
      });
      blockedSitesQuery.refetch();
    }
  };

  const handleRetryWithAI = async (site: { id: number; domain: string }) => {
    try {
      await removeBlockedSiteMutation.mutateAsync({ id: site.id });
      setAiSiteUrl(`https://${site.domain}`);
      setShowAdvancedAi(true);
      setAiProvider(appConfig?.aiProvider || 'openai');
      setAiApiKey('');
      setAiModalOpen(true);
    } catch (err: any) {
      showNotification({
        title: t('sources:notifications.siteUnblockError'),
        message: err.message || t('sources:notifications.siteUnblockError'),
        color: 'red',
      });
    }
  };

  const handleRemoveBlockedSite = async (id: number, domain: string) => {
    try {
      await removeBlockedSiteMutation.mutateAsync({ id });
      showNotification({
        title: t('sources:notifications.siteUnblocked'),
        message: t('sources:notifications.siteUnblockedMessage', { domain }),
        color: 'teal',
        icon: <IconCheck size={18} />,
      });
      blockedSitesQuery.refetch();
    } catch (err: any) {
      showNotification({
        title: t('common.error'),
        message: err.message || t('sources:notifications.siteUnblockError'),
        color: 'red',
        icon: <IconX size={18} />,
      });
    }
  };

  const handleSync = async () => {
    try {
      await syncMutation.mutateAsync();
      showNotification({
        title: t('sources:sync.status'),
        message: t('sources:sync.description'),
        color: 'teal',
        icon: <IconCheck size={18} />,
      });
      utils.sources.list.refetch();
    } catch (err: any) {
      showNotification({
        title: t('common.error'),
        message: err.message || t('sources:notifications.error'),
        color: 'red',
        icon: <IconX size={18} />,
      });
    }
  };

  const handleManualUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.lua';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        const content = event.target?.result as string;
        try {
          await uploadMutation.mutateAsync({ name: file.name, content });
          showNotification({
            title: t('sources:notifications.activated'),
            message: t('sources:notifications.activated'),
            color: 'teal',
            icon: <IconCheck size={18} />,
          });
          utils.sources.list.refetch();
        } catch (err) {
          showNotification({
            title: t('common.error'),
            message: t('sources:notifications.error'),
            color: 'red',
          });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleToggle = async (name: string, activate: boolean, isFailed?: boolean) => {
    try {
      await toggleMutation.mutateAsync({ name, activate, isFailed });
      showNotification({
        title: activate ? t('sources:notifications.activated') : t('sources:notifications.deactivated'),
        message: activate ? t('sources:notifications.activated') : t('sources:notifications.deactivated'),
        color: activate ? 'teal' : 'gray',
        icon: <IconPower size={18} />,
      });
      utils.sources.list.refetch();
    } catch (err) {
      showNotification({
        title: t('common.error'),
        message: t('sources:notifications.toggleError'),
        color: 'red',
      });
    }
  };

  const handleRemove = async (name: string, isActive: boolean, isFailed?: boolean) => {
    if (!window.confirm(t('sources:confirmRemove', { name }) as string)) return;

    try {
      await removeMutation.mutateAsync({ name, isActive, isFailed });
      showNotification({
        title: t('sources:notifications.removed'),
        message: t('sources:notifications.removed'),
        color: 'teal',
        icon: <IconCheck size={18} />,
      });
      utils.sources.list.refetch();
    } catch (err) {
      showNotification({
        title: t('common.error'),
        message: t('sources:notifications.error'),
        color: 'red',
      });
    }
  };

  const refinePhaseMutation = trpc.sources.refinePhase.useMutation({
    onSuccess: (data) => {
      updateNotification({
        id: `refining-${data.sourceName}`,
        title: t('sources:refine.successTitle', '¡Fase refinada con éxito!'),
        message: t('sources:refine.successMsg', {
          phase: data.phase,
          source: data.sourceName,
          defaultValue: `Fase ${data.phase} actualizada para ${data.sourceName}.`,
        }),
        color: 'teal',
        icon: <IconCheck size={18} />,
        loading: false,
        autoClose: 5000,
        disallowClose: false,
      });
      setActiveRefiningSource(null);
      utils.sources.list.refetch();
    },
    onError: (err: any) => {
      if (activeRefiningSource) {
        updateNotification({
          id: `refining-${activeRefiningSource}`,
          title: t('common.error'),
          message: err.message || t('sources:refine.errorMsg', 'Error al refinar la fase.'),
          color: 'red',
          icon: <IconX size={18} />,
          loading: false,
          autoClose: 8000,
          disallowClose: false,
        });
      } else {
        showNotification({
          title: t('common.error'),
          message: err.message || t('sources:refine.errorMsg', 'Error al refinar la fase.'),
          color: 'red',
          icon: <IconX size={18} />,
          autoClose: 8000,
        });
      }
      setActiveRefiningSource(null);
    },
  });

  const handleRefinePhase = (sourceName: string, phase: 'search' | 'chapters' | 'pages') => {
    setActiveRefiningSource(sourceName);
    showNotification({
      id: `refining-${sourceName}`,
      loading: true,
      title: t('sources:refine.loadingTitle', 'Refinando fase con IA...'),
      message: t('sources:refine.loadingMsg', {
        phase,
        source: sourceName,
        defaultValue: `Analizando y refinando fase ${phase} para ${sourceName}...`,
      }),
      autoClose: false,
      disallowClose: true,
    });
    refinePhaseMutation.mutate({ sourceName, phase });
  };

  if (sourcesQuery.isLoading) return <LoadingOverlay visible />;

  const sources = sourcesQuery.data || [];
  const blockedSites = blockedSitesQuery.data || [];
  const aiSources = sources.filter((s) => s.origin === 'AI_GENERATED' && !s.isFailed);
  const githubSources = sources.filter((s) => s.origin === 'GITHUB' && !s.isFailed);
  const localSources = sources.filter((s) => (s.origin === 'LOCAL' || !s.origin) && !s.isFailed);
  const failedSources = sources.filter((s) => s.isFailed);

  function SourceCard({ source }: { source: any }) {
    const [imgError, setImgError] = React.useState(false);
    const faviconUrl = getFavicon(source.name);

    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
      >
        <Paper
          withBorder
          p="xs"
          radius="md"
          sx={(theme) => ({
            backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
            opacity: source.isActive ? 1 : 0.6,
            transition: 'all 0.2s ease',
            '&:hover': {
              boxShadow: theme.shadows.md,
              borderColor: source.isFailed
                ? theme.colors.red[4]
                : source.isActive
                ? theme.colors.indigo[4]
                : theme.colors.gray[4],
            },
          })}
        >
          <Group position="apart" noWrap>
            <Group spacing="sm" sx={{ flex: 1 }}>
              <Avatar
                src={imgError || !faviconUrl ? KAIZEN_FALLBACK_LOGO : faviconUrl}
                size="sm"
                radius="xl"
                styles={{ placeholder: { backgroundColor: 'transparent' } }}
                imageProps={{
                  onError: () => setImgError(true),
                }}
              >
                {source.name[0]}
              </Avatar>
              <Stack spacing={0} sx={{ overflow: 'hidden' }}>
                <Text
                  weight={600}
                  size="sm"
                  sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  {source.name}
                </Text>
                <Group spacing={4}>
                  <Badge
                    size="xs"
                    variant="outline"
                    color={source.origin === 'GITHUB' ? 'blue' : source.origin === 'AI_GENERATED' ? 'grape' : 'gray'}
                    sx={{ width: 'fit-content' }}
                  >
                    {source.origin || 'LOCAL'}
                  </Badge>
                  {source.isFailed && (
                    <Badge color="red" variant="filled" size="xs">
                      {t('sources:failed')}
                    </Badge>
                  )}
                </Group>
              </Stack>
            </Group>

            <Group spacing={4} noWrap>
              {source.isFailed ? (
                <Tooltip label={t('sources:reactivate')}>
                  <Button
                    size="xs"
                    variant="light"
                    color="indigo"
                    onClick={() => handleToggle(source.name, true, true)}
                  >
                    {t('sources:reactivate')}
                  </Button>
                </Tooltip>
              ) : (
                <Tooltip label={source.isActive ? t('common.deactivate') : t('common.activate')}>
                  <Switch
                    size="xs"
                    checked={source.isActive}
                    onChange={(e) => handleToggle(source.name, e.currentTarget.checked)}
                    color="indigo"
                  />
                </Tooltip>
              )}

              <Menu shadow="md" width={220} position="bottom-end" withinPortal>
                <Menu.Target>
                  <Tooltip label={t('sources:refine.buttonTooltip', 'Refinar fase con IA')}>
                    <ActionIcon
                      color="violet"
                      variant="subtle"
                      size="sm"
                      loading={
                        refinePhaseMutation.isLoading &&
                        refinePhaseMutation.variables?.sourceName === source.name
                      }
                    >
                      <IconSparkles size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>{t('sources:refine.menuLabel', 'Refinar Fase con IA')}</Menu.Label>
                  <Menu.Item
                    icon={<IconSearch size={14} />}
                    onClick={() => handleRefinePhase(source.name, 'search')}
                  >
                    {t('sources:refine.phaseSearch', '🔍 Refinar Búsqueda (Fase 1)')}
                  </Menu.Item>
                  <Menu.Item
                    icon={<IconList size={14} />}
                    onClick={() => handleRefinePhase(source.name, 'chapters')}
                  >
                    {t('sources:refine.phaseChapters', '📑 Refinar Capítulos (Fase 2)')}
                  </Menu.Item>
                  <Menu.Item
                    icon={<IconPhoto size={14} />}
                    onClick={() => handleRefinePhase(source.name, 'pages')}
                  >
                    {t('sources:refine.phasePages', '🖼️ Refinar Visor / Páginas (Fase 3)')}
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>

              <Tooltip label={t('common.delete')}>
                <ActionIcon
                  color="red"
                  variant="subtle"
                  size="sm"
                  onClick={() => handleRemove(source.name, source.isActive, source.isFailed)}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
        </Paper>
      </motion.div>
    );
  }

  return (
    <Container size="xl" py="md">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Group position="apart" mb="xl">
          <Stack spacing={0}>
            <Title order={2}>{t('sources:title')}</Title>
            <Text size="sm" color="dimmed">
              {t('sources:description')}
            </Text>
          </Stack>
          <Group>
            <Button
              leftIcon={<IconRobot size={18} />}
              variant="gradient"
              gradient={{ from: 'violet', to: 'grape', deg: 105 }}
              onClick={() => setAiModalOpen(true)}
            >
              {t('sources:generateWithAI')}
            </Button>
            <Button
              leftIcon={<IconCloudDownload size={18} />}
              variant="outline"
              color="indigo"
              loading={syncMutation.isLoading}
              onClick={handleSync}
            >
              {t('sources:sync.button')}
            </Button>
            <Button
              leftIcon={<IconPlus size={18} />}
              variant="filled"
              color="indigo"
              onClick={handleManualUpload}
              loading={uploadMutation.isLoading}
            >
              {t('sources:manualUpload')}
            </Button>
          </Group>
        </Group>
      </motion.div>

      <Modal
        opened={aiModalOpen}
        onClose={() => {
          if (!generateAiMutation.isLoading) {
            setAiModalOpen(false);
            setGenerationFinished(null);
          }
        }}
        closeOnClickOutside={!generateAiMutation.isLoading}
        closeOnEscape={!generateAiMutation.isLoading}
        title={
          <Group spacing="xs">
            <IconRobot color="#8a2be2" size={24} />
            <Text weight={700} size="lg">
              {t('sources:modal.title')}
            </Text>
          </Group>
        }
        centered
        radius="md"
        padding="lg"
      >
        {generateAiMutation.isLoading || generationFinished ? (
          <Stack spacing="md" py="xs">
            <Paper
              withBorder
              p="md"
              radius="md"
              style={{
                backgroundColor: generationFinished?.success
                  ? 'rgba(46, 204, 113, 0.08)'
                  : generationFinished?.error
                  ? 'rgba(231, 76, 60, 0.08)'
                  : 'rgba(138, 43, 226, 0.06)',
                borderColor: generationFinished?.success
                  ? 'rgba(46, 204, 113, 0.3)'
                  : generationFinished?.error
                  ? 'rgba(231, 76, 60, 0.3)'
                  : 'rgba(138, 43, 226, 0.2)',
              }}
            >
              <Group position="apart" mb="sm">
                <Group spacing="xs">
                  <IconRobot color="#8a2be2" size={18} />
                  <Text size="sm" weight={700}>
                    {t('sources:progress.title')}
                  </Text>
                </Group>
                <Badge
                  color={
                    generationFinished?.success ? 'teal' : generationFinished?.error ? 'red' : 'violet'
                  }
                  variant="filled"
                  size="sm"
                >
                  {generationFinished?.success
                    ? '5 / 5'
                    : `${Math.min(Math.max(aiProgress?.step || 1, 1), 5)} / 5`}
                </Badge>
              </Group>

              <Stepper
                active={
                  generationFinished?.success
                    ? 5
                    : generationFinished?.error
                    ? Math.max((aiProgress?.step || 1) - 1, 0)
                    : Math.max((aiProgress?.step || 1) - 1, 0)
                }
                breakpoint="sm"
                color={generationFinished?.error ? 'red' : 'violet'}
                size="xs"
              >
                <Stepper.Step
                  label={t('sources:progress.stepHtml')}
                  icon={<IconCloudDownload size={14} />}
                  loading={generateAiMutation.isLoading && aiProgress?.step === 1}
                />
                <Stepper.Step
                  label={t('sources:progress.stepSearch')}
                  icon={<IconSearch size={14} />}
                  loading={generateAiMutation.isLoading && aiProgress?.step === 2}
                />
                <Stepper.Step
                  label={t('sources:progress.stepChapters')}
                  icon={<IconList size={14} />}
                  loading={generateAiMutation.isLoading && aiProgress?.step === 3}
                />
                <Stepper.Step
                  label={t('sources:progress.stepPages')}
                  icon={<IconPhoto size={14} />}
                  loading={generateAiMutation.isLoading && aiProgress?.step === 4}
                />
                <Stepper.Step
                  label={t('sources:progress.stepTest')}
                  icon={<IconSparkles size={14} />}
                  loading={generateAiMutation.isLoading && aiProgress?.step === 5}
                />
              </Stepper>

              <Divider my="sm" />

              {generationFinished?.success ? (
                <Group spacing="xs">
                  <IconCheck color="#2ecc71" size={18} />
                  <Text size="xs" weight={600} color="teal">
                    {t('sources:progress.completed')} ({t('sources:progress.closing')})
                  </Text>
                </Group>
              ) : generationFinished?.error ? (
                <Stack spacing={4}>
                  <Group spacing="xs">
                    <IconAlertTriangle color="#e74c3c" size={18} />
                    <Text size="xs" weight={600} color="red">
                      {t('sources:progress.failed')}
                    </Text>
                  </Group>
                  <Text size="xs" color="dimmed" lineClamp={3}>
                    {generationFinished.error}
                  </Text>
                </Stack>
              ) : (
                <Group spacing="xs">
                  <Loader size="xs" color="violet" />
                  <Text size="xs" color="dimmed">
                    {i18n.language === 'es'
                      ? aiProgress?.messageEs || 'Analizando sitio y generando código Lua...'
                      : aiProgress?.messageEn || 'Analyzing site and generating Lua code...'}
                  </Text>
                </Group>
              )}
            </Paper>

            {generationFinished?.error && (
              <Button
                variant="light"
                color="gray"
                fullWidth
                onClick={() => {
                  setGenerationFinished(null);
                  setAiModalOpen(false);
                }}
              >
                {t('sources:progress.close')}
              </Button>
            )}
          </Stack>
        ) : (
          <form onSubmit={handleGenerateAi}>
            <Stack spacing="md">
              <Text size="xs" color="dimmed">
                {t('sources:modal.description')}
              </Text>

              <TextInput
                required
                label={t('sources:modal.urlLabel')}
                placeholder={t('sources:modal.urlPlaceholder') as string}
                value={aiSiteUrl}
                onChange={(e) => setAiSiteUrl(e.target.value)}
              />

              <TextInput
                label={t('sources:modal.searchUrlLabel', { fallback: 'Search URL (optional)' })}
                placeholder={
                  t('sources:modal.searchUrlPlaceholder', {
                    fallback: 'https://site.url/search?title=query',
                  }) as string
                }
                value={aiSearchUrl}
                onChange={(e) => setAiSearchUrl(e.target.value)}
                description={t('sources:modal.searchUrlHint', {
                  fallback:
                    'Recommended: provide the search URL for best results. Kaizen auto-discovers if left blank.',
                })}
              />

              <Paper p="xs" withBorder style={{ backgroundColor: 'rgba(138, 43, 226, 0.05)' }}>
                <Text size="xs" color="dimmed">
                  {t('sources:modal.globalConfigHint')}
                </Text>
              </Paper>

              <Button
                variant="subtle"
                compact
                color="violet"
                onClick={() => setShowAdvancedAi(!showAdvancedAi)}
                style={{ alignSelf: 'flex-start' }}
              >
                {showAdvancedAi ? t('sources:modal.advancedHide') : t('sources:modal.advancedShow')}
              </Button>

              {showAdvancedAi && (
                <Stack spacing="xs">
                  <Select
                    label={t('sources:modal.providerLabel')}
                    value={aiProvider}
                    onChange={(val) => setAiProvider(val || 'openai')}
                    data={
                      configuredProviders.length > 0
                        ? configuredProviders
                        : [
                            { value: 'openai', label: 'OpenAI' },
                            { value: 'anthropic', label: 'Anthropic Claude' },
                            { value: 'deepseek', label: 'DeepSeek' },
                            { value: 'gemini', label: 'Google Gemini' },
                            { value: 'azure_openai', label: 'Azure OpenAI' },
                            { value: 'ollama', label: 'Ollama (Local LLM)' },
                          ]
                    }
                    disabled={
                      configuredProviders.length > 0 && !configuredProviders.find((p) => p.value === aiProvider)
                    }
                    rightSection={configuredProviders.length > 0 ? <IconAlertTriangle size={16} /> : null}
                  />

                  {configuredProviders.length === 0 && (
                    <Text size="xs" color="yellow">
                      {t('sources:modal.configureProvidersHint')}
                    </Text>
                  )}

                  <TextInput
                    type="password"
                    label={t('sources:modal.apiKeyLabel')}
                    placeholder="sk-..."
                    value={aiApiKey}
                    onChange={(e) => setAiApiKey(e.target.value)}
                  />
                </Stack>
              )}

              <Button
                type="submit"
                variant="gradient"
                gradient={{ from: 'violet', to: 'grape', deg: 105 }}
                loading={generateAiMutation.isLoading}
                leftIcon={<IconRobot size={18} />}
                fullWidth
                mt="sm"
              >
                {t('sources:modal.generateButton')}
              </Button>
            </Stack>
          </form>
        )}
      </Modal>

      <Stack spacing="xl">
        {blockedSites.length > 0 && (
          <Stack spacing="md">
            <Group spacing="xs">
              <IconBan size={20} color="#e53e3e" />
              <Title order={4} color="red">
                {t('sources:blockedSites.title')}
              </Title>
              <Badge color="red" variant="filled">
                {blockedSites.length}
              </Badge>
            </Group>
            <Text size="xs" color="dimmed">
              {t('sources:blockedSites.description')}
            </Text>
            <Divider variant="dashed" color="red" />
            <SimpleGrid cols={2} spacing="md" breakpoints={[{ maxWidth: 'sm', cols: 1 }]}>
              <AnimatePresence>
                {blockedSites.map((site) => (
                  <motion.div
                    key={site.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                  >
                    <Paper
                      withBorder
                      p="sm"
                      radius="md"
                      style={{
                        borderColor: 'rgba(229, 62, 62, 0.3)',
                        backgroundColor: 'rgba(229, 62, 62, 0.04)',
                      }}
                    >
                      <Group position="apart" align="flex-start" noWrap>
                        <Stack spacing={4} style={{ overflow: 'hidden' }}>
                          <Group spacing="xs" noWrap>
                            <IconBan size={16} color="#e53e3e" />
                            <Text weight={700} size="sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {site.domain}
                            </Text>
                          </Group>
                          <Text size="xs" color="dimmed" lineClamp={2}>
                            {site.reason || t('sources:blockedSites.incompatible')}
                          </Text>
                          <Text size="xs" color="dimmed" style={{ fontSize: '10px' }}>
                            {new Date(site.createdAt).toLocaleDateString()}
                          </Text>
                        </Stack>
                        <Tooltip label={t('sources:blockedSites.removeTooltip')}>
                          <ActionIcon
                            color="red"
                            variant="light"
                            loading={removeBlockedSiteMutation.isLoading}
                            onClick={() => handleRemoveBlockedSite(site.id, site.domain)}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label={t('sources:blockedSites.retryTooltip')}>
                          <ActionIcon color="violet" variant="light" onClick={() => handleRetryWithAI(site)}>
                            <IconRefresh size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Paper>
                  </motion.div>
                ))}
              </AnimatePresence>
            </SimpleGrid>
          </Stack>
        )}

        {failedSources.length > 0 && (
          <Stack spacing="md">
            <Group spacing="xs">
              <IconAlertTriangle size={20} color="red" />
              <Title order={4} color="red">
                {t('sources:failedSources')}
              </Title>
              <Badge color="red" variant="filled">
                {failedSources.length}
              </Badge>
            </Group>
            <Divider variant="dashed" color="red" />
            <SimpleGrid
              cols={3}
              spacing="md"
              breakpoints={[
                { maxWidth: 'md', cols: 2 },
                { maxWidth: 'sm', cols: 1 },
              ]}
            >
              <AnimatePresence>
                {failedSources.map((source) => (
                  <SourceCard key={source.name} source={source} />
                ))}
              </AnimatePresence>
            </SimpleGrid>
          </Stack>
        )}

        {aiSources.length > 0 && (
          <Stack spacing="md">
            <Group spacing="xs">
              <IconRobot size={20} color="#8a2be2" />
              <Title order={4}>{t('sources:aiSources')}</Title>
              <Badge color="grape" variant="filled">
                {aiSources.length}
              </Badge>
            </Group>
            <Divider variant="dashed" color="grape" />
            <SimpleGrid
              cols={3}
              spacing="md"
              breakpoints={[
                { maxWidth: 'md', cols: 2 },
                { maxWidth: 'sm', cols: 1 },
              ]}
            >
              <AnimatePresence>
                {aiSources.map((source) => (
                  <SourceCard key={source.name} source={source} />
                ))}
              </AnimatePresence>
            </SimpleGrid>
          </Stack>
        )}

        {githubSources.length > 0 && (
          <Stack spacing="md">
            <Group spacing="xs">
              <IconBrandGithub size={20} />
              <Title order={4}>{t('sources:githubSync', 'GitHub Sync')}</Title>
              <Badge color="blue" variant="filled">
                {githubSources.length}
              </Badge>
            </Group>
            <Divider variant="dashed" />
            <SimpleGrid
              cols={3}
              spacing="md"
              breakpoints={[
                { maxWidth: 'md', cols: 2 },
                { maxWidth: 'sm', cols: 1 },
              ]}
            >
              <AnimatePresence>
                {githubSources.map((source) => (
                  <SourceCard key={source.name} source={source} />
                ))}
              </AnimatePresence>
            </SimpleGrid>
          </Stack>
        )}

        <Stack spacing="md">
          <Group spacing="xs">
            <IconPlus size={20} />
            <Title order={4}>{t('sources:localSources', 'Local / Manual')}</Title>
            <Badge color="gray" variant="filled">
              {localSources.length}
            </Badge>
          </Group>
          <Divider variant="dashed" />
          <SimpleGrid
            cols={3}
            spacing="md"
            breakpoints={[
              { maxWidth: 'md', cols: 2 },
              { maxWidth: 'sm', cols: 1 },
            ]}
          >
            <AnimatePresence>
              {localSources.map((source) => (
                <SourceCard key={source.name} source={source} />
              ))}
            </AnimatePresence>
          </SimpleGrid>
          {localSources.length === 0 &&
            githubSources.length === 0 &&
            aiSources.length === 0 &&
            failedSources.length === 0 && (
              <Text size="sm" color="dimmed" align="center" py="xl">
                {t('sources:noSources')}
              </Text>
            )}
        </Stack>
      </Stack>
    </Container>
  );
}

export async function getServerSideProps({ locale }: { locale?: string }) {
  const { serverSideTranslations } = await import('next-i18next/serverSideTranslations');
  return {
    props: {
      ...(await serverSideTranslations(locale || 'en', ['common', 'sources', 'settings'])),
    },
  };
}
