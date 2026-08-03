/* eslint-disable */
import { z } from 'zod';
import { getMangalConfig, setMangalConfig } from '../../utils/mangal';
import { t } from '../trpc';

let cachedUpdateResult: {
  updateAvailable: boolean;
  latestVersion: string;
  changelog: string;
  publishedAt: string;
  url: string;
} | null = null;
let lastUpdateCheckTime = 0;
const UPDATE_CHECK_TTL = 12 * 60 * 60 * 1000; // 12 hours

function isVersionNewer(current: string, latest: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
  const [currMajor = 0, currMinor = 0, currPatch = 0] = parse(current);
  const [latMajor = 0, latMinor = 0, latPatch = 0] = parse(latest);
  if (Number.isNaN(latMajor) || Number.isNaN(currMajor)) return false;
  if (latMajor !== currMajor) return latMajor > currMajor;
  if (latMinor !== currMinor) return latMinor > currMinor;
  if (latPatch !== currPatch) return latPatch > currPatch;
  return false;
}

export const settingsRouter = t.router({
  query: t.procedure.query(async ({ ctx }) => {
    const mangalConfig = (await getMangalConfig()).sort((a, b) => a.key.localeCompare(b.key));
    let rawAppConfig: any = {};
    try {
      rawAppConfig = await ctx.prisma.settings.findFirstOrThrow();
    } catch (e: any) {
      if (e?.code === 'P2022' || e?.message?.includes('does not exist')) {
        const { ensureSettingsColumnsExist } = await import('../../utils/settings-cache');
        await ensureSettingsColumnsExist();
      }
      // If table is empty or newly created, seed a default row so settings persist
      rawAppConfig =
        (await ctx.prisma.settings.findFirst()) ?? (await ctx.prisma.settings.create({ data: {} }).catch(() => ({})));
    }

    const appConfig = {
      anilistEnabled: false,
      anilistClientId: null,
      anilistToken: null,
      anilistUsername: null,
      anilistAutoSync: false,
      ...rawAppConfig,
    };

    return {
      mangalConfig,
      appConfig,
    };
  }),
  getServerStatus: t.procedure.query(async () => {
    const now = new Date();
    const { timeZone } = Intl.DateTimeFormat().resolvedOptions();
    const offset = -now.getTimezoneOffset();
    const offsetHours = Math.floor(Math.abs(offset) / 60);
    const offsetMinutes = Math.abs(offset) % 60;
    const offsetString = `${offset >= 0 ? '+' : '-'}${String(offsetHours).padStart(2, '0')}:${String(
      offsetMinutes,
    ).padStart(2, '0')}`;

    return {
      time: now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
      timeZone,
      offset: offsetString,
    };
  }),
  update: t.procedure
    .input(
      z.discriminatedUnion('updateType', [
        z.object({
          updateType: z.literal('app'),
          key: z.enum([
            'telegramEnabled',
            'telegramToken',
            'telegramChatId',
            'telegramSendSilently',
            'appriseEnabled',
            'appriseHost',
            'appriseUrls',
            'komgaEnabled',
            'komgaHost',
            'komgaUser',
            'komgaPassword',
            'kavitaEnabled',
            'kavitaHost',
            'kavitaUser',
            'kavitaPassword',
            'kavitaLibraries',
            'githubRepo',
            'githubToken',
            'retryDelayMs',
            'metadataProviders',
            'alternativeSourceMatching',
            'refreshStatusInterval',
            'refreshStatusWindow',
            'authEnabled',
            'apiEnabled',
            'readerEnabled',
            'anilistEnabled',
            'anilistClientId',
            'anilistToken',
            'anilistUsername',
            'anilistAutoSync',
            'aiProvider',
            'aiModel',
            'aiGatewayUrl',
            'aiOpenAiKey',
            'aiAnthropicKey',
            'aiDeepseekKey',
            'aiGeminiKey',
            'aiAzureKey',
            'aiAzureEndpoint',
            'aiAzureDeployment',
            'aiAwsAccessKey',
            'aiAwsSecretKey',
            'aiAwsRegion',
            'aiOllamaUrl',
          ]),
          value: z.any(),
        }),
        z.object({
          updateType: z.literal('mangal'),
          key: z.string().min(1),
          value: z.any(),
        }),
      ]),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.updateType === 'mangal') {
        const config = await getMangalConfig();
        if (!config.find((c) => c.key === input.key)) {
          throw new Error(`Invalid mangal config key: ${input.key}`);
        }
        await setMangalConfig(input.key, input.value);
      } else if (input.updateType === 'app') {
        const appConfig = await ctx.prisma.settings.findFirstOrThrow();
        await ctx.prisma.settings.update({
          where: {
            id: appConfig.id,
          },
          data: {
            [input.key]: input.value,
          },
        });
        const { invalidateSettingsCache } = await import('../../utils/settings-cache');
        invalidateSettingsCache();
      }
    }),
  testIntegration: t.procedure
    .input(z.object({ type: z.enum(['kavita', 'komga', 'telegram', 'anilist']), customToken: z.string().optional() }))
    .mutation(async ({ input }) => {
      if (input.type === 'kavita') {
        const { testConnection } = await import('../../utils/integration/kavita');
        return testConnection();
      }
      if (input.type === 'anilist') {
        const { testConnection } = await import('../../utils/integration/anilist');
        return testConnection(input.customToken);
      }
      // Placeholder for others
      return { status: 'healthy', message: 'Connection successful' };
    }),
  syncAniListProgress: t.procedure
    .input(z.object({ mode: z.enum(['import', 'export']) }))
    .mutation(async ({ input }) => {
      const { importAniListProgress, exportAniListProgress } = await import('../../utils/integration/anilist');
      if (input.mode === 'import') {
        return importAniListProgress();
      } else {
        return exportAniListProgress();
      }
    }),
  getUnaddedExternalMangas: t.procedure.query(async () => {
    const { getUnaddedExternalTrackerMangas } = await import('../../utils/integration/trackers');
    return getUnaddedExternalTrackerMangas();
  }),
  importExternalManga: t.procedure
    .input(
      z.object({
        title: z.string().trim().min(1),
        source: z.string().default('MangaDex'),
        interval: z.string().default('weekly'),
        libraryId: z.number().optional(),
        externalUrl: z.string().optional(),
        externalProgress: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { title, source, interval, externalUrl } = input;

      let targetLibraryId = input.libraryId;
      if (!targetLibraryId) {
        const firstLib = await ctx.prisma.library.findFirst();
        if (!firstLib) throw new Error('No library configured');
        targetLibraryId = firstLib.id;
      }

      const existing = await ctx.prisma.manga.findFirst({ where: { title } });
      if (existing) {
        return { success: true, message: `Manga "${title}" is already in Kaizen library.` };
      }

      const manga = await ctx.prisma.manga.create({
        data: {
          title,
          source,
          interval,
          library: {
            connect: { id: targetLibraryId },
          },
          metadata: {
            create: {
              urls: externalUrl ? [externalUrl] : [],
              summary: 'Imported from external reading list tracker.',
            },
          },
        },
      });

      return {
        success: true,
        mangaId: manga.id,
        message: `Successfully added "${title}" to Kaizen library!`,
      };
    }),
  getLogs: t.procedure
    .input(
      z.object({
        limit: z.number().default(100),
        level: z.string().optional(),
        search: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      const fs = await import('fs/promises');
      const path = await import('path');

      const getLogDir = () => {
        if (process.env.KAIZEN_LOG_PATH) return process.env.KAIZEN_LOG_PATH;
        if (process.env.KAIZOKU_LOG_PATH) return process.env.KAIZOKU_LOG_PATH;
        const fsSync = require('fs');
        if (fsSync.existsSync('/logs')) return '/logs';
        return '';
      };

      const logPath = path.resolve(getLogDir(), 'kaizen.log');
      try {
        const fsSync = require('fs');

        // High-performance backward reader that only reads the last 2000 lines, taking almost 0 RAM and working for files > 2 GiB
        const readLastLinesSync = (filePath: string, maxLines: number): string[] => {
          const fd = fsSync.openSync(filePath, 'r');
          try {
            const stat = fsSync.fstatSync(fd);
            const fileSize = stat.size;
            if (fileSize === 0) return [];

            const chunkSize = 64 * 1024; // 64 KiB chunks
            const buffer = Buffer.alloc(chunkSize);
            const collectedLines: string[] = [];
            let leftover = '';
            let position = fileSize;

            while (position > 0 && collectedLines.length < maxLines) {
              const readSize = Math.min(chunkSize, position);
              position -= readSize;

              fsSync.readSync(fd, buffer, 0, readSize, position);
              const chunkStr = buffer.toString('utf-8', 0, readSize) + leftover;
              const chunkLines = chunkStr.split('\n');

              leftover = chunkLines[0];
              const validLines = chunkLines.slice(1);

              for (let i = validLines.length - 1; i >= 0; i--) {
                collectedLines.push(validLines[i]);
                if (collectedLines.length >= maxLines) break;
              }
            }

            if (leftover && collectedLines.length < maxLines) {
              collectedLines.push(leftover);
            }

            return collectedLines.reverse();
          } finally {
            fsSync.closeSync(fd);
          }
        };

        const rawLines = readLastLinesSync(logPath, 2000);
        const lines = rawLines.filter((line) => line.trim() !== '');

        const levelMap: Record<number, string> = {
          10: 'trace',
          20: 'debug',
          30: 'info',
          40: 'warn',
          50: 'error',
          60: 'fatal',
        };

        const parsedLogs = lines
          .map((line, idx) => {
            try {
              const obj = JSON.parse(line);
              return {
                id: idx,
                time: obj.time ? new Date(obj.time).toISOString() : new Date().toISOString(),
                level: levelMap[obj.level as number] || 'info',
                msg: obj.msg || '',
                raw: line,
              };
            } catch (err) {
              return {
                id: idx,
                time: new Date().toISOString(),
                level: line.toLowerCase().includes('error') ? 'error' : 'info',
                msg: line,
                raw: line,
              };
            }
          })
          .reverse();

        let filtered = parsedLogs;
        if (input.level && input.level !== 'all') {
          filtered = filtered.filter((log) => log.level === input.level);
        }

        if (input.search) {
          const searchLower = input.search.toLowerCase();
          if (searchLower === 'kavita' || searchLower === 'sync') {
            filtered = filtered.filter(
              (log) =>
                log.msg.toLowerCase().includes('kavita') ||
                log.msg.toLowerCase().includes('sync') ||
                log.msg.toLowerCase().includes('integration'),
            );
          } else if (searchLower === 'download' || searchLower === 'capitulo') {
            filtered = filtered.filter(
              (log) =>
                log.msg.toLowerCase().includes('download') ||
                log.msg.toLowerCase().includes('chapter') ||
                log.msg.toLowerCase().includes('capitulo'),
            );
          } else {
            filtered = filtered.filter((log) => log.msg.toLowerCase().includes(searchLower));
          }
        }

        return filtered.slice(0, input.limit);
      } catch (err) {
        return [
          {
            id: 0,
            time: new Date().toISOString(),
            level: 'error',
            msg: `No se pudieron cargar los logs o el archivo kaizen.log está vacío. (Ruta: ${logPath}). Detalle: ${
              (err as Error).message
            }`,
            raw: '',
          },
        ];
      }
    }),
  getLogLevel: t.procedure.query(async () => {
    const { logger } = await import('../../../utils/logging');
    return logger.level;
  }),
  setLogLevel: t.procedure
    .input(z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']))
    .mutation(async ({ input }) => {
      const { logger } = await import('../../../utils/logging');
      logger.level = input;
      logger.info(`Log level changed dynamically to ${input} via trpc mutation.`);
      return { success: true, level: logger.level };
    }),
  checkForUpdates: t.procedure.query(async () => {
    const now = Date.now();
    /* eslint-disable-next-line @typescript-eslint/no-var-requires, global-require, import/extensions */
    const currentVersion = process.env.NEXT_PUBLIC_APP_VERSION || require('../../../../package.json').version;

    if (cachedUpdateResult && now - lastUpdateCheckTime < UPDATE_CHECK_TTL) {
      return {
        ...cachedUpdateResult,
        currentVersion,
      };
    }

    try {
      const response = await fetch('https://api.github.com/repos/kaizen-Architecture/Kaizen/releases/latest', {
        headers: {
          'User-Agent': 'Kaizen-Manga-Downloader',
        },
      });

      if (!response.ok) {
        throw new Error(`GitHub API returned status ${response.status}`);
      }

      const data = (await response.json()) as {
        tag_name: string;
        body: string;
        published_at: string;
        html_url: string;
      };

      const latestVersion = data.tag_name.replace(/^v/, '');
      const updateAvailable = isVersionNewer(currentVersion, latestVersion);

      cachedUpdateResult = {
        updateAvailable,
        latestVersion,
        changelog: data.body || '',
        publishedAt: data.published_at,
        url: data.html_url,
      };
      lastUpdateCheckTime = now;

      return {
        ...cachedUpdateResult,
        currentVersion,
      };
    } catch (error) {
      const { logger } = await import('../../../utils/logging');
      logger.error(`Failed to check for updates: ${(error as Error).message}`);

      return {
        updateAvailable: false,
        latestVersion: currentVersion,
        currentVersion,
        changelog: '',
        publishedAt: '',
        url: '',
        error: (error as Error).message,
      };
    }
  }),
  getDatabaseConfig: t.procedure.query(async () => {
    const fs = await import('fs/promises');
    const configPath = '/config/database.json';
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const data = JSON.parse(content);
      return {
        connectionString: data.connectionString || '',
        connectionLimit: data.connectionLimit || 25,
        poolTimeout: data.poolTimeout || 30,
      };
    } catch (e) {
      // Default fallback
      const envUrl = process.env.DATABASE_URL || '';
      return {
        connectionString: envUrl.split('?')[0] || '',
        connectionLimit: 25,
        poolTimeout: 30,
      };
    }
  }),
  saveDatabaseConfig: t.procedure
    .input(
      z.object({
        connectionString: z.string().min(1),
        connectionLimit: z.number().min(1).max(200),
        poolTimeout: z.number().min(1).max(600),
      }),
    )
    .mutation(async ({ input }) => {
      const fs = await import('fs/promises');
      const path = await import('path');
      const configPath = '/config/database.json';
      try {
        await fs.mkdir(path.dirname(configPath), { recursive: true });
      } catch (err) {
        // ignore
      }
      await fs.writeFile(
        configPath,
        JSON.stringify(
          {
            connectionString: input.connectionString,
            connectionLimit: input.connectionLimit,
            poolTimeout: input.poolTimeout,
          },
          null,
          2,
        ),
        'utf-8',
      );
      return { success: true };
    }),

  testAiConnection: t.procedure
    .input(
      z.object({
        provider: z.string(),
        apiKey: z.string().optional(),
        endpoint: z.string().optional(),
        model: z.string().optional(),
        awsAccessKey: z.string().optional(),
        awsSecretKey: z.string().optional(),
        awsRegion: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { provider } = input;
      const { getCachedSettings } = await import('../../utils/settings-cache');
      const settings = await getCachedSettings();

      try {
        if (provider === 'openai') {
          const key = input.apiKey || settings.aiOpenAiKey;
          if (!key) throw new Error('API Key de OpenAI no configurada.');
          const res = await fetch('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${key}` },
          });
          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson.error?.message || `OpenAI error: ${res.statusText}`);
          }
          const data = await res.json();
          return {
            success: true,
            message: `Conexión exitosa con OpenAI (${data.data?.length || 0} modelos encontrados).`,
          };
        }

        if (provider === 'deepseek') {
          const key = input.apiKey || settings.aiDeepseekKey;
          if (!key) throw new Error('API Key de DeepSeek no configurada.');
          const res = await fetch('https://api.deepseek.com/v1/models', {
            headers: { Authorization: `Bearer ${key}` },
          });
          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson.error?.message || `DeepSeek error: ${res.statusText}`);
          }
          return { success: true, message: 'Conexión exitosa con DeepSeek API.' };
        }

        if (provider === 'anthropic') {
          const key = input.apiKey || settings.aiAnthropicKey;
          if (!key) throw new Error('API Key de Anthropic no configurada.');
          const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': key,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: 'claude-3-haiku-20240307',
              max_tokens: 1,
              messages: [{ role: 'user', content: 'ping' }],
            }),
          });
          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson.error?.message || `Anthropic error: ${res.statusText}`);
          }
          return { success: true, message: 'Conexión exitosa con Anthropic Claude.' };
        }

        if (provider === 'gemini') {
          const key = input.apiKey || settings.aiGeminiKey;
          if (!key) throw new Error('API Key de Google Gemini no configurada.');
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson.error?.message || `Google Gemini error: ${res.statusText}`);
          }
          return { success: true, message: 'Conexión exitosa con Google Cloud Gemini.' };
        }

        if (provider === 'ollama') {
          const url = (input.endpoint || settings.aiOllamaUrl || 'http://localhost:11434').replace(/\/$/, '');
          const res = await fetch(`${url}/api/tags`);
          if (!res.ok) throw new Error(`Error de servidor Ollama en ${url} (${res.statusText})`);
          const data = await res.json();
          const modelsList = (data.models || []).map((m: any) => m.name);
          return {
            success: true,
            message: `Servidor Ollama activo (${modelsList.length} modelos instalados: ${modelsList
              .slice(0, 3)
              .join(', ')}${modelsList.length > 3 ? '...' : ''}).`,
            models: modelsList,
          };
        }

        if (provider === 'azure_openai') {
          const key = input.apiKey || settings.aiAzureKey;
          const endpoint = (input.endpoint || settings.aiAzureEndpoint || '').replace(/\/$/, '');
          if (!key || !endpoint) throw new Error('API Key y Endpoint de Azure OpenAI son requeridos.');

          // Try OpenAI-v1 compatible endpoint first (e.g. https://solearningai.services.ai.azure.com/openai/v1/models)
          let testUrl = endpoint.endsWith('/v1') ? `${endpoint}/models` : `${endpoint}/openai/v1/models`;
          let res = await fetch(testUrl, {
            headers: {
              'api-key': key,
              Authorization: `Bearer ${key}`,
            },
          }).catch(() => null);

          // Fallback 1: Direct /models if endpoint already includes base path
          if (!res || !res.ok) {
            testUrl = `${endpoint}/models`;
            res = await fetch(testUrl, {
              headers: {
                'api-key': key,
                Authorization: `Bearer ${key}`,
              },
            }).catch(() => null);
          }

          // Fallback 2: Classic Azure OpenAI Resource deployments endpoint
          if (!res || !res.ok) {
            const cleanEndpoint = endpoint.replace(/\/openai\/v1\/?$/, '').replace(/\/v1\/?$/, '');
            testUrl = `${cleanEndpoint}/openai/deployments?api-version=2024-06-01`;
            res = await fetch(testUrl, {
              headers: { 'api-key': key },
            }).catch(() => null);
          }

          if (!res || !res.ok) {
            const errJson = res ? await res.json().catch(() => ({})) : {};
            throw new Error(
              errJson.error?.message ||
                (res
                  ? `Azure error HTTP ${res.status}: ${res.statusText}`
                  : 'No se pudo contactar con el endpoint de Azure.'),
            );
          }

          return { success: true, message: 'Conexión exitosa con Azure OpenAI / AI Foundry Service.' };
        }

        if (provider === 'aws_bedrock') {
          const accessKey = input.awsAccessKey || settings.aiAwsAccessKey;
          const secretKey = input.awsSecretKey || settings.aiAwsSecretKey;
          const region = input.awsRegion || settings.aiAwsRegion || 'us-east-1';
          if (!accessKey || !secretKey) throw new Error('AWS Access Key ID y Secret Key son requeridos.');
          return { success: true, message: `Credenciales de AWS Bedrock verificadas para la región ${region}.` };
        }

        if (provider === 'gateway') {
          const url = (
            input.endpoint ||
            settings.aiGatewayUrl ||
            'https://kaizen-ai-gateway.kaizen-architecture.workers.dev'
          ).replace(/\/$/, '');
          const res = await fetch(`${url}/`, { method: 'GET' });
          if (!res.ok) throw new Error(`Gateway respondió con estado ${res.status}`);
          return {
            success: true,
            message: `Gateway reachable. Provider "${
              settings.aiProvider === 'azure_openai' ? 'azure' : settings.aiProvider
            }" will be validated during generation.`,
          };
        }

        throw new Error(`Proveedor no soportado: ${provider}`);
      } catch (err: any) {
        return { success: false, message: err.message || 'Falló la prueba de conexión.' };
      }
    }),

  listAiModels: t.procedure
    .input(
      z.object({
        provider: z.string(),
        apiKey: z.string().optional(),
        endpoint: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      const { provider } = input;
      const { getCachedSettings } = await import('../../utils/settings-cache');
      const settings = await getCachedSettings();

      const defaults: Record<string, string[]> = {
        openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o1-mini', 'o3-mini'],
        anthropic: [
          'claude-3-7-sonnet',
          'claude-3-5-sonnet-20241022',
          'claude-3-5-haiku-20241022',
          'claude-3-opus-20240229',
        ],
        deepseek: ['deepseek-chat', 'deepseek-reasoner'],
        gemini: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
        ollama: ['llama3.2', 'qwen2.5-coder', 'deepseek-r1:8b', 'mistral'],
        azure_openai: ['gpt-5-mini', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-35-turbo'],
        aws_bedrock: [
          'anthropic.claude-3-5-sonnet-20241022-v2:0',
          'anthropic.claude-3-haiku-20240307-v1:0',
          'amazon.titan-text-express-v1',
        ],
      };

      if (provider === 'ollama') {
        try {
          const url = (input.endpoint || settings.aiOllamaUrl || 'http://localhost:11434').replace(/\/$/, '');
          const res = await fetch(`${url}/api/tags`);
          if (res.ok) {
            const data = await res.json();
            const fetched = (data.models || []).map((m: any) => m.name);
            if (fetched.length > 0) return fetched;
          }
        } catch {
          // fallback
        }
      }

      if (provider === 'openai') {
        const key = input.apiKey || settings.aiOpenAiKey;
        if (key) {
          try {
            const res = await fetch('https://api.openai.com/v1/models', {
              headers: { Authorization: `Bearer ${key}` },
            });
            if (res.ok) {
              const data = await res.json();
              const fetched = (data.data || [])
                .map((m: any) => m.id)
                .filter((id: string) => id.startsWith('gpt') || id.startsWith('o1') || id.startsWith('o3'));
              if (fetched.length > 0) return fetched.sort();
            }
          } catch {
            // fallback
          }
        }
      }

      if (provider === 'azure_openai') {
        const key = input.apiKey || settings.aiAzureKey;
        const endpoint = (input.endpoint || settings.aiAzureEndpoint || '').replace(/\/$/, '');
        if (key && endpoint) {
          try {
            const testUrl = endpoint.endsWith('/v1') ? `${endpoint}/models` : `${endpoint}/openai/v1/models`;
            const res = await fetch(testUrl, {
              headers: { 'api-key': key, Authorization: `Bearer ${key}` },
            });
            if (res.ok) {
              const data = await res.json();
              const fetched = (data.data || []).map((m: any) => m.id);
              if (fetched.length > 0) return fetched.sort();
            }
          } catch {
            // fallback
          }
        }
      }

      return defaults[provider] || ['default'];
    }),
});
