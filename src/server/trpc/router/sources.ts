import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { t } from '../trpc';
import { mangalExec } from '../../utils/mangal';
import { logger } from '../../../utils/logging';
import { KAIZEN_SCRAPERS_PRIVATE_KEY } from '../../utils/scrapersKey';

const execAsync = promisify(exec);

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
        } catch (e) {}

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

  sync: t.procedure.mutation(async ({ ctx }) => {
    try {
      let repos = await ctx.prisma.sourceRepository.findMany();
      if (repos.length === 0) {
        const settings = await ctx.prisma.settings.findFirst();
        if (settings?.githubRepo) {
          repos = [
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

      if (repos.length === 0) {
        throw new Error('No hay repositorios configurados para sincronizar.');
      }

      const { stdout: sourcesPath } = await mangalExec(['where', '-s']);
      const cleanPath = sourcesPath.trim();

      let syncedCount = 0;
      const errors: string[] = [];

      for (const repoObj of repos) {
        try {
          const [owner, repo] = repoObj.url.split('/');
          if (!owner || !repo) {
            errors.push(`Formato inválido para ${repoObj.url}. Se espera owner/repo`);
            continue;
          }

          const headers: Record<string, string> = {
            Accept: 'application/vnd.github.v3+json',
          };
          if (repoObj.token) {
            headers.Authorization = `token ${repoObj.token}`;
          }

          const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents`, { headers });
          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            errors.push(`Error API GitHub para ${repoObj.url}: ${response.status} ${errData.message || ''}`);
            continue;
          }

          const files = (await response.json()) as any[];
          const luaFiles = files.filter((f) => f.name.endsWith('.lua') && f.type === 'file');

          for (const file of luaFiles) {
            const fileHeaders: Record<string, string> = {};
            if (repoObj.token) {
              fileHeaders.Authorization = `token ${repoObj.token}`;
            }

            const fileResponse = await fetch(file.download_url, { headers: fileHeaders });
            if (fileResponse.ok) {
              const content = await fileResponse.text();
              await fs.writeFile(path.join(cleanPath, file.name), content);

              const name = file.name.replace('.lua', '');
              await ctx.prisma.luaSource.upsert({
                where: { name },
                update: { origin: 'GITHUB' },
                create: { name, origin: 'GITHUB' },
              });

              syncedCount++;
            }
          }
        } catch (e: any) {
          errors.push(`Fallo al sincronizar ${repoObj.url}: ${e.message}`);
        }
      }

      if (syncedCount === 0 && errors.length > 0) {
        throw new Error(errors.join('. '));
      }

      return { success: true, count: syncedCount, errors };
    } catch (err) {
      logger.error(`Failed to sync sources from GitHub: ${err}`);
      throw err;
    }
  }),

  syncKaizen: t.procedure.mutation(async ({ ctx }) => {
    const keyPath = path.join('/tmp', `id_kaizen_scrappers_${Date.now()}`);
    const clonePath = path.join('/tmp', `kaizen_scrapers_${Date.now()}`);
    try {
      const { stdout: sourcesPath } = await mangalExec(['where', '-s']);
      const cleanPath = sourcesPath.trim();

      // Write private key to /tmp with mode 0o600
      await fs.writeFile(keyPath, KAIZEN_SCRAPERS_PRIVATE_KEY, { mode: 0o600 });
      await fs.chmod(keyPath, 0o600);

      // Clone repository
      const cmd = `GIT_SSH_COMMAND="ssh -i ${keyPath} -o StrictHostKeyChecking=no" git clone --depth 1 git@github.com:kaizen-Architecture/Mangal_Scrappers_Dist.git ${clonePath}`;
      await execAsync(cmd);

      // Read files and save as OFFICIAL
      const files = await fs.readdir(clonePath);
      const luaFiles = files.filter((f) => f.endsWith('.lua'));

      let syncedCount = 0;
      for (const file of luaFiles) {
        const content = await fs.readFile(path.join(clonePath, file), 'utf-8');
        await fs.writeFile(path.join(cleanPath, file), content);

        const name = file.replace('.lua', '');
        await ctx.prisma.luaSource.upsert({
          where: { name },
          update: { origin: 'OFFICIAL' },
          create: { name, origin: 'OFFICIAL' },
        });
        syncedCount++;
      }

      return { success: true, count: syncedCount };
    } catch (err: any) {
      logger.error(`Failed to sync official Kaizen scrapers: ${err}`);
      throw new Error(`Fallo al sincronizar fuentes oficiales: ${err.message || err}`);
    } finally {
      // Cleanup SSH key and temp directory
      await fs.rm(keyPath, { force: true }).catch(() => {});
      await fs.rm(clonePath, { recursive: true, force: true }).catch(() => {});
    }
  }),

  upload: t.procedure.input(z.object({ name: z.string(), content: z.string() })).mutation(async ({ ctx, input }) => {
    try {
      const { stdout: sourcesPath } = await mangalExec(['where', '-s']);
      const cleanPath = sourcesPath.trim();

      const fileName = input.name.endsWith('.lua') ? input.name : `${input.name}.lua`;
      const filePath = path.join(cleanPath, fileName);

      await fs.writeFile(filePath, input.content);

      const name = fileName.replace('.lua', '');
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
});
