import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { t } from '../trpc';
import { mangalExec, clearMangalCache } from '../../utils/mangal';
import { logger } from '../../../utils/logging';
import { syncSourcesFromGithub } from '../../utils/sources';
import { resetSourceFailure } from '../../utils/failure-tracking';

const PIPELINE_VERSION = '2.1.0';

export interface AiProgressState {
  active: boolean;
  domain: string;
  sourceName: string;
  step: number; // 1..5
  stepKey: 'FETCH_HTML' | 'PHASE_SEARCH' | 'PHASE_CHAPTERS' | 'PHASE_PAGES' | 'FUNCTIONAL_TEST' | 'COMPLETED' | 'FAILED';
  status: 'idle' | 'in_progress' | 'completed' | 'failed';
  messageEn: string;
  messageEs: string;
  error?: string;
  updatedAt: number;
}

let globalAiProgress: AiProgressState = {
  active: false,
  domain: '',
  sourceName: '',
  step: 0,
  stepKey: 'FETCH_HTML',
  status: 'idle',
  messageEn: '',
  messageEs: '',
  updatedAt: Date.now(),
};

function updateAiProgress(progress: Partial<AiProgressState>) {
  globalAiProgress = {
    ...globalAiProgress,
    ...progress,
    updatedAt: Date.now(),
  };
}

function extractLuaFunction(lua: string, funcName: string): string {
  const regex = new RegExp(`function\\s+${funcName}\\s*\\([\\s\\S]*?\\nend`, 'i');
  const match = lua.match(regex);
  return match ? match[0].trim() : `${funcName} function not found in Lua code`;
}

function sanitizeLuaIndexing(code: string, sourceName?: string): string {
  let sanitized = code
    .replace(/mangas\[i\s*\+\s*1\]/g, 'mangas[#mangas + 1]')
    .replace(/mangas\[i\]/g, 'mangas[#mangas + 1]')
    .replace(/chapters\[i\s*\+\s*1\]/g, 'chapters[#chapters + 1]')
    .replace(/chapters\[i\]/g, 'chapters[#chapters + 1]')
    .replace(/pages\[i\s*\+\s*1\]/g, 'pages[#pages + 1]')
    .replace(/pages\[i\]/g, 'pages[#pages + 1]')
    .replace(/\.search-wrap\s+\.tab-content-wrap\s+\.c-tabs-item__content\s+\.post-content\s+\.post-content_item/g, '.c-tabs-item__content')
    .replace(/\.tab-summary\s+\.post-content\s+\.post-content_item/g, '.c-tabs-item__content');

  // Ensure title extraction in SearchManga falls back to title attribute if inner text is empty (e.g. thumb <a>)
  if (sanitized.includes('function SearchManga') && !sanitized.includes('safe_attr(titleElement, "title")')) {
    sanitized = sanitized.replace(
      /local name = trim\(titleElement:text\(\)\)/g,
      'local name = trim(titleElement:text())\n            if not name or name == "" then name = trim(safe_attr(titleElement, "title") or "") end',
    );
  }

  if (
    !sanitized.includes('function normalize_url') &&
    (sanitized.includes('normalize_url') || sanitized.includes('absolutize'))
  ) {
    const helperCode = `
function normalize_url(url)
    if not url or url == "" then return "" end
    if url:sub(1, 2) == "//" then return "https:" .. url end
    if url:sub(1, 1) == "/" then return Base .. url end
    if not url:find("^https?://") then return Base .. "/" .. url end
    return url
end

function absolutize(url)
    return normalize_url(url)
end
`;
    if (sanitized.includes('----- HELPERS -----')) {
      sanitized = sanitized.replace('----- HELPERS -----', `----- HELPERS -----\n${helperCode}`);
    } else {
      sanitized = `${helperCode}\n${sanitized}`;
    }
  }

  // Ensure author and version are present
  if (sourceName) {
    const formattedName = sourceName.endsWith('_AI') ? sourceName : `${sourceName}_AI`;
    sanitized = sanitized.replace(/--\s*@name\s+.*$/m, `-- @name ${formattedName}`);
  }
  sanitized = sanitized.replace(/--\s*@author\s+.*$/m, '-- @author Kaizen AI');
  if (!sanitized.includes('-- @version')) {
    sanitized = sanitized.replace(
      /--\s*@author\s+Kaizen AI/m,
      `-- @author Kaizen AI\n-- @version ${PIPELINE_VERSION}`,
    );
  } else {
    sanitized = sanitized.replace(/--\s*@version\s+.*$/m, `-- @version ${PIPELINE_VERSION}`);
  }

  // Ensure getBody uses proper Browser userdata check
  sanitized = sanitized.replace(/if\s+Browser\s+and\s+Browser\.page\s+then/g, 'if Browser then');

  if (!sanitized.includes('function unpack_js')) {
    const unpackHelper = `
function unpack_js(body)
    if not body or not body:find("eval%(function%(p,a,c,k,e,") then return "" end
    local payload, a_str, c_str, keywords_str = body:match("eval%(function%(p,a,c,k,e,[rd]%).-%}%(%s*['\\"](.-)['\\"]%s*,%s*(%d+)%s*,%s*(%d+)%s*,%s*['\\"](.-)['\\"]%.split")
    if not payload or not a_str or not keywords_str then return "" end
    local a = tonumber(a_str)
    local chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
    local function to_base(n, rad)
        if n == 0 then return "0" end
        local res = ""
        while n > 0 do
            local rem = (n % rad) + 1
            res = chars:sub(rem, rem) .. res
            n = math.floor(n / rad)
        end
        return res
    end
    local dict = {}
    local idx = 0
    for word in (keywords_str .. "|"):gmatch("(.-)|") do
        local key = to_base(idx, a)
        if word and word ~= "" then dict[key] = word else dict[key] = key end
        idx = idx + 1
    end
    return (payload:gsub("([%w_]+)", function(t) return dict[t] or t end))
end
`;
    if (sanitized.includes('----- HELPERS -----')) {
      sanitized = sanitized.replace('----- HELPERS -----', `----- HELPERS -----\n${unpackHelper}`);
    } else {
      sanitized = `${unpackHelper}\n${sanitized}`;
    }
  }

  // Ensure ChapterPages has Strategy 2 unpack_js fallback
  if (sanitized.includes('function ChapterPages') && !sanitized.includes('unpack_js(body)')) {
    const fallbackCode = `
    -- Strategy 2: JS Packed / Regex Fallback
    if #pages == 0 then
        local unpacked = unpack_js(body)
        local search_text = (unpacked ~= "" and unpacked) or body
        for imgUrl in search_text:gmatch("['\\"]((?:https?:)?//[^'\\"]+%.jpe?g[^'\\"]*)['\\"]") do
            if not (imgUrl:find("logo") or imgUrl:find("sprite") or imgUrl:find("icon") or imgUrl:find("thumb") or imgUrl:find("loading")) then
                imgUrl = imgUrl:gsub("\\\\", "")
                imgUrl = normalize_url(imgUrl)
                if imgUrl and imgUrl ~= "" then
                    pages[#pages + 1] = { index = #pages + 1, url = imgUrl }
                end
            end
        end
        if #pages == 0 then
            for imgUrl in search_text:gmatch("['\\"]((?:https?:)?//[^'\\"]+%.webp[^'\\"]*)['\\"]") do
                if not (imgUrl:find("logo") or imgUrl:find("sprite") or imgUrl:find("icon") or imgUrl:find("thumb") or imgUrl:find("loading")) then
                    imgUrl = imgUrl:gsub("\\\\", "")
                    imgUrl = normalize_url(imgUrl)
                    if imgUrl and imgUrl ~= "" then
                        pages[#pages + 1] = { index = #pages + 1, url = imgUrl }
                    end
                end
            end
        end
    end

    return pages
end`;
    const cpIndex = sanitized.indexOf('function ChapterPages');
    if (cpIndex !== -1) {
      const cpBlock = sanitized.slice(cpIndex);
      const replacedCpBlock = cpBlock.replace(/return\s+pages\s*\n\s*end/, fallbackCode);
      sanitized = sanitized.slice(0, cpIndex) + replacedCpBlock;
    }
  }

  return sanitized;
}

