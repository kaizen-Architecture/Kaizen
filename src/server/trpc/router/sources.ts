import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
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
          htmlSample = rawText.slice(0, 30000);
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

        // Try to discover the search URL pattern by testing common patterns
        let discoveredSearchUrl = '';
        const baseSite = input.siteUrl.replace(/\/$/, '');
        const searchPatterns = [
          `${baseSite}/search?q=hero`,
          `${baseSite}/search?title=hero`,
          `${baseSite}/search?query=hero`,
          `${baseSite}/search?keyword=hero`,
          `${baseSite}/?s=hero`,
          `${baseSite}/?q=hero`,
          `${baseSite}/buscar?q=hero`,
          `${baseSite}/buscar?keyword=hero`,
          `${baseSite}/search?word=hero`,
          `${baseSite}/find?q=hero`,
        ];

        /* eslint-disable no-await-in-loop */
        for (let si = 0; si < searchPatterns.length; si += 1) {
          try {
            aiLog.info(
              `Trying search URL pattern: ${searchPatterns[si]}`,
              `Intentando patrón de URL de búsqueda: ${searchPatterns[si]}`,
            );
            const searchRes = await fetch(searchPatterns[si], {
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
              },
            });
            if (searchRes && searchRes.ok) {
              const searchHtml = await searchRes.text();
              // Check if the search page has actual content (not empty/error page)
              if (searchHtml.length > 500 && !searchHtml.includes('404') && !searchHtml.includes('not found')) {
                discoveredSearchUrl = searchPatterns[si];
                // Fetch more HTML from the search page as the sample
                htmlSample = searchHtml.slice(0, 30000);
                aiLog.info(
                  `Search URL discovered: ${discoveredSearchUrl}`,
                  `URL de búsqueda descubierta: ${discoveredSearchUrl}`,
                );
                break;
              }
            }
          } catch {
            // Pattern failed, try next
          }
        } /* eslint-enable no-await-in-loop */

        if (!discoveredSearchUrl) {
          aiLog.warn(
            'Could not discover search URL, falling back to site homepage sample',
            'No se pudo descubrir URL de búsqueda, usando muestra de homepage',
          );
        }

        const targetGateway =
          input.gatewayUrl ||
          settings?.aiGatewayUrl ||
          process.env.KAIZEN_AI_GATEWAY_URL ||
          'https://kaizen-ai-gateway.kaizen-architecture.workers.dev';

        const maxAttempts = 3;

        const callGateway = async (errorContext?: string) => {
          aiLog.info(`Contacting AI Gateway at ${targetGateway}...`, `Contactando AI Gateway en ${targetGateway}...`);

          const body: any = {
            siteUrl: input.siteUrl,
            htmlSample,
            provider: chosenProvider === 'azure_openai' ? 'azure' : chosenProvider,
            model: chosenModel,
            apiKey: chosenApiKey,
            ollamaUrl: settings?.aiOllamaUrl,
            azureEndpoint: settings?.aiAzureEndpoint,
            azureDeployment: settings?.aiAzureDeployment || chosenModel?.replace(/-\d{4}-\d{2}-\d{2}$/, ''),
            awsAccessKey: settings?.aiAwsAccessKey,
            awsSecretKey: settings?.aiAwsSecretKey,
            awsRegion: settings?.aiAwsRegion,
          };
          if (discoveredSearchUrl) body.searchUrl = discoveredSearchUrl;
          if (errorContext) body.errorContext = errorContext;

          logger.info(
            `[AI Generator] Gateway request: provider=${body.provider}, model=${body.model || 'N/A'}, ` +
              `azureEndpoint=${body.azureEndpoint || 'N/A'}, azureDeployment=${body.azureDeployment || 'N/A'}`,
          );

          return fetch(`${targetGateway.replace(/\/$/, '')}/v1/generate-scraper`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }).catch(() => null);
        };

        let luaCode = '';
        let gatewayFailureError = '';

        /* eslint-disable no-await-in-loop, no-continue */
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          aiLog.info(
            `Attempt ${attempt}/${maxAttempts} for ${sourceName} — Step 1/5: Calling gateway`,
            `Intento ${attempt}/${maxAttempts} para ${sourceName} — Paso 1/5: Llamando al gateway`,
          );

          const gatewayRes = await callGateway(gatewayFailureError || undefined);

          if (gatewayRes && gatewayRes.ok) {
            const data = (await gatewayRes.json()) as { success?: boolean; luaCode?: string };
            if (data.success && data.luaCode) {
              luaCode = data.luaCode;
              gatewayFailureError = '';
              aiLog.info(
                `Step 2/5: Lua code generated (${luaCode.length} chars)`,
                `Paso 2/5: Código Lua generado (${luaCode.length} chars)`,
              );
            } else {
              gatewayFailureError = 'Gateway returned success=false';
              aiLog.warn('Gateway returned success=false', 'El gateway devolvió success=false');
            }
          } else if (gatewayRes) {
            const errData = await gatewayRes.json().catch(() => ({}));
            gatewayFailureError = `Gateway HTTP ${gatewayRes.status}: ${errData.error || 'upstream error'}`;
            aiLog.warn(
              `Gateway returned HTTP ${gatewayRes.status} for ${sourceName}`,
              `El gateway devolvió HTTP ${gatewayRes.status} para ${sourceName}`,
            );
            logger.warn(`[AI Generator] Gateway HTTP ${gatewayRes.status} error body: ${errData.error || ''}`);
          } else {
            gatewayFailureError = 'Could not reach the AI Gateway';
            aiLog.warn('Could not reach the AI Gateway', 'No se pudo conectar al AI Gateway');
          }

          if (!luaCode) {
            if (attempt < maxAttempts)
              aiLog.info('Retrying with error context...', 'Reintentando con contexto de error...');
            continue;
          }

          aiLog.info(
            'Step 3/5: Saving Lua file to mangal sources directory',
            'Paso 3/5: Guardando archivo Lua en directorio de sources',
          );
          const { stdout: sourcesPath } = await mangalExec(['where', '-s']);
          const cleanPath = sourcesPath.trim();
          const fileName = `${sourceName}.lua`;
          const filePath = path.join(cleanPath, fileName);

          await fs.writeFile(filePath, luaCode);
          aiLog.info(`Lua file saved: ${filePath}`, `Archivo Lua guardado: ${filePath}`);

          aiLog.info(
            'Step 4/5: Validating Lua syntax via mangal sources list',
            'Paso 4/5: Validando sintaxis Lua con mangal sources list',
          );
          let validationPassed = false;
          let validationErrorDetail = '';
          try {
            const { stdout: sourcesList } = await mangalExec(['sources', 'list', '-r']);
            validationPassed = (sourcesList as string)
              .split('\n')
              .map((s: string) => s.trim().toLowerCase())
              .includes(sourceName.toLowerCase());
            if (validationPassed) {
              aiLog.info(
                'Validation passed — scraper loaded by Mangal',
                'Validación pasó — scraper cargado por Mangal',
              );
            } else {
              aiLog.warn(
                'Validation failed — scraper not found in mangal sources list',
                'Validación falló — scraper no encontrado en mangal sources list',
              );
            }
          } catch (validationErr: any) {
            validationErrorDetail = `${validationErr?.message || validationErr}\nstdout: ${
              validationErr?.stdout || ''
            }\nstderr: ${validationErr?.stderr || ''}`;
            aiLog.warn(
              `Could not validate scraper via mangal sources list: ${validationErr?.message || validationErr}`,
              `No se pudo validar el scraper via mangal sources list: ${validationErr?.message || validationErr}`,
            );
            validationPassed = true;
          }

          if (!validationPassed) {
            await fs.unlink(filePath).catch(() => {});
            gatewayFailureError = `Generated Lua has syntax/runtime errors — Mangal could not load it. Mangal output:\n${validationErrorDetail}`;
            luaCode = '';
            aiLog.warn(
              'Step 4/5 failed — retrying with error context',
              'Paso 4/5 falló — reintentando con contexto de error',
            );
            continue;
          }

          aiLog.info('Step 5/5: Running functional test', 'Paso 5/5: Ejecutando test funcional');
          let functionalPassed = false;
          let funcErrorDetail = '';

          // Phase 1: Try full flow (--manga 1) with multiple fallback keywords (Option 2)
          const testQueries = ['hero', 'love', 'demon', 'star', 'a', 'the', 'red', 'blue'];
          for (let qi = 0; qi < testQueries.length; qi += 1) {
            const query = testQueries[qi];
            try {
              aiLog.info(
                `Try functional test with query "${query}" (--manga 1)...`,
                `Intentando test funcional con query "${query}" (--manga 1)...`,
              );
              const { stdout: searchResult } = await mangalExec(
                ['inline', '--source', sourceName, '--query', query, '--manga', '1', '--json'],
                { timeout: 30000 },
              );
              if (searchResult && typeof searchResult === 'string') {
                const parsed = JSON.parse(searchResult);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  functionalPassed = true;
                  aiLog.info(
                    `Functional test passed with query "${query}" (${parsed.length} results)`,
                    `Test funcional pasó con query "${query}" (${parsed.length} results)`,
                  );
                  break;
                }
              }
              aiLog.info(
                `Query "${query}" returned no results, trying next...`,
                `Query "${query}" no devolvió resultados, probando siguiente...`,
              );
            } catch (funcErr: any) {
              funcErrorDetail = [funcErr?.message || '', funcErr?.stdout || '', funcErr?.stderr || '']
                .filter(Boolean)
                .join('\n');
              aiLog.info(
                `Query "${query}" failed (may be empty results), trying next...`,
                `Query "${query}" falló (posiblemente sin resultados), probando siguiente...`,
              );
            }
          }

          // Phase 2: Search-only test (without --manga 1) — verify SearchManga returns valid JSON (Option 1)
          if (!functionalPassed) {
            aiLog.info(
              'Phase 2: Search-only test (valid JSON even if empty = SearchManga works)',
              'Fase 2: Test de búsqueda solo (JSON válido incluso vacío = SearchManga funciona)',
            );
            const phase2Queries = ['hero', 'a', 'love'];
            for (let qi = 0; qi < phase2Queries.length; qi += 1) {
              const query = phase2Queries[qi];
              try {
                const { stdout: searchResult } = await mangalExec(
                  ['inline', '--source', sourceName, '--query', query, '--json'],
                  { timeout: 30000 },
                );
                if (searchResult && typeof searchResult === 'string') {
                  const parsed = JSON.parse(searchResult);
                  if (Array.isArray(parsed)) {
                    functionalPassed = true;
                    if (parsed.length > 0) {
                      // Phase 3: Use real title from results to test full flow (Option 3)
                      const realTitle = parsed[0]?.name;
                      if (realTitle) {
                        aiLog.info(
                          `Phase 3: Found real title "${realTitle}", testing full flow...`,
                          `Fase 3: Encontrado título real "${realTitle}", probando flujo completo...`,
                        );
                        try {
                          await mangalExec(
                            ['inline', '--source', sourceName, '--query', realTitle, '--manga', '1', '--json'],
                            { timeout: 30000 },
                          );
                          aiLog.info(
                            `Full flow test passed with real title "${realTitle}"`,
                            `Test de flujo completo pasó con título real "${realTitle}"`,
                          );
                        } catch (fullFlowErr: any) {
                          aiLog.warn(
                            `Full flow test failed with real title, but SearchManga works — scraper is valid`,
                            `Test de flujo completo falló con título real, pero SearchManga funciona — scraper es válido`,
                          );
                        }
                      }
                    } else {
                      aiLog.info(
                        `SearchManga returns valid JSON but empty results for "${query}" — scraper is valid`,
                        `SearchManga devuelve JSON válido pero resultados vacíos para "${query}" — scraper es válido`,
                      );
                    }
                    break;
                  }
                }
              } catch (funcErr: any) {
                funcErrorDetail = [funcErr?.message || '', funcErr?.stdout || '', funcErr?.stderr || '']
                  .filter(Boolean)
                  .join('\n');
              }
            }
          }

          if (!functionalPassed) {
            await fs.unlink(filePath).catch(() => {});
            const funcErrorSummary = funcErrorDetail || 'mangal inline returned no valid JSON response';
            gatewayFailureError = `Generated Lua failed functional test — could not search manga with any test query (hero, love, demon, star, a, the, red, blue).\nError details:\n${funcErrorSummary}\n\nGenerated Lua code:\n${luaCode}`;
            luaCode = '';
            aiLog.warn(
              'Step 5/5 failed — retrying with functional test error for AI correction',
              'Paso 5/5 falló — reintentando con error de test funcional para corrección de la IA',
            );
            continue;
          }

          aiLog.info(
            `All steps passed! Scraper for ${sourceName} is working.`,
            `¡Todos los pasos pasaron! El scraper para ${sourceName} funciona.`,
          );

          // All validations passed — exit retry loop
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
