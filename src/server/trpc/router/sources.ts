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

  generateAiScraper: t.procedure
    .input(
      z.object({
        siteUrl: z.string().url(),
        provider: z.enum(['openai', 'anthropic', 'deepseek']),
        apiKey: z.string().min(1),
        gatewayUrl: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const urlObj = new URL(input.siteUrl);
        const hostClean = urlObj.hostname.replace(/^www\./, '').replace(/[^a-zA-Z0-9]/g, '');
        const sourceName = hostClean.charAt(0).toUpperCase() + hostClean.slice(1);

        // 1. Fetch HTML sample from target site
        logger.info(`[AI Generator] Fetching HTML sample from ${input.siteUrl}...`);
        const targetRes = await fetch(input.siteUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        }).catch((err) => {
          logger.warn(`[AI Generator] Target site fetch warning: ${err}`);
          return null;
        });

        let htmlSample = '';
        if (targetRes && targetRes.ok) {
          const rawText = await targetRes.text();
          htmlSample = rawText.slice(0, 30000); // Limit sample size to 30KB
        }

        // 2. Contact AI Gateway
        const targetGateway =
          input.gatewayUrl ||
          process.env.KAIZEN_AI_GATEWAY_URL ||
          'https://kaizen-ai-gateway.d4nj3s.workers.dev';

        logger.info(`[AI Generator] Contacting AI Gateway at ${targetGateway} for ${sourceName}...`);
        const gatewayRes = await fetch(`${targetGateway.replace(/\/$/, '')}/v1/generate-scraper`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            siteUrl: input.siteUrl,
            htmlSample,
            provider: input.provider,
            apiKey: input.apiKey,
          }),
        });

        if (!gatewayRes.ok) {
          const errData = (await gatewayRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(errData.error || `Error del Gateway IA: ${gatewayRes.status}`);
        }

        const data = (await gatewayRes.json()) as { success: boolean; luaCode: string };
        if (!data.success || !data.luaCode) {
          throw new Error('El Gateway de IA no devolvió un código Lua válido.');
        }

        // 3. Save generated Lua file
        const { stdout: sourcesPath } = await mangalExec(['where', '-s']);
        const cleanPath = sourcesPath.trim();
        const fileName = `${sourceName}.lua`;
        const filePath = path.join(cleanPath, fileName);

        await fs.writeFile(filePath, data.luaCode);

        // Reset failure counter in memory
        resetSourceFailure(sourceName);

        // Record in database metadata
        await ctx.prisma.luaSource.upsert({
          where: { name: sourceName },
          update: { origin: 'AI_GENERATED' },
          create: { name: sourceName, origin: 'AI_GENERATED' },
        });

        logger.info(`[AI Generator] Successfully generated and installed scraper for ${sourceName}`);
        return { success: true, name: sourceName, luaCode: data.luaCode };
      } catch (err: any) {
        logger.error(`[AI Generator] Error generating scraper: ${err.message || err}`);
        throw new Error(err.message || 'Error durante la generación de la fuente por IA');
      }
    }),
});
