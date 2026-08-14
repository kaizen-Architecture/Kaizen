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
  Loader,
  Progress,
  Tabs,
  ThemeIcon,
  Image,
  Textarea,
} from '@mantine/core';
import React, { useState, useEffect } from 'react';
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
  IconFlask,
  IconEye,
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
  const [activeTab, setActiveTab] = useState<string>('active');

  const testScraperMutation = trpc.sources.testScraper.useMutation();
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testSourceName, setTestSourceName] = useState('');
  const [testQuery, setTestQuery] = useState('');
  const [selectedMangaIndex, setSelectedMangaIndex] = useState<number>(0);
  const [showTestLogs, setShowTestLogs] = useState(false);
  const [showPagePreview, setShowPagePreview] = useState(false);
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const [customHtmlSample, setCustomHtmlSample] = useState('');
  const [editingLuaContent, setEditingLuaContent] = useState('');

  const sourceCodeQuery = trpc.sources.getSourceCode.useQuery(
    { sourceName: testSourceName },
    { enabled: inspectModalOpen && !!testSourceName },
  );

  useEffect(() => {
    if (sourceCodeQuery.data?.luaContent) {
      setEditingLuaContent(sourceCodeQuery.data.luaContent);
    }
  }, [sourceCodeQuery.data]);

  const updateSourceCodeMutation = trpc.sources.updateSourceCode.useMutation({
    onSuccess: () => {
      showNotification({
        title: t('sources:notifications.activated', 'Código Lua actualizado'),
        message: t('sources:notifications.activated', 'Se han guardado los cambios en el scraper.'),
        color: 'teal',
        icon: <IconCheck size={18} />,
      });
      setInspectModalOpen(false);
      handleRunTest();
    },
    onError: (err: any) => {
      showNotification({
        title: t('common.error'),
        message: err?.message || t('sources:notifications.error'),
        color: 'red',
        icon: <IconX size={18} />,
      });
    },
  });

  const handleOpenTestModal = (sourceName: string) => {
    setTestSourceName(sourceName);
    setTestQuery('Hero');
    setSelectedMangaIndex(0);
    testScraperMutation.reset();
    setShowTestLogs(false);
    setShowPagePreview(false);
    setInspectModalOpen(false);
    setCustomHtmlSample('');
    setTestModalOpen(true);
  };

  const handleRunTest = (e?: React.FormEvent, indexOverride?: number) => {
    if (e) e.preventDefault();
    if (!testQuery.trim() || !testSourceName) return;
    const idx = indexOverride !== undefined ? indexOverride : selectedMangaIndex;
    testScraperMutation.mutate({
      sourceName: testSourceName,
      query: testQuery.trim(),
      selectedMangaIndex: idx,
    });
  };

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

      const createdName = res.name;
      setGenerationFinished({ success: true, name: createdName });
      showNotification({
        title: t('sources:notifications.aiGenerated', 'Generado con IA'),
        message: t('sources:notifications.aiGeneratedTestPrompt', { name: createdName, defaultValue: `Scraper "${createdName}" creado con éxito. Abriendo prueba de validación...` }),
        color: 'teal',
        icon: <IconCheck size={18} />,
        autoClose: 5000,
      });

      setTimeout(() => {
        setAiModalOpen(false);
        setAiSiteUrl('');
        setAiSearchUrl('');
        setGenerationFinished(null);
        utils.sources.list.refetch();
        handleOpenTestModal(createdName);
      }, 1500);
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
      if (testModalOpen && testSourceName === data.sourceName && testQuery) {
        testScraperMutation.mutate({
          sourceName: data.sourceName,
          query: testQuery,
          selectedMangaIndex,
        });
      }
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
    testScraperMutation.reset();
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
  const activeSourcesCount = aiSources.length + githubSources.length + localSources.length;
  const failedSourcesCount = failedSources.length;
  const blockedSitesCount = blockedSites.length;

  const renderActiveSources = () => (
    <Stack spacing="xl">
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
            <Title order={4}>{t('sources:githubSync.title', 'Sincronización GitHub')}</Title>
            <Badge color="indigo" variant="filled">
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

      {localSources.length > 0 && (
        <Stack spacing="md">
          <Group spacing="xs">
            <Title order={4}>{t('sources:localSources')}</Title>
            <Badge color="blue" variant="filled">
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
        </Stack>
      )}
    </Stack>
  );

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

              <Tooltip label={t('sources:testModal.title', 'Probar y Validar Scraper')}>
                <ActionIcon
                  color="teal"
                  variant="subtle"
                  size="sm"
                  onClick={() => handleOpenTestModal(source.name)}
                >
                  <IconFlask size={14} />
                </ActionIcon>
              </Tooltip>

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
              <Group spacing={6} noWrap>
                <span>{t('sources:generateWithAI')}</span>
                <Badge
                  size="xs"
                  variant="filled"
                  color="grape"
                  sx={{
                    backgroundColor: 'rgba(255, 255, 255, 0.22)',
                    color: '#fff',
                    fontWeight: 700,
                    letterSpacing: '0.3px',
                  }}
                >
                  {t('sources:modal.experimentalBadge', 'BETA')}
                </Badge>
              </Group>
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
        size="lg"
        title={
          <Group spacing="xs">
            <IconRobot color="#8a2be2" size={24} />
            <Text weight={700} size="lg">
              {t('sources:modal.title')}
            </Text>
            <Badge
              size="sm"
              variant="gradient"
              gradient={{ from: 'grape', to: 'pink', deg: 105 }}
            >
              {t('sources:modal.experimentalBadge', 'Experimental')}
            </Badge>
          </Group>
        }
        centered
        radius="lg"
        padding="lg"
      >
        {generateAiMutation.isLoading || generationFinished ? (
          <Stack spacing="md" py="xs">
            {/* Top Status Header */}
            <Paper
              withBorder
              p="md"
              radius="md"
              sx={(theme) => ({
                backgroundColor:
                  generationFinished?.success
                    ? 'rgba(46, 204, 113, 0.08)'
                    : generationFinished?.error
                    ? 'rgba(231, 76, 60, 0.08)'
                    : theme.colorScheme === 'dark'
                    ? 'rgba(138, 43, 226, 0.08)'
                    : 'rgba(138, 43, 226, 0.04)',
                borderColor:
                  generationFinished?.success
                    ? 'rgba(46, 204, 113, 0.4)'
                    : generationFinished?.error
                    ? 'rgba(231, 76, 60, 0.4)'
                    : 'rgba(138, 43, 226, 0.3)',
              })}
            >
              <Group position="apart" mb="xs">
                <Group spacing="sm">
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: generationFinished?.success
                        ? 'rgba(46, 204, 113, 0.2)'
                        : generationFinished?.error
                        ? 'rgba(231, 76, 60, 0.2)'
                        : 'rgba(138, 43, 226, 0.2)',
                    }}
                  >
                    {generationFinished?.success ? (
                      <IconCheck size={20} color="#2ecc71" />
                    ) : generationFinished?.error ? (
                      <IconAlertTriangle size={20} color="#e74c3c" />
                    ) : (
                      <IconRobot size={20} color="#8a2be2" />
                    )}
                  </Box>
                  <Stack spacing={0}>
                    <Text size="sm" weight={700}>
                      {t('sources:progress.title')}
                    </Text>
                    <Text size="xs" color="dimmed" sx={{ maxWidth: 280 }} truncate>
                      {aiSiteUrl}
                    </Text>
                  </Stack>
                </Group>

                <Badge
                  variant="filled"
                  color={
                    generationFinished?.success
                      ? 'teal'
                      : generationFinished?.error
                      ? 'red'
                      : 'violet'
                  }
                  size="md"
                >
                  {generationFinished?.success
                    ? '100%'
                    : generationFinished?.error
                    ? t('sources:progress.failedMessage')
                    : `${Math.min(Math.max(aiProgress?.step || 1, 1), 5)} / 5 (${Math.min(
                        Math.max(((aiProgress?.step || 1) - 1) * 20 + 10, 10),
                        95,
                      )}%)`}
                </Badge>
              </Group>

              <Progress
                value={
                  generationFinished?.success
                    ? 100
                    : Math.min(Math.max(((aiProgress?.step || 1) - 1) * 20 + 10, 10), 95)
                }
                color={
                  generationFinished?.success
                    ? 'teal'
                    : generationFinished?.error
                    ? 'red'
                    : 'violet'
                }
                animate={!generationFinished}
                radius="xl"
                size="sm"
                mt="xs"
              />
            </Paper>

            {/* 5-Step Vertical Checklist */}
            <Stack spacing={6}>
              {[
                {
                  num: 1,
                  title: t('sources:progress.step1Title', '1. Web Sample'),
                  desc: t('sources:progress.step1Desc', 'Connecting and downloading initial HTML structure'),
                  icon: <IconCloudDownload size={15} />,
                },
                {
                  num: 2,
                  title: t('sources:progress.step2Title', '2. Phase 1: Search (SearchManga)'),
                  desc: t('sources:progress.step2Desc', 'Analyzing query endpoint and building SearchManga'),
                  icon: <IconSearch size={15} />,
                },
                {
                  num: 3,
                  title: t('sources:progress.step3Title', '3. Phase 2: Chapters (MangaChapters)'),
                  desc: t('sources:progress.step3Desc', 'Extracting chapter list and chronological sorting'),
                  icon: <IconList size={15} />,
                },
                {
                  num: 4,
                  title: t('sources:progress.step4Title', '4. Phase 3: Reader (ChapterPages)'),
                  desc: t('sources:progress.step4Desc', 'Configuring page selectors and packed JS unpacker'),
                  icon: <IconPhoto size={15} />,
                },
                {
                  num: 5,
                  title: t('sources:progress.step5Title', '5. Validation & Functional Test'),
                  desc: t('sources:progress.step5Desc', 'Validating Lua syntax and verifying search with Mangal'),
                  icon: <IconSparkles size={15} />,
                },
              ].map((step) => {
                const currentStep = generationFinished?.success ? 5 : aiProgress?.step || 1;
                const isDone = generationFinished?.success || currentStep > step.num;
                const isActive = !generationFinished && currentStep === step.num;
                const isFailedStep = generationFinished?.error && currentStep === step.num;

                return (
                  <Paper
                    key={step.num}
                    withBorder
                    p="xs"
                    radius="md"
                    sx={(theme) => ({
                      backgroundColor: isDone
                        ? theme.colorScheme === 'dark'
                          ? 'rgba(46, 204, 113, 0.05)'
                          : 'rgba(46, 204, 113, 0.03)'
                        : isActive
                        ? theme.colorScheme === 'dark'
                          ? 'rgba(138, 43, 226, 0.12)'
                          : 'rgba(138, 43, 226, 0.06)'
                        : isFailedStep
                        ? 'rgba(231, 76, 60, 0.08)'
                        : theme.colorScheme === 'dark'
                        ? theme.colors.dark[7]
                        : theme.colors.gray[0],
                      borderColor: isDone
                        ? 'rgba(46, 204, 113, 0.3)'
                        : isActive
                        ? 'rgba(138, 43, 226, 0.45)'
                        : isFailedStep
                        ? 'rgba(231, 76, 60, 0.4)'
                        : theme.colorScheme === 'dark'
                        ? theme.colors.dark[5]
                        : theme.colors.gray[2],
                      transition: 'all 0.2s ease',
                    })}
                  >
                    <Group position="apart" noWrap>
                      <Group spacing="sm" noWrap sx={{ flex: 1 }}>
                        <Box
                          sx={{
                            width: 28,
                            height: 28,
                            minWidth: 28,
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: isDone
                              ? 'rgba(46, 204, 113, 0.2)'
                              : isActive
                              ? 'rgba(138, 43, 226, 0.25)'
                              : isFailedStep
                              ? 'rgba(231, 76, 60, 0.25)'
                              : 'rgba(255, 255, 255, 0.06)',
                          }}
                        >
                          {isDone ? (
                            <IconCheck size={16} color="#2ecc71" />
                          ) : isActive ? (
                            <Loader size={14} color="violet" />
                          ) : isFailedStep ? (
                            <IconAlertTriangle size={14} color="#e74c3c" />
                          ) : (
                            <Text size="xs" weight={700} color="dimmed">
                              {step.num}
                            </Text>
                          )}
                        </Box>

                        <Stack spacing={1} sx={{ overflow: 'hidden' }}>
                          <Text
                            size="xs"
                            weight={isActive || isDone ? 700 : 500}
                            color={
                              isDone
                                ? 'teal'
                                : isActive
                                ? 'violet'
                                : isFailedStep
                                ? 'red'
                                : undefined
                            }
                            sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                          >
                            {step.title}
                          </Text>
                          <Text size="xs" color="dimmed" sx={{ fontSize: '11px', lineHeight: 1.2 }}>
                            {step.desc}
                          </Text>
                        </Stack>
                      </Group>

                      <Badge
                        size="xs"
                        variant={isDone ? 'light' : isActive ? 'filled' : 'outline'}
                        color={isDone ? 'teal' : isActive ? 'violet' : isFailedStep ? 'red' : 'gray'}
                        sx={{ textTransform: 'none' }}
                      >
                        {isDone
                          ? t('sources:progress.statusCompleted')
                          : isActive
                          ? t('sources:progress.statusActive')
                          : isFailedStep
                          ? t('common.error')
                          : t('sources:progress.statusPending')}
                      </Badge>
                    </Group>
                  </Paper>
                );
              })}
            </Stack>

            {/* Terminal / Live Status Strip */}
            <Paper
              p="xs"
              radius="md"
              sx={(theme) => ({
                backgroundColor:
                  theme.colorScheme === 'dark' ? 'rgba(0, 0, 0, 0.45)' : 'rgba(0, 0, 0, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              })}
            >
              {generationFinished?.success ? (
                <Group spacing="xs">
                  <IconCheck size={16} color="#2ecc71" />
                  <Text size="xs" weight={600} color="teal">
                    {t('sources:progress.successMessage')} ({t('sources:progress.closingNotice')})
                  </Text>
                </Group>
              ) : generationFinished?.error ? (
                <Stack spacing={4}>
                  <Group spacing="xs">
                    <IconAlertTriangle size={16} color="#e74c3c" />
                    <Text size="xs" weight={600} color="red">
                      {t('sources:progress.failedMessage')}
                    </Text>
                  </Group>
                  <Text size="xs" color="dimmed" sx={{ fontSize: '11px' }}>
                    {generationFinished.error}
                  </Text>
                </Stack>
              ) : (
                <Group spacing="xs" noWrap>
                  <Loader size={12} color="violet" />
                  <Text size="xs" color="dimmed" sx={{ fontSize: '11px', fontFamily: 'monospace' }}>
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
              <Paper
                p="xs"
                withBorder
                sx={{
                  backgroundColor: 'rgba(138, 43, 226, 0.05)',
                  borderColor: 'rgba(138, 43, 226, 0.2)',
                }}
              >
                <Group spacing="xs" noWrap>
                  <IconSparkles size={16} color="#8a2be2" />
                  <Text size="xs" color="dimmed">
                    {t('sources:modal.experimentalNotice')}
                  </Text>
                </Group>
              </Paper>

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

      {/* Conditionally render tabs based on data existence */}
      {(failedSources.length > 0 || blockedSites.length > 0) ? (
        <Tabs defaultValue="active" radius="md">
          <Tabs.List mb="xl">
            <Tabs.Tab
              value="active"
              icon={<IconCheck size={16} color="#10a37f" />}
              rightSection={
                <Badge size="xs" variant="filled" color="teal">
                  {activeSourcesCount}
                </Badge>
              }
            >
              {t('sources:tabs.active', 'Fuentes Activas')}
            </Tabs.Tab>

            {failedSources.length > 0 && (
              <Tabs.Tab
                value="failed"
                icon={<IconAlertTriangle size={16} color="#e53e3e" />}
                rightSection={
                  <Badge size="xs" variant="filled" color="red">
                    {failedSources.length}
                  </Badge>
                }
              >
                {t('sources:tabs.failed', 'Fuentes Fallidas')}
              </Tabs.Tab>
            )}

            {blockedSites.length > 0 && (
              <Tabs.Tab
                value="blacklist"
                icon={<IconBan size={16} color="#e53e3e" />}
                rightSection={
                  <Badge size="xs" variant="filled" color="red">
                    {blockedSites.length}
                  </Badge>
                }
              >
                {t('sources:tabs.blacklist', 'Lista Negra')}
              </Tabs.Tab>
            )}
          </Tabs.List>

          <Tabs.Panel value="active">
            {(() => {
              const renderActiveSources = () => (
                <Stack spacing="xl">
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
                        <Title order={4}>{t('sources:githubSync.title', 'Sincronización GitHub')}</Title>
                        <Badge color="indigo" variant="filled">
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

                  {localSources.length > 0 && (
                    <Stack spacing="md">
                      <Group spacing="xs">
                        <Title order={4}>{t('sources:localSources')}</Title>
                        <Badge color="blue" variant="filled">
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
                    </Stack>
                  )}
                </Stack>
              );
              return renderActiveSources();
            })()}
          </Tabs.Panel>

          {failedSources.length > 0 && (
            <Tabs.Panel value="failed">
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
            </Tabs.Panel>
          )}

          {blockedSites.length > 0 && (
            <Tabs.Panel value="blacklist">
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
                            <Group spacing="xs" noWrap>
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
                          </Group>
                        </Paper>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </SimpleGrid>
              </Stack>
            </Tabs.Panel>
          )}
        </Tabs>
      ) : (
        renderActiveSources()
      )}

      {/* Test Scraper Modal */}
      <Modal
        opened={testModalOpen}
        onClose={() => {
          if (!testScraperMutation.isLoading) {
            setTestModalOpen(false);
          }
        }}
        title={
          <Group spacing="xs">
            <ThemeIcon color="teal" variant="light" size="lg" radius="md">
              <IconFlask size={20} />
            </ThemeIcon>
            <div>
              <Text weight={700} size="md">
                {t('sources:testModal.title', 'Probar y Validar Scraper')}
              </Text>
              <Text size="xs" color="dimmed">
                {testSourceName}
              </Text>
            </div>
          </Group>
        }
        size="lg"
        radius="md"
        centered
        closeOnClickOutside={!testScraperMutation.isLoading}
        closeOnEscape={!testScraperMutation.isLoading}
      >
        <Stack spacing="md">
          <Text size="xs" color="dimmed">
            {t('sources:testModal.description', { name: testSourceName })}
          </Text>

          <form onSubmit={handleRunTest}>
            <Group position="apart" align="flex-end">
              <TextInput
                label={String(t('sources:testModal.queryLabel', 'Manga para Probar'))}
                placeholder={String(t('sources:testModal.queryPlaceholder', 'Ej: One Piece, Hero, Naruto...'))}
                value={testQuery}
                onChange={(e) => setTestQuery(e.currentTarget.value)}
                disabled={testScraperMutation.isLoading}
                sx={{ flex: 1 }}
                required
              />
              <Button
                type="submit"
                color="teal"
                loading={testScraperMutation.isLoading}
                leftIcon={<IconFlask size={16} />}
              >
                {t('sources:testModal.runButton', 'Ejecutar Prueba')}
              </Button>
            </Group>
          </form>

          {refinePhaseMutation.isLoading && (
            <Paper withBorder p="md" radius="md" sx={{ backgroundColor: 'rgba(138, 43, 226, 0.08)', borderColor: 'rgba(138, 43, 226, 0.4)' }}>
              <Group position="center" my="xs">
                <Loader size="md" color="grape" />
                <div>
                  <Group spacing="xs">
                    <IconSparkles size={18} color="#8a2be2" />
                    <Text size="sm" weight={700} color="grape">
                      {t('sources:testModal.refiningProgressTitle', 'La IA está corrigiendo y refinando el scraper...')}
                    </Text>
                  </Group>
                  <Text size="xs" color="dimmed" mt={4}>
                    {t('sources:testModal.refiningProgressDesc', {
                      source: testSourceName,
                      phase: refinePhaseMutation.variables?.phase
                        ? t(`sources:testModal.phase${refinePhaseMutation.variables.phase.charAt(0).toUpperCase() + refinePhaseMutation.variables.phase.slice(1)}Name` as any, refinePhaseMutation.variables.phase)
                        : '',
                    })}
                  </Text>
                </div>
              </Group>
            </Paper>
          )}

          {refinePhaseMutation.isError && (
            <Paper withBorder p="md" radius="md" sx={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', borderColor: 'red' }}>
              <Stack spacing="xs">
                <Text size="sm" weight={700} color="red">
                  {t('sources:testModal.refineFailedTitle', 'No se pudo refinar la fase con IA')}
                </Text>
                <Text size="xs" color="dimmed">
                  {refinePhaseMutation.error?.message}
                </Text>
                <Group spacing="xs" mt="xs">
                  <Button
                    size="xs"
                    variant="light"
                    color="violet"
                    leftIcon={<IconRefresh size={14} />}
                    onClick={() => {
                      if (refinePhaseMutation.variables?.phase) {
                        handleRefinePhase(testSourceName, refinePhaseMutation.variables.phase);
                      }
                    }}
                  >
                    {t('sources:testModal.retryRefineButton', 'Reintentar Refinamiento con IA')}
                  </Button>
                </Group>
              </Stack>
            </Paper>
          )}

          {testScraperMutation.isLoading && (
            <Paper withBorder p="md" radius="md" sx={{ backgroundColor: 'rgba(20, 184, 166, 0.05)' }}>
              <Group position="center" my="xs">
                <Loader size="md" color="teal" />
                <div>
                  <Text size="sm" weight={600} color="teal">
                    {t('sources:testModal.testingProgress', 'Ejecutando validación en 3 fases...')}
                  </Text>
                  <Text size="xs" color="dimmed">
                    {t('sources:testModal.testingProgressDesc', 'Search → Chapter discovery → Single chapter temp download → CBZ validation')}
                  </Text>
                </div>
              </Group>
            </Paper>
          )}

          {testScraperMutation.data && !testScraperMutation.isLoading && !refinePhaseMutation.isLoading && (
            <Stack spacing="sm">
              {testScraperMutation.data.searchResults && testScraperMutation.data.searchResults.length > 1 && (
                <Paper withBorder p="xs" radius="md" sx={{ backgroundColor: 'rgba(99, 102, 241, 0.08)', borderColor: 'rgba(99, 102, 241, 0.3)' }}>
                  <Stack spacing={4}>
                    <Text size="xs" weight={700} color="indigo">
                      {t('sources:testModal.multipleResultsTitle', {
                        count: testScraperMutation.data.searchResults.length,
                        defaultValue: `🎯 Coincidencias encontradas (${testScraperMutation.data.searchResults.length}): Selecciona el manga a probar`,
                      })}
                    </Text>
                    <Select
                      size="xs"
                      data={testScraperMutation.data.searchResults.map((r, i) => ({
                        value: String(i),
                        label: `${i + 1}. ${r.title}`,
                      }))}
                      value={String(selectedMangaIndex)}
                      onChange={(val) => {
                        const idx = Number(val || '0');
                        setSelectedMangaIndex(idx);
                        handleRunTest(undefined, idx);
                      }}
                      disabled={testScraperMutation.isLoading}
                    />
                  </Stack>
                </Paper>
              )}

              <Group position="apart">
                <Badge
                  color={
                    testScraperMutation.data.isSuspicious
                      ? 'orange'
                      : testScraperMutation.data.success
                      ? 'teal'
                      : 'red'
                  }
                  variant="filled"
                  size="lg"
                >
                  {testScraperMutation.data.isSuspicious
                    ? t('sources:testModal.suspiciousBadge', {
                        count: testScraperMutation.data.downloadedPagesCount,
                        defaultValue: `VALIDACIÓN SOSPECHOSA (${testScraperMutation.data.downloadedPagesCount} pág)`,
                      })
                    : testScraperMutation.data.success
                    ? t('sources:testModal.successBadge', 'Validación Superada')
                    : t('sources:testModal.failedBadge', {
                        phase: testScraperMutation.data.failedPhase
                          ? t(`sources:testModal.phase${testScraperMutation.data.failedPhase.charAt(0).toUpperCase() + testScraperMutation.data.failedPhase.slice(1)}Name` as any, testScraperMutation.data.failedPhase)
                          : '',
                      })}
                </Badge>
                {testScraperMutation.data.logs && testScraperMutation.data.logs.length > 0 && (
                  <Button
                    variant="subtle"
                    size="xs"
                    compact
                    onClick={() => setShowTestLogs(!showTestLogs)}
                  >
                    {showTestLogs
                      ? t('sources:testModal.hideLogs', 'Ocultar Logs')
                      : t('sources:testModal.logsTitle', 'Logs de Ejecución')}
                  </Button>
                )}
              </Group>

              {testScraperMutation.data.success && !testScraperMutation.data.isSuspicious ? (
                <Paper withBorder p="md" radius="md" sx={{ backgroundColor: 'rgba(20, 184, 166, 0.08)' }}>
                  <Stack spacing="xs">
                    <Group position="apart">
                      <Text size="sm" weight={600}>
                        {t('sources:testModal.mangaFound', 'Manga localizado:')}
                      </Text>
                      <Text size="sm" weight={700} color="teal">
                        {testScraperMutation.data.mangaTitleFound}
                      </Text>
                    </Group>
                    <Group position="apart">
                      <Text size="sm" weight={600}>
                        {t('sources:testModal.chaptersFound', 'Capítulos detectados:')}
                      </Text>
                      <Badge color="blue" variant="light">
                        {testScraperMutation.data.totalChaptersFound}
                      </Badge>
                    </Group>
                    <Group position="apart">
                      <Text size="sm" weight={600}>
                        {t('sources:testModal.pagesDownloaded', 'Páginas válidas en CBZ:')}
                      </Text>
                      <Badge color="teal" variant="filled">
                        {testScraperMutation.data.downloadedPagesCount} {t('sources:testModal.pagesUnit', 'págs')}
                      </Badge>
                    </Group>

                    {testScraperMutation.data.cbzSizeBytes !== undefined && (
                      <Group position="apart">
                        <Text size="sm" weight={600}>
                          {t('sources:testModal.cbzSize', 'Tamaño del paquete CBZ:')}
                        </Text>
                        <Badge
                          color={
                            testScraperMutation.data.cbzSizeBytes > 500 * 1024
                              ? 'teal'
                              : testScraperMutation.data.cbzSizeBytes > 100 * 1024
                              ? 'blue'
                              : 'yellow'
                          }
                          variant="filled"
                        >
                          {(testScraperMutation.data.cbzSizeBytes / (1024 * 1024)).toFixed(2) >= '0.10'
                            ? `${(testScraperMutation.data.cbzSizeBytes / (1024 * 1024)).toFixed(2)} MB`
                            : `${(testScraperMutation.data.cbzSizeBytes / 1024).toFixed(0)} KB`}
                        </Badge>
                      </Group>
                    )}

                    {testScraperMutation.data.firstPageBase64 && (
                      <Stack spacing="xs" mt="xs">
                        <Group position="apart">
                          <Text size="xs" weight={600} color="dimmed">
                            {t('sources:testModal.previewPageTitle', 'Vista previa de la 1ª página extraída:')}
                          </Text>
                          <Button
                            variant="subtle"
                            size="xs"
                            compact
                            leftIcon={<IconEye size={14} />}
                            onClick={() => setShowPagePreview(!showPagePreview)}
                          >
                            {showPagePreview
                              ? t('sources:testModal.hidePreview', 'Ocultar 1ª página')
                              : t('sources:testModal.showPreview', 'Ver 1ª página')}
                          </Button>
                        </Group>

                        {showPagePreview && (
                          <Paper withBorder p="xs" radius="md" sx={{ backgroundColor: 'rgba(0,0,0,0.25)', textAlign: 'center' }}>
                            <Image
                              src={testScraperMutation.data.firstPageBase64}
                              alt="Preview Page 1"
                              fit="contain"
                              height={320}
                              radius="sm"
                              caption={testScraperMutation.data.firstPageFileName || 'Página 1'}
                            />
                          </Paper>
                        )}
                      </Stack>
                    )}

                    <Divider my="xs" />
                    <Text size="xs" color="dimmed">
                      {t('sources:testModal.tempNotice')}
                    </Text>
                  </Stack>
                </Paper>
              ) : (
                <Paper
                  withBorder
                  p="md"
                  radius="md"
                  sx={{
                    backgroundColor: testScraperMutation.data.isSuspicious
                      ? 'rgba(245, 158, 11, 0.08)'
                      : 'rgba(239, 68, 68, 0.08)',
                    borderColor: testScraperMutation.data.isSuspicious
                      ? 'orange'
                      : 'red',
                  }}
                >
                  <Stack spacing="xs">
                    <Text
                      size="sm"
                      weight={700}
                      color={testScraperMutation.data.isSuspicious ? 'orange' : 'red'}
                    >
                      {testScraperMutation.data.isSuspicious
                        ? testScraperMutation.data.warningDetail || 'La descarga de imágenes parece incompleta.'
                        : testScraperMutation.data.errorKey
                        ? t(`sources:testModal.errors.${testScraperMutation.data.errorKey}` as any, {
                            query: testQuery,
                            defaultValue: testScraperMutation.data.errorDetail,
                          })
                        : testScraperMutation.data.errorDetail || 'La prueba del scraper ha fallado.'}
                    </Text>

                    {testScraperMutation.data.mangaTitleFound && (
                      <Group position="apart">
                        <Text size="xs" color="dimmed">
                          {t('sources:testModal.mangaFound', 'Manga localizado:')}
                        </Text>
                        <Text size="xs" weight={600}>
                          {testScraperMutation.data.mangaTitleFound}
                        </Text>
                      </Group>
                    )}

                    <Divider my="xs" />

                    <Text size="xs" weight={600} color="dimmed">
                      {t('sources:testModal.recommendedActions', 'Acciones recomendadas:')}
                    </Text>

                    <Group spacing="xs">
                      {testScraperMutation.data.hasAiConfigured && testScraperMutation.data.failedPhase ? (
                        <Button
                          size="xs"
                          variant="gradient"
                          gradient={{ from: 'violet', to: 'indigo' }}
                          leftIcon={<IconSparkles size={14} />}
                          loading={refinePhaseMutation.isLoading}
                          onClick={() => {
                            if (testScraperMutation.data?.failedPhase) {
                              handleRefinePhase(testSourceName, testScraperMutation.data.failedPhase);
                            }
                          }}
                        >
                          {t('sources:testModal.refineAiButton', {
                            phase: testScraperMutation.data.failedPhase
                              ? t(
                                  `sources:testModal.phase${
                                    testScraperMutation.data.failedPhase.charAt(0).toUpperCase() +
                                    testScraperMutation.data.failedPhase.slice(1)
                                  }Name` as any,
                                  testScraperMutation.data.failedPhase,
                                )
                              : '',
                          })}
                        </Button>
                      ) : (
                        <Button
                          size="xs"
                          variant="light"
                          color="indigo"
                          leftIcon={<IconRobot size={14} />}
                          onClick={() => {
                            window.location.href = '/settings';
                          }}
                        >
                          {t('sources:testModal.configureAiButton', '⚙️ Configurar IA')}
                        </Button>
                      )}

                      <Button
                        size="xs"
                        variant="light"
                        color="blue"
                        leftIcon={<IconSearch size={14} />}
                        onClick={() => setInspectModalOpen(true)}
                      >
                        {t('sources:testModal.inspectHtmlButton', '🛠️ Inspeccionar HTML / Ajuste Manual')}
                      </Button>

                      <Button
                        size="xs"
                        variant="light"
                        color="red"
                        leftIcon={<IconX size={14} />}
                        onClick={() => {
                          handleToggle(testSourceName, false, true);
                          setTestModalOpen(false);
                        }}
                      >
                        {t('sources:testModal.markFailedButton', '❌ Marcar Fuente como Fallida')}
                      </Button>
                    </Group>
                  </Stack>
                </Paper>
              )}

              {showTestLogs && testScraperMutation.data.logs && (
                <Paper
                  withBorder
                  p="xs"
                  radius="md"
                  sx={{
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    backgroundColor: '#1a1b1e',
                    color: '#c1c2c5',
                    maxHeight: '160px',
                    overflowY: 'auto',
                  }}
                >
                  {testScraperMutation.data.logs.map((l: string, idx: number) => (
                    <div key={idx}>{l}</div>
                  ))}
                </Paper>
              )}
            </Stack>
          )}
        </Stack>
      </Modal>

      <Modal
        opened={inspectModalOpen}
        onClose={() => setInspectModalOpen(false)}
        title={
          <Group spacing="xs">
            <ThemeIcon color="blue" variant="light" size="lg" radius="md">
              <IconSearch size={20} />
            </ThemeIcon>
            <div>
              <Text weight={700} size="md">
                {t('sources:testModal.inspectTitle', 'Inspección de HTML y Edición de Código Lua')}
              </Text>
              <Text size="xs" color="dimmed">
                {testSourceName}
              </Text>
            </div>
          </Group>
        }
        size="xl"
        radius="md"
        centered
      >
        <Stack spacing="md">
          <Text size="xs" color="dimmed">
            {t(
              'sources:testModal.inspectDesc',
              'Si la IA no detecta todas las páginas, puedes proporcionar una URL de capítulo o muestra de HTML personalizada para re-evaluar la IA, o editar manualmente el código Lua del scraper.',
            )}
          </Text>

          <Paper withBorder p="sm" radius="md" sx={{ backgroundColor: 'rgba(99, 102, 241, 0.05)' }}>
            <Stack spacing="xs">
              <Text weight={700} size="xs" color="indigo">
                {t('sources:testModal.customUrlLabel', 'URL de Capítulo / Muestra de HTML Personalizada:')}
              </Text>
              <TextInput
                size="xs"
                placeholder={String(
                  t(
                    'sources:testModal.customUrlPlaceholder',
                    'Ej: https://sitio.com/manga/.../c001/1.html o pegar HTML...',
                  ),
                )}
                value={customHtmlSample}
                onChange={(e) => setCustomHtmlSample(e.currentTarget.value)}
              />
              <Group position="right">
                <Button
                  size="xs"
                  variant="gradient"
                  gradient={{ from: 'violet', to: 'indigo' }}
                  leftIcon={<IconSparkles size={14} />}
                  loading={refinePhaseMutation.isLoading}
                  onClick={() => {
                    handleRefinePhase(
                      testSourceName,
                      'pages',
                    );
                    setInspectModalOpen(false);
                  }}
                >
                  {t('sources:testModal.refineWithCustomHtmlButton', '🤖 Refinar Fase con este HTML/URL')}
                </Button>
              </Group>
            </Stack>
          </Paper>

          <Divider label="Edición de Código Lua del Scraper" labelPosition="center" />

          {sourceCodeQuery.isLoading ? (
            <Loader size="sm" color="blue" />
          ) : (
            <Stack spacing="xs">
              <Textarea
                label="Código Fuente Lua (.lua)"
                autosize
                minRows={10}
                maxRows={20}
                styles={{ input: { fontFamily: 'monospace', fontSize: '12px' } }}
                value={editingLuaContent}
                onChange={(e) => setEditingLuaContent(e.currentTarget.value)}
              />
              <Group position="apart">
                <Button
                  size="xs"
                  variant="light"
                  color="red"
                  leftIcon={<IconX size={14} />}
                  onClick={() => {
                    handleToggle(testSourceName, false, true);
                    setInspectModalOpen(false);
                    setTestModalOpen(false);
                  }}
                >
                  {t('sources:testModal.markFailedButton', '❌ Marcar Fuente como Incompatible')}
                </Button>

                <Button
                  size="xs"
                  color="teal"
                  loading={updateSourceCodeMutation.isLoading}
                  leftIcon={<IconCheck size={14} />}
                  onClick={() => {
                    updateSourceCodeMutation.mutate({
                      sourceName: testSourceName,
                      luaContent: editingLuaContent,
                    });
                  }}
                >
                  {t('sources:testModal.saveManualLuaButton', '💾 Guardar Código Lua y Re-Probar')}
                </Button>
              </Group>
            </Stack>
          )}
        </Stack>
      </Modal>
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
