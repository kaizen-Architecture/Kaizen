/* eslint-disable no-await-in-loop, no-restricted-syntax, no-continue */
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { prisma } from '../db/client';
import { mangalExec, clearCache } from './mangal';
import { logger } from '../../utils/logging';
import { resetSourceFailure } from './failure-tracking';
import { KAIZEN_SCRAPERS_PRIVATE_KEY } from './scrapersKey';

const execAsync = promisify(exec);

interface GithubContentFile {
  name: string;
  type: string;
  download_url: string;
}

export async function syncSourcesFromGithub() {
  try {
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

export async function syncOfficialSources() {
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

      // Clean up disabled/failed duplicates to reactivate correctly
      const disabledFile = path.join(cleanPath, 'disabled', file);
      const failedFile = path.join(cleanPath, 'disabled', 'failed', file);
      await fs.rm(disabledFile, { force: true }).catch(() => {});
      await fs.rm(failedFile, { force: true }).catch(() => {});

      // Reset failure counter in memory
      resetSourceFailure(name);

      await prisma.luaSource.upsert({
        where: { name },
        update: { origin: 'OFFICIAL' },
        create: { name, origin: 'OFFICIAL' },
      });
      syncedCount += 1;
    }

    await clearCache().catch(() => {});
    return { success: true, count: syncedCount };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to sync official Kaizen scrapers: ${err}`);
    throw new Error(`Fallo al sincronizar fuentes oficiales: ${errMsg}`);
  } finally {
    // Cleanup SSH key and temp directory
    await fs.rm(keyPath, { force: true }).catch(() => {});
    await fs.rm(clonePath, { recursive: true, force: true }).catch(() => {});
  }
}

export async function syncAllSources() {
  logger.info('[Sources Auto-Sync] Starting background synchronization of all sources...');
  let githubResults = { count: 0, errors: [] as string[] };
  let officialResults = { count: 0 };

  try {
    githubResults = await syncSourcesFromGithub();
    logger.info(`[Sources Auto-Sync] GitHub sync complete. Synced ${githubResults.count} sources.`);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[Sources Auto-Sync] GitHub sync failed: ${errMsg}`);
    githubResults.errors = [errMsg];
  }

  try {
    officialResults = await syncOfficialSources();
    logger.info(`[Sources Auto-Sync] Official sources sync complete. Synced ${officialResults.count} sources.`);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[Sources Auto-Sync] Official sources sync failed: ${errMsg}`);
  }

  return {
    githubCount: githubResults.count,
    githubErrors: githubResults.errors,
    officialCount: officialResults.count,
  };
}
