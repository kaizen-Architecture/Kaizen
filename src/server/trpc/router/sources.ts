import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { t } from '../trpc';
import { mangalExec } from '../../utils/mangal';
import { logger } from '../../../utils/logging';
import { syncSourcesFromGithub } from '../../utils/sources';
import { resetSourceFailure } from '../../utils/failure-tracking';

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
            origin: sourceMetadata.get(name) || 'LOCAL',
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
            origin: sourceMetadata.get(name) || 'LOCAL',
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
            origin: sourceMetadata.get(name) || 'LOCAL',
          };
        });

      return [...activeSources, ...inactiveSources, ...failedSources];
    } catch (err) {
      logger.error(`Failed to list sources: ${err}`);
      return [];
    }
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
      await ctx.prisma.blockedSite.delete({
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
      const sourceName = hostClean.charAt(0).toUpperCase() + hostClean.slice(1);

      const userLocale = (ctx.req as any)?.locale || ((ctx.req as any)?.url?.startsWith('/es') ? 'es' : 'en');
      const aiLog = {
        info: (en: string, es: string) => logger.info(`[AI Generator] ${userLocale === 'es' ? es : en}`),
        warn: (en: string, es: string) => logger.warn(`[AI Generator] ${userLocale === 'es' ? es : en}`),
      };

      try {
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
                // Preserve enough HTML for selectors — don't truncate below 80KB
                if (text.length > 80000) {
                  return `${text.slice(0, 80000)}\n<!-- HTML truncated for token budget -->`;
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

        const callGateway = async (errorContext?: string, functionName?: string, sampleHtml?: string) => {
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
            generateMode: functionName ? 'single' : 'full',
            functionName: functionName || undefined,
          };
          // Use user-provided searchUrl if available, otherwise fallback
          body.searchUrl = input.searchUrl || '';
          if (errorContext) body.errorContext = errorContext;

          logger.info(
            `[AI Generator] Gateway request: provider=${body.provider}, model=${body.model || 'N/A'}, ` +
              `azureEndpoint=${body.azureEndpoint || 'N/A'}, azureDeployment=${body.azureDeployment || 'N/A'}, ` +
              `searchUrl=${body.searchUrl || 'none'}, function=${functionName || 'full'}`,
          );

          return fetch(`${targetGateway.replace(/\/$/, '')}/v1/generate-scraper`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }).catch(() => null);
        };

        let luaCode = '';
        let gatewayFailureError = '';

        // 3-Step AI approach: generate SearchManga, then MangaChapters, then ChapterPages
        // Each step uses real HTML fetched from the site to give the AI accurate context
        /* eslint-disable no-await-in-loop */
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          aiLog.info(
            `Attempt ${attempt}/${maxAttempts} for ${sourceName}`,
            `Intento ${attempt}/${maxAttempts} para ${sourceName}`,
          );

          // --- STEP 1: Generate SearchManga ---
          aiLog.info('Phase 1: Generating SearchManga...', 'Fase 1: Generando SearchManga...');
          let stepHtmlSample = htmlSample;
          const gatewayRes = await callGateway(gatewayFailureError || undefined, 'SearchManga');

          let luaCodeStep1 = '';
          if (gatewayRes && gatewayRes.ok) {
            const data = (await gatewayRes.json()) as { success?: boolean; luaCode?: string; error?: string };
            if (data.success && data.luaCode) {
              luaCodeStep1 = data.luaCode;
              aiLog.info(
                `SearchManga generated (${luaCodeStep1.length} chars)`,
                `SearchManga generada (${luaCodeStep1.length} chars)`,
              );
            } else {
              gatewayFailureError = data.error || 'Gateway returned success=false';
            }
          } else if (gatewayRes) {
            const errData = await gatewayRes.json().catch(() => ({}));
            gatewayFailureError = `Gateway HTTP ${gatewayRes.status}: ${errData.error || 'upstream error'}`;
            aiLog.warn(`Gateway HTTP ${gatewayRes.status}`, `Gateway HTTP ${gatewayRes.status}`);
            logger.warn(`[AI Generator] Gateway HTTP ${gatewayRes.status} error body: ${errData.error || ''}`);
          } else {
            gatewayFailureError = 'Could not reach the AI Gateway';
          }

          if (!luaCodeStep1) {
            continue;
          }

          // Test SearchManga to extract a real manga URL
          let realMangaUrl = '';
          let realTitle = '';
          const testQueries = ['hero', 'a', 'love', 'star', 'the'];
          for (let qi = 0; qi < testQueries.length; qi += 1) {
            try {
              const tempPath = path.join(os.tmpdir(), `${sourceName}_step1.lua`);
              await fs.writeFile(tempPath, luaCodeStep1);
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
                if (resultsArray && resultsArray.length > 0) {
                  realTitle = resultsArray[0]?.name || '';
                  realMangaUrl = resultsArray[0]?.url || '';
                  aiLog.info(
                    `SearchManga works! Found "${realTitle}" with query "${testQueries[qi]}"`,
                    `SearchManga funciona! Encontrado "${realTitle}" con query "${testQueries[qi]}"`,
                  );
                  break;
                }
              }
            } catch {
              // Query failed, try next
            } finally {
              const tempPath = path.join(os.tmpdir(), `${sourceName}_step1.lua`);
              await fs.unlink(tempPath).catch(() => {});
            }
          }

          // --- STEP 2: Generate MangaChapters ---
          let mangaPageHtml = '';
          if (realMangaUrl) {
            mangaPageHtml = (await fetchUrlHtml(realMangaUrl)) || '';
            if (mangaPageHtml) {
              stepHtmlSample += `\n\n--- MANGA DETAIL PAGE HTML (${realMangaUrl}) ---\n${mangaPageHtml}`;
              aiLog.info(
                `Manga detail HTML fetched (${mangaPageHtml.length} bytes)`,
                `HTML de página de manga obtenido (${mangaPageHtml.length} bytes)`,
              );
            }
          }

          aiLog.info('Phase 2: Generating MangaChapters...', 'Fase 2: Generando MangaChapters...');
          const gatewayRes2 = await callGateway(undefined, 'MangaChapters', stepHtmlSample);

          let luaCodeStep2 = '';
          if (gatewayRes2 && gatewayRes2.ok) {
            const data2 = (await gatewayRes2.json()) as { success?: boolean; luaCode?: string; error?: string };
            if (data2.success && data2.luaCode) {
              luaCodeStep2 = data2.luaCode;
              aiLog.info(
                `MangaChapters generated (${luaCodeStep2.length} chars)`,
                `MangaChapters generada (${luaCodeStep2.length} chars)`,
              );
            } else {
              gatewayFailureError = data2.error || 'Gateway returned success=false';
            }
          } else if (gatewayRes2) {
            const errData = await gatewayRes2.json().catch(() => ({}));
            gatewayFailureError = `Gateway HTTP ${gatewayRes2.status}: ${
              errData.error || 'MangaChapters generation failed'
            }`;
          } else {
            gatewayFailureError = 'Could not reach the AI Gateway';
          }

          if (!luaCodeStep2) {
            continue;
          }

          // --- STEP 3: Generate ChapterPages ---
          // Try to get a chapter URL by testing the manga detail scraper
          let chapterPageHtml = '';
          let chapterUrl = '';
          if (realTitle || realMangaUrl) {
            const tempPath = path.join(os.tmpdir(), `${sourceName}_step2.lua`);
            await fs.writeFile(tempPath, `${luaCodeStep1}\n\n${luaCodeStep2}`);
            try {
              const { stdout: chapterResult } = await mangalExec(
                ['inline', '--source', sourceName, '--query', realTitle || 'hero', '--manga', '1', '--json'],
                { timeout: 20000 },
              );
              if (chapterResult) {
                const parsed = JSON.parse(chapterResult);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  chapterUrl = parsed[0]?.url || parsed[0]?.source || '';
                }
              }
            } catch {
              // Chapter extraction failed
            } finally {
              await fs.unlink(tempPath).catch(() => {});
            }

            if (chapterUrl) {
              chapterPageHtml = (await fetchUrlHtml(chapterUrl)) || '';
              if (chapterPageHtml) {
                stepHtmlSample += `\n\n--- CHAPTER PAGE HTML (${chapterUrl}) ---\n${chapterPageHtml}`;
                aiLog.info(
                  `Chapter page HTML fetched (${chapterPageHtml.length} bytes)`,
                  `HTML de página de capítulo obtenido (${chapterPageHtml.length} bytes)`,
                );
              }
            }

            // If still no chapter URL, extract from manga detail HTML links (generic)
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
              if (chapterUrl) {
                aiLog.info(
                  `Chapter URL extracted from manga HTML: ${chapterUrl}`,
                  `URL de capítulo extraída del HTML: ${chapterUrl}`,
                );
              }
            }
            if (chapterUrl && !chapterPageHtml) {
              chapterPageHtml = (await fetchUrlHtml(chapterUrl)) || '';
              if (chapterPageHtml) {
                stepHtmlSample += `\n\n--- CHAPTER PAGE HTML (${chapterUrl}) ---\n${chapterPageHtml}`;
                aiLog.info(
                  `Chapter page HTML fetched (${chapterPageHtml.length} bytes)`,
                  `HTML de página de capítulo obtenido (${chapterPageHtml.length} bytes)`,
                );
              }
            }
          }

          aiLog.info('Phase 3: Generating ChapterPages...', 'Fase 3: Generando ChapterPages...');
          const gatewayRes3 = await callGateway(undefined, 'ChapterPages', stepHtmlSample);

          let luaCodeStep3 = '';
          if (gatewayRes3 && gatewayRes3.ok) {
            const data3 = (await gatewayRes3.json()) as { success?: boolean; luaCode?: string; error?: string };
            if (data3.success && data3.luaCode) {
              luaCodeStep3 = data3.luaCode;
              aiLog.info(
                `ChapterPages generated (${luaCodeStep3.length} chars)`,
                `ChapterPages generada (${luaCodeStep3.length} chars)`,
              );
            } else {
              gatewayFailureError = data3.error || 'Gateway returned success=false';
            }
          } else if (gatewayRes3) {
            const errData = await gatewayRes3.json().catch(() => ({}));
            gatewayFailureError = `Gateway HTTP ${gatewayRes3.status}: ${
              errData.error || 'ChapterPages generation failed'
            }`;
          } else {
            gatewayFailureError = 'Could not reach the AI Gateway';
          }

          if (!luaCodeStep3) {
            continue;
          }

          // Combine all 3 functions
          luaCode = `${luaCodeStep1}\n\n${luaCodeStep2}\n\n${luaCodeStep3}`;
          gatewayFailureError = '';
          aiLog.info(
            `All 3 functions combined (${luaCode.length} chars total)`,
            `Todas las 3 funciones combinadas (${luaCode.length} chars total)`,
          );

          // Save and validate
          aiLog.info('Step 6: Saving Lua file', 'Paso 6: Guardando archivo Lua');
          const { stdout: sourcesPath } = await mangalExec(['where', '-s']);
          const cleanPath = sourcesPath.trim();
          const fileName = `${sourceName}.lua`;
          const filePath = path.join(cleanPath, fileName);
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
                  functionalPassed = true;
                  aiLog.info(
                    `Functional test passed with query "${testQueries2[qi]}" (${resultsArray.length} results)`,
                    `Test funcional pasó con query "${testQueries2[qi]}" (${resultsArray.length} results)`,
                  );
                  break;
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
            await fs.unlink(filePath).catch(() => {});
            luaCode = ''; // Clear so the retry loop or final check doesn't use stale code
            const funcErrorSummary = funcErrorDetail || 'mangal inline returned no results or non-JSON output';
            gatewayFailureError = `Generated Lua failed functional test — could not search manga with any test query (hero, love, demon, star, a, the).\nError details:\n${funcErrorSummary}\n\nGenerated Lua code:\n${luaCode}`;
            aiLog.warn(
              `Functional test failed — error detail: ${funcErrorSummary.slice(0, 200)}...`,
              `Test funcional falló — detalle del error: ${funcErrorSummary.slice(0, 200)}...`,
            );
            continue;
          }

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

        logger.info(`[AI Generator] Successfully generated and installed scraper for ${sourceName}`);
        return { success: true, name: sourceName, luaCode };
      } catch (err: any) {
        const errorMsg = err.message || 'Error during AI source generation';
        logger.error(`[AI Generator] Error generating scraper for ${domain}: ${errorMsg}`);

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
});
