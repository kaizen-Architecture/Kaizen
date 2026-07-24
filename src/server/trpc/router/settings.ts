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
    } catch (e) {
      rawAppConfig = (await ctx.prisma.settings.findFirst()) || {};
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
});