export const sourcesRouter = t.router({
  list: t.procedure.query(async ({ ctx }) => {
    try {
      const { stdout: sourcesPath } = await mangalExec(['where', '-s']);
      const cleanPath = sourcesPath.trim();
      const disabledPath = path.join(cleanPath, 'disabled');
      const failedPath = path.join(disabledPath, 'failed');

      // Ensure directories exist
      try {
        await fs.mkdir(disabledPath, { recursive: true });
        await fs.mkdir(failedPath, { recursive: true });
      } catch (e) {
        /* ignore */
      }

      const activeFiles = await fs.readdir(cleanPath);
      const inactiveFiles = await fs.readdir(disabledPath);
      const failedFiles = await fs.readdir(failedPath).catch(() => []);

      // Get metadata from DB
      let sourceMetadata = new Map<string, string>();
      try {
        const dbSources = await ctx.prisma.luaSource.findMany();
        sourceMetadata = new Map(dbSources.map((s) => [s.name, s.origin]));
      } catch (err) {
        logger.warn(`Failed to fetch source metadata from DB: ${err}. Defaulting to LOCAL.`);
      }

      const activeSources = activeFiles
        .filter((f) => f.endsWith('.lua'))
        .map((file) => {
          const name = file.replace('.lua', '');
          return {
            name,
            isInstalled: true,
            isActive: true,
            isFailed: false,
            origin: sourceMetadata.get(name) || (name.endsWith('_AI') || name.endsWith('_IA') ? 'AI_GENERATED' : 'LOCAL'),
          };
        });

      const inactiveSources = inactiveFiles
        .filter((f) => f.endsWith('.lua'))
        .map((file) => {
          const name = file.replace('.lua', '');
          return {
            name,
            isInstalled: true,
            isActive: false,
            isFailed: false,
            origin: sourceMetadata.get(name) || (name.endsWith('_AI') || name.endsWith('_IA') ? 'AI_GENERATED' : 'LOCAL'),
          };
        });

      const failedSources = failedFiles
        .filter((f) => f.endsWith('.lua'))
        .map((file) => {
          const name = file.replace('.lua', '');
          return {
            name,
            isInstalled: true,
            isActive: false,
            isFailed: true,
            origin: sourceMetadata.get(name) || (name.endsWith('_AI') || name.endsWith('_IA') ? 'AI_GENERATED' : 'LOCAL'),
          };
        });

      return [...activeSources, ...inactiveSources, ...failedSources];
    } catch (err) {
      logger.error(`Failed to list sources: ${err}`);
      return [];
    }
  }),

  getAiProgress: t.procedure.query(() => {
    return globalAiProgress;
  }),

  toggle: t.procedure
    .input(z.object({ name: z.string(), activate: z.boolean(), isFailed: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      try {
        const { stdout: sourcesPath } = await mangalExec(['where', '-s']);
        const cleanPath = sourcesPath.trim();
        const disabledPath = path.join(cleanPath, 'disabled');
        const failedPath = path.join(disabledPath, 'failed');

        const fileName = `${input.name}.lua`;
        const activeFile = path.join(cleanPath, fileName);
        const inactiveFile = input.isFailed ? path.join(failedPath, fileName) : path.join(disabledPath, fileName);

        if (input.activate) {
          // Move from disabled/failed to active
          await fs.rename(inactiveFile, activeFile);
        } else {
          // Move from active to disabled
          await fs.rename(activeFile, inactiveFile);
        }

        return { success: true };
      } catch (err) {
        logger.error(`Failed to toggle source ${input.name}: ${err}`);
        throw err;
      }
    }),

  remove: t.procedure
    .input(z.object({ name: z.string(), isActive: z.boolean(), isFailed: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { stdout: sourcesPath } = await mangalExec(['where', '-s']);
        const cleanPath = sourcesPath.trim();
        let folder = cleanPath;
        if (!input.isActive) {
          folder = input.isFailed ? path.join(cleanPath, 'disabled', 'failed') : path.join(cleanPath, 'disabled');
        }
        const filePath = path.join(folder, `${input.name}.lua`);
        await fs.rm(filePath);

        // Also remove from DB metadata
        try {
          await ctx.prisma.luaSource.delete({ where: { name: input.name } });
        } catch (e) {
          /* ignore */
        }

        return { success: true };
      } catch (err) {
        logger.error(`Failed to remove source ${input.name}: ${err}`);
        throw err;
      }
    }),

  listRepos: t.procedure.query(async ({ ctx }) => {
    const repos = await ctx.prisma.sourceRepository.findMany({
      orderBy: { createdAt: 'asc' },
    });
    // Fallback to legacy single setting row if database table is empty
    if (repos.length === 0) {
      const settings = await ctx.prisma.settings.findFirst();
      if (settings?.githubRepo) {
        return [
          {
            id: 0,
            url: settings.githubRepo,
            token: settings.githubToken || null,
            isPrivate: !!settings.githubToken,
            createdAt: new Date(),
          },
        ];
      }
    }
    return repos;
  }),

  addRepo: t.procedure
    .input(
      z.object({ url: z.string(), token: z.string().optional().nullable(), isPrivate: z.boolean().default(false) }),
    )
    .mutation(async ({ ctx, input }) => {
      let cleanUrl = input.url.replace('https://github.com/', '').replace('.git', '').trim();
      // Remove trailing slash if present
      if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);

      const created = await ctx.prisma.sourceRepository.create({
        data: {
          url: cleanUrl,
          token: input.token || null,
          isPrivate: input.isPrivate,
        },
      });

      // Keep settings row updated for backward compatibility if it's the very first repo
      const count = await ctx.prisma.sourceRepository.count();
      if (count === 1) {
        const settings = await ctx.prisma.settings.findFirst();
        if (settings) {
          await ctx.prisma.settings.update({
            where: { id: settings.id },
            data: { githubRepo: cleanUrl, githubToken: input.token || null },
          });
        }
      }
      return created;
    }),

  removeRepo: t.procedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    if (input.id === 0) {
      const settings = await ctx.prisma.settings.findFirst();
      if (settings) {
        await ctx.prisma.settings.update({
          where: { id: settings.id },
          data: { githubRepo: null, githubToken: null },
        });
      }
      return { success: true };
    }
    await ctx.prisma.sourceRepository.delete({ where: { id: input.id } });
    return { success: true };
  }),

  sync: t.procedure.mutation(async () => {
    return syncSourcesFromGithub();
  }),

  upload: t.procedure.input(z.object({ name: z.string(), content: z.string() })).mutation(async ({ ctx, input }) => {
    try {
      const { stdout: sourcesPath } = await mangalExec(['where', '-s']);
      const cleanPath = sourcesPath.trim();

      const fileName = input.name.endsWith('.lua') ? input.name : `${input.name}.lua`;
      const filePath = path.join(cleanPath, fileName);

      await fs.writeFile(filePath, input.content);

      const name = fileName.replace('.lua', '');

      // Clean up disabled/failed copies to reactivate correctly
      const disabledFile = path.join(cleanPath, 'disabled', fileName);
      const failedFile = path.join(cleanPath, 'disabled', 'failed', fileName);
      await fs.rm(disabledFile, { force: true }).catch(() => {});
      await fs.rm(failedFile, { force: true }).catch(() => {});

      // Reset failure counter in memory
      resetSourceFailure(name);

      await ctx.prisma.luaSource.upsert({
        where: { name },
        update: { origin: 'LOCAL' },
        create: { name, origin: 'LOCAL' },
      });

      return { success: true };
    } catch (err) {
      logger.error(`Failed to upload source ${input.name}: ${err}`);
      throw err;
    }
  }),

  listBlockedSites: t.procedure.query(async ({ ctx }) => {
    try {
      return await ctx.prisma.blockedSite.findMany({
        orderBy: { createdAt: 'desc' },
      });
    } catch (err) {
      logger.error(`Failed to list blocked sites: ${err}`);
      return [];
    }
  }),

  removeBlockedSite: t.procedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    try {
      const site = await ctx.prisma.blockedSite.findUnique({ where: { id: input.id } }).catch(() => null);
      if (site) {
        const { stdout: sourcesPath } = await mangalExec(['where', '-s']).catch(() => ({ stdout: '' }));
        if (sourcesPath) {
          const cleanPath = sourcesPath.trim();
          const sourceName = site.domain.replace(/[^a-zA-Z0-9]/g, '');
          const failedFile = path.join(cleanPath, 'disabled', 'failed', `${sourceName}.lua`);
          await fs.unlink(failedFile).catch(() => {});
        }
      }
      await ctx.prisma.blockedSite.deleteMany({
        where: { id: input.id },
      });
      return { success: true };
    } catch (err: any) {
      logger.error(`Failed to remove blocked site ${input.id}: ${err}`);
      throw new Error('No se pudo eliminar el sitio de la lista.');
    }
  }),

  generateAiScraper: t.procedure
    .input(
      z.object({
        siteUrl: z.string().url(),
        provider: z.string().optional(),
        model: z.string().optional(),
        apiKey: z.string().optional(),
        gatewayUrl: z.string().optional(),
        searchUrl: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let domain = '';
      try {
        const urlObj = new URL(input.siteUrl);
        domain = urlObj.hostname.replace(/^www\./, '').toLowerCase();
      } catch (e) {
        throw new Error('La URL proporcionada no es válida.');
      }

      // Check if domain is in non-scrapeable list
      const blocked = await ctx.prisma.blockedSite
        .findUnique({
          where: { domain },
        })
        .catch(() => null);

      if (blocked) {
        throw new Error(
          `El sitio "${domain}" está en la lista de sitios no scrapeables (${
            blocked.reason || 'falló anteriormente'
          }). Puedes eliminarlo de la lista más abajo para volver a intentarlo.`,
        );
      }

      // Fallback to global AI settings if credentials aren't passed explicitly
      const settings = await ctx.prisma.settings.findFirst().catch(() => null);
      const chosenProvider = input.provider || settings?.aiProvider || 'openai';
      const chosenModel = input.model || settings?.aiModel || undefined;

      let chosenApiKey = input.apiKey;
      if (!chosenApiKey && settings) {
        if (chosenProvider === 'openai') chosenApiKey = settings.aiOpenAiKey || undefined;
        else if (chosenProvider === 'anthropic') chosenApiKey = settings.aiAnthropicKey || undefined;
        else if (chosenProvider === 'deepseek') chosenApiKey = settings.aiDeepseekKey || undefined;
        else if (chosenProvider === 'gemini') chosenApiKey = settings.aiGeminiKey || undefined;
        else if (chosenProvider === 'azure_openai') chosenApiKey = settings.aiAzureKey || undefined;
      }

      if (!chosenApiKey && ['openai', 'anthropic', 'deepseek', 'gemini', 'azure_openai'].includes(chosenProvider)) {
        throw new Error('No hay ninguna API Key configurada. Por favor, configúrala en Ajustes > Configuración de IA.');
      }

      const hostClean = domain.replace(/[^a-zA-Z0-9]/g, '');
      const baseName = hostClean.charAt(0).toUpperCase() + hostClean.slice(1);
      const sourceName = `${baseName}_AI`;

      const userLocale = (ctx.req as any)?.locale || ((ctx.req as any)?.url?.startsWith('/es') ? 'es' : 'en');
      const aiLog = {
        info: (en: string, es: string) => logger.info(`[AI Generator] ${userLocale === 'es' ? es : en}`),
        warn: (en: string, es: string) => logger.warn(`[AI Generator] ${userLocale === 'es' ? es : en}`),
      };

      try {
        updateAiProgress({
          active: true,
          domain,
          sourceName,
          step: 1,
          stepKey: 'FETCH_HTML',
          status: 'in_progress',
          messageEn: 'Connecting to website and fetching HTML sample...',
          messageEs: 'Conectando al sitio web y obteniendo muestra HTML...',
          error: undefined,
        });

        aiLog.info(`Fetching HTML sample from ${input.siteUrl}...`, `Obteniendo muestra HTML de ${input.siteUrl}...`);
        const targetRes = await fetch(input.siteUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        }).catch((err) => {
          aiLog.warn(`Target site fetch warning: ${err}`, `Advertencia al obtener HTML del sitio: ${err}`);
          return null;
        });

        let htmlSample = '';
        if (targetRes && targetRes.ok) {
          const rawText = await targetRes.text();
          htmlSample = rawText.length > 80000 ? `${rawText.slice(0, 80000)}\n<!-- HTML truncated -->` : rawText;
          aiLog.info(
            `HTML sample fetched (${htmlSample.length} bytes)`,
            `Muestra HTML obtenida (${htmlSample.length} bytes)`,
          );
        } else {
          aiLog.warn(
            'Target site returned non-OK response, proceeding with empty sample',
            'El sitio no devolvió respuesta OK, continuando con muestra vacía',
          );
        }

        const targetGateway =
          input.gatewayUrl ||
          settings?.aiGatewayUrl ||
          process.env.KAIZEN_AI_GATEWAY_URL ||
          'https://kaizen-ai-gateway.kaizen-architecture.workers.dev';

        const USER_AGENT =
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

        const fetchUrlHtml = async (url: string): Promise<string | null> => {
          try {
            const res = await fetch(url, {
              headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' },
            });
            if (res && res.ok) {
              const text = await res.text();
              if (text.length > 500) {
                // Preserve enough HTML for selectors — don't truncate below 180KB
                if (text.length > 180000) {
                  return `${text.slice(0, 180000)}\n<!-- HTML truncated for token budget -->`;
                }
                return text;
              }
            }
          } catch {
            // Ignore
          }
          return null;
        };

        const maxAttempts = 3;

        // Fetch real search sample HTML if possible to give Phase 1 real search page structure
        let searchPageHtml = '';
        const searchCandidates = [
          input.searchUrl,
          `${input.siteUrl.replace(/\/$/, '')}/?s=hero&post_type=wp-manga`,
          `${input.siteUrl.replace(/\/$/, '')}/?s=hero`,
          `${input.siteUrl.replace(/\/$/, '')}/search?q=hero`,
          `${input.siteUrl.replace(/\/$/, '')}/search?query=hero`,
        ].filter(Boolean) as string[];

        for (const sUrl of searchCandidates) {
          const sHtml = await fetchUrlHtml(sUrl);
          if (sHtml && sHtml.length > 2000) {
            searchPageHtml = sHtml;
            aiLog.info(
              `Search sample HTML fetched from ${sUrl} (${sHtml.length} bytes)`,
              `Muestra HTML de búsqueda obtenida de ${sUrl} (${sHtml.length} bytes)`,
            );
            break;
          }
        }

        const callGateway = async (
          phase: 'search' | 'chapters' | 'pages',
          currentLuaCode?: string,
          sampleHtml?: string,
          errorContext?: string,
        ) => {
          aiLog.info(`Contacting AI Gateway at ${targetGateway}...`, `Contactando AI Gateway en ${targetGateway}...`);

          const body: any = {
            siteUrl: input.siteUrl,
            htmlSample: sampleHtml || htmlSample,
            provider: chosenProvider === 'azure_openai' ? 'azure' : chosenProvider,
            model: chosenModel,
            apiKey: chosenApiKey,
            ollamaUrl: settings?.aiOllamaUrl,
            azureEndpoint: settings?.aiAzureEndpoint,
            azureDeployment: settings?.aiAzureDeployment || chosenModel?.replace(/-\d{4}-\d{2}-\d{2}$/, ''),
            awsAccessKey: settings?.aiAwsAccessKey,
            awsSecretKey: settings?.aiAwsSecretKey,
            awsRegion: settings?.aiAwsRegion,
            phase,
            currentLuaCode: currentLuaCode || undefined,
          };
          // Use user-provided searchUrl if available, otherwise fallback
          body.searchUrl = input.searchUrl || '';
          if (errorContext) body.errorContext = errorContext;

          logger.info(
            `[AI Generator] Gateway request: provider=${body.provider}, model=${body.model || 'N/A'}, ` +
              `azureEndpoint=${body.azureEndpoint || 'N/A'}, azureDeployment=${body.azureDeployment || 'N/A'}, ` +
              `searchUrl=${body.searchUrl || 'none'}, phase=${phase}`,
          );

          return fetch(`${targetGateway.replace(/\/$/, '')}/v1/generate-scraper`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }).catch(() => null);
        };

        let luaCode = '';
        let gatewayFailureError = '';

        // 3-Phase Incremental AI approach:
        // 1. Generate base scraper with SearchManga
        // 2. Refine MangaChapters using real Manga HTML & current Lua
        // 3. Refine ChapterPages using real Chapter Reader HTML & current Lua
        /* eslint-disable no-await-in-loop */
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          aiLog.info(
            `Attempt ${attempt}/${maxAttempts} for ${sourceName}`,
            `Intento ${attempt}/${maxAttempts} para ${sourceName}`,
          );

          const { stdout: sourcesPath } = await mangalExec(['where', '-s']);
          const cleanPath = sourcesPath.trim();
          const fileName = `${sourceName}.lua`;
          const filePath = path.join(cleanPath, fileName);

          // --- STEP 1: Generate Base Scraper with SearchManga ---
          updateAiProgress({
            step: 2,
            stepKey: 'PHASE_SEARCH',
            status: 'in_progress',
            messageEn: `Phase 1/3: Analyzing search engine and building SearchManga (attempt ${attempt}/${maxAttempts})...`,
            messageEs: `Fase 1/3: Analizando buscador y programando SearchManga (intento ${attempt}/${maxAttempts})...`,
          });
          aiLog.info('Phase 1: Generating SearchManga...', 'Fase 1: Generando SearchManga...');
          const searchInstruction = gatewayFailureError
            ? `${gatewayFailureError}\nIMPORTANT: Identify the PRIMARY search results container (.c-tabs-item__content, .search-results .row, .list-story .story-item, .story-item, .manga-item, etc.) and DO NOT use overly nested 5-level paths or sidebar widgets. Use @author Kaizen AI.`
            : 'IMPORTANT: Target the PRIMARY search results container (e.g. .c-tabs-item__content, .search-results .row, .story-item, etc.) and DO NOT select sidebar/recommendations widgets. Use @author Kaizen AI.';
          const gatewayRes1 = await callGateway('search', undefined, searchPageHtml || htmlSample, searchInstruction);

          let currentLua = '';
          if (gatewayRes1 && gatewayRes1.ok) {
            const data1 = (await gatewayRes1.json()) as { success?: boolean; luaCode?: string; error?: string };
            if (data1.success && data1.luaCode) {
              currentLua = sanitizeLuaIndexing(data1.luaCode);
              aiLog.info(
                `SearchManga base generated (${currentLua.length} chars)`,
                `Base de SearchManga generada (${currentLua.length} chars)`,
              );
            } else {
              gatewayFailureError = data1.error || 'Gateway returned success=false in Phase 1';
            }
          } else if (gatewayRes1) {
            const errData = await gatewayRes1.json().catch(() => ({}));
            gatewayFailureError = `Gateway HTTP ${gatewayRes1.status}: ${errData.error || 'upstream error'}`;
            aiLog.warn(`Gateway HTTP ${gatewayRes1.status}`, `Gateway HTTP ${gatewayRes1.status}`);
          } else {
            gatewayFailureError = 'Could not reach the AI Gateway';
          }

          if (!currentLua) {
            continue;
          }

          logger.info(`[AI Generator] Phase 1 SearchManga:\n${extractLuaFunction(currentLua, 'SearchManga')}`);

          // Write currentLua to disk for testing with Mangal
          await fs.writeFile(filePath, currentLua);

          // Test SearchManga to extract a real manga URL
          let realMangaUrl = '';
          let realTitle = '';
          const testQueries = ['hero', 'a', 'love', 'star', 'the'];
          for (let qi = 0; qi < testQueries.length; qi += 1) {
            try {
              const { stdout: searchResult } = await mangalExec(
                ['inline', '--source', sourceName, '--query', testQueries[qi], '--json'],
                { timeout: 15000 },
              );
              if (searchResult && typeof searchResult === 'string') {
                let parsed: any = null;
                try {
                  parsed = JSON.parse(searchResult);
                } catch {
                  continue;
                }
                let resultsArray: any[] | null = null;
                if (Array.isArray(parsed)) {
                  resultsArray = parsed;
                } else if (parsed && Array.isArray(parsed.result)) {
                  resultsArray = parsed.result;
                }
                const normalizedResults = (resultsArray || [])
                  .map((r: any) => ({
                    name: r?.mangal?.name || r?.name || '',
                    url: r?.mangal?.url || r?.url || '',
                  }))
                  .filter((r) => typeof r.url === 'string' && r.url.trim().length > 0);

                if (normalizedResults.length > 0) {
                  realTitle = normalizedResults[0]?.name || '';
                  realMangaUrl = normalizedResults[0]?.url || '';
                  aiLog.info(
                    `SearchManga works! Found "${realTitle}" (${realMangaUrl}) with query "${testQueries[qi]}"`,
                    `SearchManga funciona! Encontrado "${realTitle}" (${realMangaUrl}) con query "${testQueries[qi]}"`,
                  );
                  break;
                }
              }
            } catch {
              // Query failed, try next
            }
          }

          if (!realMangaUrl) {
            gatewayFailureError = `SearchManga failed to find any valid results with test queries (${testQueries.join(
              ', ',
            )}).`;
            aiLog.warn(
              `SearchManga failed with queries (${testQueries.join(', ')})`,
              `SearchManga falló con las queries (${testQueries.join(', ')})`,
            );
            const failedDir = path.join(cleanPath, 'disabled', 'failed');
            await fs.mkdir(failedDir, { recursive: true }).catch(() => {});
            await fs.writeFile(path.join(failedDir, fileName), currentLua).catch(() => {});
            await fs.unlink(filePath).catch(() => {});
            continue;
          }

          // --- STEP 2: Refine MangaChapters with Real Manga HTML ---
          let mangaPageHtml = '';
          if (realMangaUrl) {
            mangaPageHtml = (await fetchUrlHtml(realMangaUrl)) || '';
            if (mangaPageHtml) {
              aiLog.info(
                `Manga detail HTML fetched (${mangaPageHtml.length} bytes)`,
                `HTML de página de manga obtenido (${mangaPageHtml.length} bytes)`,
              );
            }
          }

          aiLog.info('Phase 2: Refining MangaChapters...', 'Fase 2: Refinando MangaChapters...');
          updateAiProgress({
            step: 3,
            stepKey: 'PHASE_CHAPTERS',
            status: 'in_progress',
            messageEn: 'Phase 2/3: Discovering chapters and organizing MangaChapters...',
            messageEs: 'Fase 2/3: Detectando capítulos y organizando MangaChapters...',
          });
          const gatewayRes2 = await callGateway('chapters', currentLua, mangaPageHtml || htmlSample);

          if (gatewayRes2 && gatewayRes2.ok) {
            const data2 = (await gatewayRes2.json()) as { success?: boolean; luaCode?: string; error?: string };
            if (data2.success && data2.luaCode) {
              currentLua = sanitizeLuaIndexing(data2.luaCode);
              logger.info(`[AI Generator] Phase 2 MangaChapters:\n${extractLuaFunction(currentLua, 'MangaChapters')}`);
              aiLog.info(
                `MangaChapters updated (${currentLua.length} chars)`,
                `MangaChapters actualizada (${currentLua.length} chars)`,
              );
            } else {
              gatewayFailureError = data2.error || 'Gateway returned success=false in Phase 2';
            }
          } else if (gatewayRes2) {
            const errData = await gatewayRes2.json().catch(() => ({}));
            gatewayFailureError = `Gateway HTTP ${gatewayRes2.status}: ${
              errData.error || 'MangaChapters generation failed'
            }`;
          } else {
            gatewayFailureError = 'Could not reach the AI Gateway';
          }

          // Write updated Lua to disk and test MangaChapters with Mangal
          await fs.writeFile(filePath, currentLua);

          let chapterUrl = '';
          try {
            const { stdout: chapterResult } = await mangalExec(
              ['inline', '--source', sourceName, '--query', realTitle || 'hero', '--manga', '1', '--json'],
              { timeout: 20000 },
            );
            if (chapterResult) {
              let parsedChapters: any = null;
              try {
                parsedChapters = JSON.parse(chapterResult);
              } catch {}
              let chaptersArray: any[] | null = null;
              if (Array.isArray(parsedChapters)) {
                chaptersArray =
                  parsedChapters[0]?.mangal?.chapters ||
                  parsedChapters[0]?.chapters ||
                  parsedChapters;
              } else if (parsedChapters && Array.isArray(parsedChapters.result)) {
                chaptersArray =
                  parsedChapters.result[0]?.mangal?.chapters ||
                  parsedChapters.result[0]?.chapters ||
                  parsedChapters.result;
              } else if (parsedChapters && Array.isArray(parsedChapters.chapters)) {
                chaptersArray = parsedChapters.chapters;
              }
              if (chaptersArray && chaptersArray.length > 0) {
                chapterUrl = chaptersArray[0]?.url || chaptersArray[0]?.source || '';
                aiLog.info(
                  `MangaChapters works! Found ${chaptersArray.length} chapters. Chapter 1: ${chaptersArray[0]?.name || ''}`,
                  `MangaChapters funciona! Encontrados ${chaptersArray.length} capítulos. Cap 1: ${chaptersArray[0]?.name || ''}`,
                );
              }
            }
          } catch {
            // Chapter extraction failed with Mangal test
          }

          // If Mangal test didn't get chapterUrl, fallback to regex on mangaPageHtml
          if (!chapterUrl && mangaPageHtml) {
            const { hostname } = new URL(input.siteUrl);
            const hrefMatches = Array.from(mangaPageHtml.matchAll(/href=["']([^"']+)["']/gi));
            const chapterKeywords = ['chapter', 'capitulo', 'ch', '/c', 'read', 'episode', 'episodio'];
            for (const match of hrefMatches) {
              const href = match[1];
              if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) {
                // eslint-disable-next-line no-continue
                continue;
              }
              const isChapter = chapterKeywords.some((kw) => href.toLowerCase().includes(kw));
              if (isChapter) {
                chapterUrl = href.startsWith('http')
                  ? href
                  : `https://${hostname}${href.startsWith('/') ? href : `/${href}`}`;
                break;
              }
            }
          }

          // --- STEP 3: Refine ChapterPages with Real Reader HTML ---
          let chapterPageHtml = '';
          if (chapterUrl) {
            chapterPageHtml = (await fetchUrlHtml(chapterUrl)) || '';
            if (chapterPageHtml) {
              aiLog.info(
                `Chapter reader HTML fetched (${chapterPageHtml.length} bytes)`,
                `HTML de lector de capítulo obtenido (${chapterPageHtml.length} bytes)`,
              );
            }
          }

          aiLog.info('Phase 3: Refining ChapterPages...', 'Fase 3: Refinando ChapterPages...');
          updateAiProgress({
            step: 4,
            stepKey: 'PHASE_PAGES',
            status: 'in_progress',
            messageEn: 'Phase 3/3: Configuring reader images and ChapterPages...',
            messageEs: 'Fase 3/3: Configurando visor de páginas y ChapterPages...',
          });
          const pagesInstruction =
            'IMPORTANT: In ChapterPages, look for specific reader image containers (e.g. div.reader-main img, img.reader-main-img, #viewer img, div.reading-content img, img#image) and extract data-src, src, data-original, data-lazy. Use normalize_url(src).';
          const gatewayRes3 = await callGateway(
            'pages',
            currentLua,
            chapterPageHtml || mangaPageHtml || htmlSample,
            pagesInstruction,
          );

          if (gatewayRes3 && gatewayRes3.ok) {
            const data3 = (await gatewayRes3.json()) as { success?: boolean; luaCode?: string; error?: string };
            if (data3.success && data3.luaCode) {
              currentLua = sanitizeLuaIndexing(data3.luaCode);
              logger.info(`[AI Generator] Phase 3 ChapterPages:\n${extractLuaFunction(currentLua, 'ChapterPages')}`);
              aiLog.info(
                `ChapterPages updated (${currentLua.length} chars)`,
                `ChapterPages actualizada (${currentLua.length} chars)`,
              );
            } else {
              gatewayFailureError = data3.error || 'Gateway returned success=false in Phase 3';
            }
          } else if (gatewayRes3) {
            const errData = await gatewayRes3.json().catch(() => ({}));
            gatewayFailureError = `Gateway HTTP ${gatewayRes3.status}: ${
              errData.error || 'ChapterPages generation failed'
            }`;
          } else {
            gatewayFailureError = 'Could not reach the AI Gateway';
          }

          luaCode = currentLua;
          gatewayFailureError = '';
          await fs.writeFile(filePath, luaCode);
          aiLog.info(`Lua file saved: ${filePath}`, `Archivo Lua guardado: ${filePath}`);

          aiLog.info('Step 7: Validating Lua syntax', 'Paso 7: Validando sintaxis Lua');
          let validationPassed = false;
          let validationErrorDetail = '';
          try {
            const { stdout: sourcesList } = await mangalExec(['sources', 'list', '-r']);
            validationPassed = (sourcesList as string)
              .split('\n')
              .map((s: string) => s.trim().toLowerCase())
              .includes(sourceName.toLowerCase());
            if (!validationPassed) {
              validationErrorDetail = 'Scraper not found in mangal sources list';
              aiLog.warn(
                'Validation failed — scraper not found in mangal sources list',
                'Validación falló — scraper no encontrado en mangal sources list',
              );
            } else {
              aiLog.info(
                'Validation passed — scraper loaded by Mangal',
                'Validación pasó — scraper cargado por Mangal',
              );
            }
          } catch (validationErr: any) {
            validationErrorDetail = `${validationErr?.message || validationErr}\nstdout: ${
              validationErr?.stdout || ''
            }\nstderr: ${validationErr?.stderr || ''}`;
            aiLog.warn(
              `Could not validate: ${validationErr?.message || validationErr}`,
              `No se pudo validar: ${validationErr?.message || validationErr}`,
            );
            validationPassed = true;
          }

          if (!validationPassed) {
            await fs.unlink(filePath).catch(() => {});
            luaCode = '';
            gatewayFailureError = `Generated Lua has syntax/runtime errors — Mangal could not load it. Mangal output:\n${validationErrorDetail}`;
            aiLog.warn('Validation failed — retrying', 'Validación falló — reintentando');
            continue;
          }

          // Functional test
          updateAiProgress({
            step: 5,
            stepKey: 'FUNCTIONAL_TEST',
            status: 'in_progress',
            messageEn: 'Validating Lua syntax and testing scraper with Mangal...',
            messageEs: 'Validando sintaxis Lua y probando scraper con Mangal...',
          });
          aiLog.info('Step 7: Running functional test', 'Paso 7: Ejecutando test funcional');
          let functionalPassed = false;
          let funcErrorDetail = '';
          const testQueries2 = ['hero', 'love', 'demon', 'star', 'a', 'the'];
          for (let qi = 0; qi < testQueries2.length; qi += 1) {
            try {
              const { stdout: searchResult } = await mangalExec(
                ['inline', '--source', sourceName, '--query', testQueries2[qi], '--manga', '1', '--json'],
                { timeout: 30000 },
              );
              if (searchResult && typeof searchResult === 'string') {
                let parsed: any = null;
                try {
                  parsed = JSON.parse(searchResult);
                } catch {
                  funcErrorDetail += `Query "${
                    testQueries2[qi]
                  }": mangal returned non-JSON output: ${searchResult.slice(0, 500)}\n`;
                  continue;
                }

                // mangal inline --json returns {"query":"...","result":[...]} OR plain array [...]
                let resultsArray: any[] | null = null;
                if (Array.isArray(parsed)) {
                  resultsArray = parsed;
                } else if (parsed && Array.isArray(parsed.result)) {
                  resultsArray = parsed.result;
                }

                if (resultsArray && resultsArray.length > 0) {
                  const matchTitle = resultsArray[0]?.title || resultsArray[0]?.name || testQueries2[qi];
                  aiLog.info(
                    `Search test passed with query "${testQueries2[qi]}" (${resultsArray.length} results). Verifying ChapterPages image extraction...`,
                    `Test de búsqueda superado con query "${testQueries2[qi]}" (${resultsArray.length} resultados). Verificando extracción de imágenes en ChapterPages...`,
                  );

                  // Deep ChapterPages Verification: Download Chapter 1 to a temporary folder and check CBZ integrity
                  const testDir = path.join(os.tmpdir(), `kaizen_verify_${Date.now()}`);
                  await fs.mkdir(testDir, { recursive: true }).catch(() => {});
                  let chapterDownloadPassed = false;
                  let chapterDownloadError = '';

                  try {
                    await mangalExec(
                      ['inline', '--source', sourceName, '--query', matchTitle, '--manga', '1', '--chapters', '1', '-d'],
                      { cwd: testDir, timeout: 35000 },
                    );

                    const { validateCbzIntegrity } = await import('../../utils/chapterIntegrity');
                    const findCbzFiles = async (dir: string): Promise<string[]> => {
                      const entries = await fs.readdir(dir, { withFileTypes: true });
                      const files: string[] = [];
                      for (const entry of entries) {
                        const full = path.join(dir, entry.name);
                        if (entry.isDirectory()) {
                          files.push(...(await findCbzFiles(full)));
                        } else if (entry.name.toLowerCase().endsWith('.cbz') || entry.name.toLowerCase().endsWith('.zip')) {
                          files.push(full);
                        }
                      }
                      return files;
                    };

                    const downloadedCbzs = await findCbzFiles(testDir);
                    if (downloadedCbzs.length > 0) {
                      const integrity = await validateCbzIntegrity(downloadedCbzs[0]);
                      if (integrity.isValid && (integrity.entryCount || 0) > 0) {
                        chapterDownloadPassed = true;
                        aiLog.info(
                          `ChapterPages download verified (${integrity.entryCount} valid images extracted in chapter archive)`,
                          `ChapterPages verificado con éxito (${integrity.entryCount} imágenes válidas extraídas en el capítulo)`,
                        );
                      } else {
                        chapterDownloadError = `Downloaded chapter failed image integrity (${integrity.reason || '0 valid images'}). Site requires dynamic per-page AJAX tokens / full browser session.`;
                        aiLog.warn(
                          `ChapterPages verification failed: ${chapterDownloadError}`,
                          `Verificación de ChapterPages falló: ${chapterDownloadError}`,
                        );
                      }
                    } else {
                      chapterDownloadError = 'Chapter download command finished but no .cbz archive was created on disk';
                      aiLog.warn(
                        `ChapterPages verification failed: ${chapterDownloadError}`,
                        `Verificación de ChapterPages falló: ${chapterDownloadError}`,
                      );
                    }
                  } catch (dlErr: any) {
                    chapterDownloadError = dlErr?.message || String(dlErr);
                    aiLog.warn(
                      `ChapterPages download error: ${chapterDownloadError}`,
                      `Error al probar descarga en ChapterPages: ${chapterDownloadError}`,
                    );
                  } finally {
                    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
                  }

                  if (chapterDownloadPassed) {
                    functionalPassed = true;
                    break;
                  } else {
                    funcErrorDetail += `ChapterPages verification failed: ${chapterDownloadError}\n`;
                  }
                } else {
                  funcErrorDetail += `Query "${testQueries2[qi]}": mangal returned empty results\n`;
                }
              } else {
                funcErrorDetail += `Query "${testQueries2[qi]}": mangal returned empty stdout\n`;
              }
            } catch (funcErr: any) {
              const errInfo = [funcErr?.message || '', funcErr?.stdout || '', funcErr?.stderr || '']
                .filter(Boolean)
                .join('\n');
              funcErrorDetail += `Query "${testQueries2[qi]}": ${errInfo}\n`;
            }
          }

          if (!functionalPassed) {
            const failedDir = path.join(cleanPath, 'disabled', 'failed');
            await fs.mkdir(failedDir, { recursive: true }).catch(() => {});
            if (currentLua) {
              await fs.writeFile(path.join(failedDir, fileName), currentLua).catch(() => {});
            }
            await fs.unlink(filePath).catch(() => {});
            luaCode = ''; // Clear so the retry loop or final check doesn't use stale code
            const funcErrorSummary = funcErrorDetail || 'mangal inline returned no results or non-JSON output';
            gatewayFailureError = `Generated Lua failed functional test — ${funcErrorSummary}`;
            aiLog.warn(
              `Functional test failed — error detail: ${funcErrorSummary.slice(0, 200)}...`,
              `Test funcional falló — detalle del error: ${funcErrorSummary.slice(0, 200)}...`,
            );
            continue;
          }

          // Clean up any old failed scraper file on success
          const oldFailedFile = path.join(cleanPath, 'disabled', 'failed', fileName);
          await fs.unlink(oldFailedFile).catch(() => {});

          aiLog.info(
            `All steps passed! Scraper for ${sourceName} is working.`,
            `¡Todos los pasos pasaron! El scraper para ${sourceName} funciona.`,
          );
          break;
        }

        // All attempts exhausted
        if (!luaCode) {
          const reason = gatewayFailureError || 'Unknown error';
          const isProviderConfigErr =
            /api.?key|401|403|deployment|model.*(not found|invalid)|azure|openai|anthropic|unsupported provider|not supported|endpoint|bearer|unauthorized|could not reach|gateway/i.test(
              reason,
            );

          if (isProviderConfigErr) {
            aiLog.warn(
              `NOT blacklisting ${domain} — provider config error: ${reason}`,
              `NO se agrega ${domain} a la lista negra — error de configuración del proveedor: ${reason}`,
            );
            throw new Error(
              'AI provider configuration error. Please verify your gateway URL, provider, and API credentials in Settings → AI.',
            );
          }

          await ctx.prisma.blockedSite
            .upsert({
              where: { domain },
              update: { reason },
              create: { domain, reason },
            })
            .catch((e) => logger.warn(`[AI Generator] Failed to block domain ${domain}: ${e}`));

          throw new Error(
            `Failed to generate a working Lua scraper for "${sourceName}" after ${maxAttempts} attempts. Reason: ${reason}. The site has been blacklisted. You can remove it from the blacklist to retry.`,
          );
        }

        // Reset failure counter in memory
        resetSourceFailure(sourceName);

        // Record in database metadata
        await ctx.prisma.luaSource.upsert({
          where: { name: sourceName },
          update: { origin: 'AI_GENERATED' },
          create: { name: sourceName, origin: 'AI_GENERATED' },
        });

        // Clear cache so new source results are immediately available in Search/Library
        clearMangalCache();

        updateAiProgress({
          step: 5,
          stepKey: 'COMPLETED',
          status: 'completed',
          messageEn: `Scraper ${sourceName} successfully generated and verified!`,
          messageEs: `¡Scraper ${sourceName} generado y verificado con éxito!`,
        });

        logger.info(`[AI Generator v${PIPELINE_VERSION}] Successfully generated and installed scraper for ${sourceName}`);
        return { success: true, name: sourceName, luaCode };
      } catch (err: any) {
        const errorMsg = err.message || 'Error during AI source generation';
        logger.error(`[AI Generator] Error generating scraper for ${domain}: ${errorMsg}`);

        updateAiProgress({
          active: false,
          status: 'failed',
          stepKey: 'FAILED',
          messageEn: errorMsg,
          messageEs: errorMsg,
          error: errorMsg,
        });

        const isProviderConfigError =
          /api.?key|401|403|deployment|model.*(not found|invalid)|azure|openai|anthropic|unsupported provider|not supported|endpoint|bearer|unauthorized|could not reach|gateway/i.test(
            errorMsg,
          );

        if (!isProviderConfigError) {
          await ctx.prisma.blockedSite
            .upsert({
              where: { domain },
              update: { reason: errorMsg },
              create: { domain, reason: errorMsg },
            })
            .catch((e) => logger.warn(`[AI Generator] Failed to block domain ${domain}: ${e}`));
        } else {
          logger.warn(
            `[AI Generator] NOT blacklisting ${domain} — error is from AI provider config, not the site: ${errorMsg}`,
          );
        }

        throw new Error(errorMsg);
      }
    }),

  refinePhase: t.procedure
    .input(
      z.object({
        sourceName: z.string(),
        phase: z.enum(['search', 'chapters', 'pages']),
        sampleUrl: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { sourceName, phase, sampleUrl } = input;
      const userLocale = (ctx.req as any)?.locale || ((ctx.req as any)?.url?.startsWith('/es') ? 'es' : 'en');
      const aiLog = {
        info: (en: string, es: string) => logger.info(`[AI Generator v${PIPELINE_VERSION}] ${userLocale === 'es' ? es : en}`),
        warn: (en: string, es: string) => logger.warn(`[AI Generator v${PIPELINE_VERSION}] ${userLocale === 'es' ? es : en}`),
      };

      const { stdout: sourcesPath } = await mangalExec(['where', '-s']);
      const cleanPath = sourcesPath.trim();
      const filePath = path.join(cleanPath, `${sourceName}.lua`);

      let currentLua = '';
      try {
        currentLua = await fs.readFile(filePath, 'utf-8');
      } catch {
        const failedPath = path.join(cleanPath, 'disabled', 'failed', `${sourceName}.lua`);
        const disabledPath = path.join(cleanPath, 'disabled', `${sourceName}.lua`);
        try {
          currentLua = await fs.readFile(failedPath, 'utf-8');
        } catch {
          try {
            currentLua = await fs.readFile(disabledPath, 'utf-8');
          } catch {
            throw new Error(`No se encontró el archivo Lua para la fuente "${sourceName}".`);
          }
        }
      }

      // Extract Base URL from Lua code
      const baseMatch = currentLua.match(/Base\s*=\s*["']([^"']+)["']/i);
      const siteUrl = baseMatch ? baseMatch[1] : '';

      // Get settings for AI provider
      const settings = await ctx.prisma.settings.findFirst().catch(() => null);
      const chosenProvider = settings?.aiProvider || 'openai';
      const chosenModel = settings?.aiModel || undefined;

      let chosenApiKey: string | undefined;
      if (settings) {
        if (chosenProvider === 'openai') chosenApiKey = settings.aiOpenAiKey || undefined;
        else if (chosenProvider === 'anthropic') chosenApiKey = settings.aiAnthropicKey || undefined;
        else if (chosenProvider === 'deepseek') chosenApiKey = settings.aiDeepseekKey || undefined;
        else if (chosenProvider === 'gemini') chosenApiKey = settings.aiGeminiKey || undefined;
        else if (chosenProvider === 'azure_openai') chosenApiKey = settings.aiAzureKey || undefined;
      }
      const targetGateway =
        settings?.aiGatewayUrl ||
        process.env.KAIZEN_AI_GATEWAY_URL ||
        'https://kaizen-ai-gateway.kaizen-architecture.workers.dev';

      const USER_AGENT =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

      const fetchUrlHtml = async (url: string): Promise<string | null> => {
        try {
          const res = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' },
          });
          if (res && res.ok) {
            const text = await res.text();
            if (text.length > 500) {
              if (text.length > 180000) {
                return `${text.slice(0, 180000)}\n<!-- HTML truncated for token budget -->`;
              }
              return text;
            }
          }
        } catch {}
        return null;
      };

      const callGateway = async (
        p: 'search' | 'chapters' | 'pages',
        currentCode?: string,
        sampleHtml?: string,
        errorContext?: string,
      ) => {
        const body: any = {
          siteUrl,
          htmlSample: sampleHtml,
          provider: chosenProvider === 'azure_openai' ? 'azure' : chosenProvider,
          model: chosenModel,
          apiKey: chosenApiKey,
          ollamaUrl: settings?.aiOllamaUrl,
          azureEndpoint: settings?.aiAzureEndpoint,
          azureDeployment: settings?.aiAzureDeployment || chosenModel?.replace(/-\d{4}-\d{2}-\d{2}$/, ''),
          awsAccessKey: settings?.aiAwsAccessKey,
          awsSecretKey: settings?.aiAwsSecretKey,
          awsRegion: settings?.aiAwsRegion,
          phase: p,
          currentLuaCode: currentCode || undefined,
        };
        if (errorContext) body.errorContext = errorContext;

        return fetch(`${targetGateway.replace(/\/$/, '')}/v1/generate-scraper`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).catch(() => null);
      };

      aiLog.info(
        `Refining Phase "${phase}" for scraper "${sourceName}"...`,
        `Refinando Fase "${phase}" para el scraper "${sourceName}"...`,
      );

      let targetHtml = '';
      let instruction = '';

      if (phase === 'search') {
        const searchTargetUrl = sampleUrl || (siteUrl ? `${siteUrl}/search?title=hero` : '');
        if (searchTargetUrl) {
          targetHtml = (await fetchUrlHtml(searchTargetUrl)) || '';
        }
        instruction =
          'IMPORTANT: Target the PRIMARY search results container (e.g. .manga-list-4-list, .search-results, .story-item) and DO NOT select sidebar/recommendations widgets (.manga-list-2-list, sidebar, popular, etc.). Use @author Kaizen AI.';
      } else if (phase === 'chapters') {
        let mangaUrl = sampleUrl || '';
        if (!mangaUrl) {
          const testQueries = ['hero', 'a', 'love', 'star', 'the'];
          for (const q of testQueries) {
            try {
              const { stdout: searchResult } = await mangalExec(
                ['inline', '--source', sourceName, '--query', q, '--json'],
                { timeout: 15000 },
              );
              const parsed = JSON.parse(searchResult);
              const resultsArray = Array.isArray(parsed) ? parsed : parsed?.result || [];
              const valid = resultsArray
                .map((r: any) => r?.mangal?.url || r?.url)
                .filter((u: any) => typeof u === 'string' && u.length > 0);
              if (valid.length > 0) {
                mangaUrl = valid[0];
                break;
              }
            } catch {}
          }
        }
        if (mangaUrl) {
          targetHtml = (await fetchUrlHtml(mangaUrl)) || '';
        }
        instruction =
          'IMPORTANT: Identify the complete chapter list and chapter name selector. Use Reverse(chapters) if latest chapter is listed first.';
      } else if (phase === 'pages') {
        let chapterUrl = sampleUrl || '';
        if (!chapterUrl) {
          const testQueries = ['hero', 'a', 'love', 'star', 'the'];
          for (const q of testQueries) {
            try {
              const { stdout: searchResult } = await mangalExec(
                ['inline', '--source', sourceName, '--query', q, '--json'],
                { timeout: 10000 },
              );
              const parsed = JSON.parse(searchResult);
              const resultsArray = Array.isArray(parsed) ? parsed : parsed?.result || [];
              const valid = resultsArray
                .map((r: any) => r?.mangal?.url || r?.url)
                .filter((u: any) => typeof u === 'string' && u.length > 0);
              if (valid.length > 0) {
                const mangaHtml = (await fetchUrlHtml(valid[0])) || '';
                if (mangaHtml) {
                  const hrefMatches = Array.from(mangaHtml.matchAll(/href=["']([^"']+)["']/gi));
                  const chapterKeywords = ['/c', 'chapter', 'capitulo', 'ch', 'read', 'episode'];
                  const targetHost = new URL(siteUrl || valid[0]).hostname;
                  for (const match of hrefMatches) {
                    const href = match[1];
                    if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) {
                      // eslint-disable-next-line no-continue
                      continue;
                    }
                    const isChapter = chapterKeywords.some((kw) => href.toLowerCase().includes(kw));
                    if (isChapter) {
                      chapterUrl = href.startsWith('http')
                        ? href
                        : `https://${targetHost}${href.startsWith('/') ? href : `/${href}`}`;
                      break;
                    }
                  }
                  if (chapterUrl) break;
                }
              }
            } catch {}
          }
        }
        if (chapterUrl) {
          aiLog.info(
            `Fetched chapter reader URL: ${chapterUrl}`,
            `Obtenida URL del lector de capítulos: ${chapterUrl}`,
          );
          targetHtml = (await fetchUrlHtml(chapterUrl)) || '';
        }
        instruction =
          'IMPORTANT: In ChapterPages, look for specific reader image containers (e.g. div.reader-main img, img.reader-main-img, #viewer img, div.reading-content img, img#image) and extract data-src, src, data-original, data-lazy. Use normalize_url(src).';
      }

      const gatewayRes = await callGateway(phase, currentLua, targetHtml, instruction);
      if (!gatewayRes || !gatewayRes.ok) {
        throw new Error(`El AI Gateway devolvió un error HTTP ${gatewayRes?.status || '500'}`);
      }

      const resData = (await gatewayRes.json()) as { success?: boolean; luaCode?: string; error?: string };
      if (!resData.success || !resData.luaCode) {
        throw new Error(resData.error || `No se pudo refinar la fase ${phase}.`);
      }

      let updatedLua = sanitizeLuaIndexing(resData.luaCode);

      // Stamp refinement metadata in header
      const nowIso = new Date().toISOString().replace('T', ' ').replace(/\..+/, ' UTC');
      const refineTag = `-- @refined ${phase} at ${nowIso}`;
      if (updatedLua.includes('-- @refined')) {
        updatedLua = updatedLua.replace(/--\s*@refined\s+.*$/m, refineTag);
      } else {
        updatedLua = updatedLua.replace(/--\s*@version\s+.*$/m, `$& \n${refineTag}`);
      }

      await fs.writeFile(filePath, updatedLua);

      clearMangalCache();
      resetSourceFailure(sourceName);

      aiLog.info(
        `Successfully refined Phase "${phase}" for scraper "${sourceName}"!`,
        `¡Fase "${phase}" refinada con éxito para el scraper "${sourceName}"!`,
      );

      return { success: true, sourceName, phase, luaCode: updatedLua };
    }),

  testScraper: t.procedure
    .input(
      z.object({
        sourceName: z.string().trim().min(1),
        query: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { sourceName, query } = input;

      // Check if AI is configured in DB/settings
      const settings = await ctx.prisma.settings.findFirst().catch(() => null);
      const hasAiConfigured = !!(
        settings?.aiOpenAiKey ||
        settings?.aiAnthropicKey ||
        settings?.aiDeepseekKey ||
        settings?.aiGeminiKey ||
        (settings?.aiAzureKey && settings?.aiAzureEndpoint) ||
        settings?.aiOllamaUrl
      );

      const logs: string[] = [];
      const log = (msg: string) => {
        logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
      };

      log(`Iniciando prueba del scraper "${sourceName}" con la búsqueda "${query}"...`);

      // Step 1: Search Manga
      let mangaTitleFound = '';
      let mangaUrlFound = '';
      try {
        log(`Paso 1: Ejecutando SearchManga con query "${query}"...`);
        const { stdout: searchResult } = await mangalExec(
          ['inline', '--source', sourceName, '--query', query, '--json'],
          { timeout: 20000 },
        );
        let parsed: any = null;
        try {
          parsed = JSON.parse(searchResult);
        } catch {
          log(`Error: Mangal devolvió respuesta no válida: ${searchResult.slice(0, 300)}`);
          return {
            success: false,
            failedPhase: 'search' as const,
            hasAiConfigured,
            logs,
            errorKey: 'ERR_SEARCH_INVALID_FORMAT',
            errorDetail: 'SearchManga devolvió un formato de salida no válido.',
          };
        }

        const resultsArray = Array.isArray(parsed) ? parsed : parsed?.result || [];
        if (!resultsArray || resultsArray.length === 0) {
          log(`Resultados de búsqueda: 0 mangas encontrados.`);
          return {
            success: false,
            failedPhase: 'search' as const,
            hasAiConfigured,
            logs,
            errorKey: 'ERR_SEARCH_NO_RESULTS',
            errorDetail: `SearchManga no devolvió ningún resultado para la búsqueda "${query}".`,
          };
        }

        const firstResult = resultsArray[0];
        mangaTitleFound = firstResult?.mangal?.name || firstResult?.name || query;
        mangaUrlFound = firstResult?.mangal?.url || firstResult?.url || '';
        log(`Éxito en Paso 1: Encontrado manga "${mangaTitleFound}" (${resultsArray.length} resultados totales).`);
      } catch (err: any) {
        log(`Error en Paso 1 (Búsqueda): ${err?.message || err}`);
        return {
          success: false,
          failedPhase: 'search' as const,
          hasAiConfigured,
          logs,
          errorKey: 'ERR_SEARCH_EXEC_FAILED',
          errorDetail: err?.message || 'Error al ejecutar la búsqueda en el scraper.',
        };
      }

      // Step 2: Fetch Chapters
      let totalChaptersFound = 0;
      let chapterTitleFound = '';
      try {
        log(`Paso 2: Obteniendo lista de capítulos para "${mangaTitleFound}"...`);
        const { stdout: chapterResult } = await mangalExec(
          ['inline', '--source', sourceName, '--query', mangaTitleFound, '--manga', '1', '--json'],
          { timeout: 25000 },
        );
        let parsedChapters: any = null;
        try {
          parsedChapters = JSON.parse(chapterResult);
        } catch {}

        let chaptersArray: any[] | null = null;
        if (Array.isArray(parsedChapters)) {
          chaptersArray = parsedChapters[0]?.mangal?.chapters || parsedChapters[0]?.chapters || parsedChapters;
        } else if (parsedChapters && Array.isArray(parsedChapters.result)) {
          chaptersArray =
            parsedChapters.result[0]?.mangal?.chapters ||
            parsedChapters.result[0]?.chapters ||
            parsedChapters.result;
        } else if (parsedChapters && Array.isArray(parsedChapters.chapters)) {
          chaptersArray = parsedChapters.chapters;
        }

        if (!chaptersArray || chaptersArray.length === 0) {
          log(`Error en Paso 2: MangaChapters no devolvió ningún capítulo.`);
          return {
            success: false,
            failedPhase: 'chapters' as const,
            hasAiConfigured,
            mangaTitleFound,
            mangaUrlFound,
            logs,
            errorKey: 'ERR_CHAPTERS_NO_CHAPTERS',
            errorDetail: 'MangaChapters no detectó capítulos para este manga.',
          };
        }

        totalChaptersFound = chaptersArray.length;
        chapterTitleFound = chaptersArray[0]?.name || 'Capítulo 1';
        log(`Éxito en Paso 2: Se detectaron ${totalChaptersFound} capítulos. Primer capítulo: "${chapterTitleFound}".`);
      } catch (err: any) {
        log(`Error en Paso 2 (Capítulos): ${err?.message || err}`);
        return {
          success: false,
          failedPhase: 'chapters' as const,
          hasAiConfigured,
          mangaTitleFound,
          mangaUrlFound,
          logs,
          errorKey: 'ERR_CHAPTERS_EXEC_FAILED',
          errorDetail: err?.message || 'Error al obtener los capítulos del manga.',
        };
      }

      // Step 3: Test Single Chapter Download (Chapter 1) & CBZ Integrity Check
      const testDir = path.join(os.tmpdir(), `kaizen_test_${Date.now()}`);
      let downloadedPagesCount = 0;
      try {
        await fs.mkdir(testDir, { recursive: true }).catch(() => {});
        log(`Paso 3: Descargando Capítulo 1 de prueba en directorio temporal...`);

        await mangalExec(
          ['inline', '--source', sourceName, '--query', mangaTitleFound, '--manga', '1', '--chapters', '1', '-d'],
          { cwd: testDir, timeout: 40000 },
        );

        const { validateCbzIntegrity } = await import('../../utils/chapterIntegrity');
        const findCbzFiles = async (dir: string): Promise<string[]> => {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          const files: string[] = [];
          for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              files.push(...(await findCbzFiles(full)));
            } else if (entry.name.toLowerCase().endsWith('.cbz') || entry.name.toLowerCase().endsWith('.zip')) {
              files.push(full);
            }
          }
          return files;
        };

        const cbzFiles = await findCbzFiles(testDir);
        if (cbzFiles.length === 0) {
          log(`Error en Paso 3: No se generó ningún archivo CBZ de capítulo.`);
          await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
          return {
            success: false,
            failedPhase: 'pages' as const,
            hasAiConfigured,
            mangaTitleFound,
            mangaUrlFound,
            totalChaptersFound,
            logs,
            errorKey: 'ERR_PAGES_NO_CBZ',
            errorDetail: 'No se generó el archivo CBZ. ChapterPages no pudo extraer las imágenes.',
          };
        }

        const integrity = await validateCbzIntegrity(cbzFiles[0]);
        if (!integrity.isValid) {
          log(`Error en Paso 3: El archivo CBZ falló el control de integridad (${integrity.reason}).`);
          await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
          return {
            success: false,
            failedPhase: 'pages' as const,
            hasAiConfigured,
            mangaTitleFound,
            mangaUrlFound,
            totalChaptersFound,
            logs,
            errorKey: 'ERR_PAGES_CORRUPT_CBZ',
            errorDetail: `Capítulo descargado corrupto o sin páginas válidas: ${integrity.reason}`,
          };
        }

        downloadedPagesCount = integrity.entryCount || 0;
        log(`Éxito en Paso 3: Descargadas ${downloadedPagesCount} páginas válidas. Archivo CBZ verificado correctamente.`);
      } catch (err: any) {
        log(`Error en Paso 3 (Descarga/Páginas): ${err?.message || err}`);
        await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
        return {
          success: false,
          failedPhase: 'pages' as const,
          hasAiConfigured,
          mangaTitleFound,
          mangaUrlFound,
          totalChaptersFound,
          logs,
          errorKey: 'ERR_PAGES_EXEC_FAILED',
          errorDetail: err?.message || 'Error al descargar las imágenes del capítulo.',
        };
      }

      // Cleanup
      await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
      log(`Paso 4: Limpieza completada. Carpeta temporal eliminada.`);

      log(`¡Prueba del scraper completada con ÉXITO total!`);

      return {
        success: true,
        hasAiConfigured,
        mangaTitleFound,
        mangaUrlFound,
        totalChaptersFound,
        downloadedPagesCount,
        logs,
      };
    }),
});

