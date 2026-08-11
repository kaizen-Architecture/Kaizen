/* eslint-disable no-await-in-loop, no-restricted-syntax, no-continue */
import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../db/client';
import { mangalExec, clearCache } from './mangal';
import { logger } from '../../utils/logging';
import { resetSourceFailure } from './failure-tracking';
import { ensureLuaSourceColumnsExist } from './settings-cache';

interface GithubContentFile {
  name: string;
  type: string;
  download_url: string;
}

export async function syncSourcesFromGithub() {
  try {
    await ensureLuaSourceColumnsExist();
    let repos = await prisma.sourceRepository.findMany();
    if (repos.length === 0) {
      const settings = await prisma.settings.findFirst();
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
      return { success: true, count: 0, errors: ['No hay repositorios configurados para sincronizar.'] };
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
          const errData = (await response.json().catch(() => ({}))) as { message?: string };
          errors.push(`Error API GitHub para ${repoObj.url}: ${response.status} ${errData.message || ''}`);
          continue;
        }

        const files = (await response.json()) as GithubContentFile[];
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

            // Clean up disabled/failed duplicates to reactivate correctly
            const disabledFile = path.join(cleanPath, 'disabled', file.name);
            const failedFile = path.join(cleanPath, 'disabled', 'failed', file.name);
            await fs.rm(disabledFile, { force: true }).catch(() => {});
            await fs.rm(failedFile, { force: true }).catch(() => {});

            // Reset failure counter in memory
            resetSourceFailure(name);

            await prisma.luaSource.upsert({
              where: { name },
              update: { origin: 'GITHUB' },
              create: { name, origin: 'GITHUB' },
            });

            syncedCount += 1;
          }
        }
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        errors.push(`Fallo al sincronizar ${repoObj.url}: ${errMsg}`);
      }
    }

    await clearCache().catch(() => {});
    return { success: true, count: syncedCount, errors };
  } catch (err) {
    logger.error(`Failed to sync sources from GitHub: ${err}`);
    throw err;
  }
}

export async function syncAllSources() {
  logger.info('[Sources Auto-Sync] Starting background synchronization of configured user GitHub sources...');
  let githubResults = { count: 0, errors: [] as string[] };

  try {
    githubResults = await syncSourcesFromGithub();
    logger.info(`[Sources Auto-Sync] GitHub sync complete. Synced ${githubResults.count} sources.`);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[Sources Auto-Sync] GitHub sync failed: ${errMsg}`);
    githubResults.errors = [errMsg];
  }

  return {
    githubCount: githubResults.count,
    githubErrors: githubResults.errors,
    officialCount: 0,
  };
}
