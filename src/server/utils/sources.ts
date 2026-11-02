/* eslint-disable no-await-in-loop, no-restricted-syntax, no-continue */
import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../db/client';
import { mangalExec, clearCache, getAvailableSources, search } from './mangal';
import { logger } from '../../utils/logging';
import { resetSourceFailure } from './failure-tracking';
import { ensureLuaSourceColumnsExist } from './settings-cache';

interface GithubContentFile {
  name: string;
  type: string;
  download_url: string;
}

const normalizeTitle = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * Reassigns mangas that depended on removed sources. Remaining sources are promoted first;
 * if none are left, an alternative is searched across the active scrapers (title, then synonyms).
 */
async function reassignMangasFromRemovedSources(removed: string[], errors: string[]) {
  const affected = await prisma.manga.findMany({
    where: { OR: [{ source: { in: removed } }, { sources: { some: { source: { in: removed } } } }] },
    include: { sources: true, metadata: true },
  });
  if (affected.length === 0) return;

  const activeSources = (await getAvailableSources()).filter((s) => !removed.includes(s));

  for (const manga of affected) {
    const remaining = manga.sources.filter((s) => !removed.includes(s.source)).sort((a, b) => a.priority - b.priority);
    const removedRows = manga.sources.filter((s) => removed.includes(s.source));

    let newPrimary: string | null = remaining[0]?.source ?? null;

    if (remaining.length === 0) {
      const titles = [manga.title, ...removedRows.map((r) => r.title), ...(manga.metadata?.synonyms ?? [])];
      const uniqueTitles = [...new Set(titles.filter(Boolean))];
      let found: { source: string; title: string; chapters: number } | null = null;

      for (const title of uniqueTitles) {
        if (activeSources.length === 0) break;
        const normTarget = normalizeTitle(title);
        const { result } = await search(activeSources, title);

        // 1. Exact normalized match
        let matches = result
          .filter((r) => r.mangal?.name && normalizeTitle(r.mangal.name) === normTarget)
          .sort((a, b) => (b.mangal.chapters?.length ?? 0) - (a.mangal.chapters?.length ?? 0));

        // 2. Partial/contains fallback if no exact match
        if (matches.length === 0) {
          matches = result
            .filter(
              (r) =>
                r.mangal?.name &&
                (normalizeTitle(r.mangal.name).includes(normTarget) ||
                  normTarget.includes(normalizeTitle(r.mangal.name))),
            )
            .sort((a, b) => (b.mangal.chapters?.length ?? 0) - (a.mangal.chapters?.length ?? 0));
        }

        if (matches.length > 0) {
          found = {
            source: matches[0].source,
            title: matches[0].mangal.name,
            chapters: matches[0].mangal.chapters?.length ?? 0,
          };
          break;
        }
      }

      if (!found) {
        const removedNames = removedRows.map((r) => r.source).join(', ') || manga.source;
        const msg = `El manga "${manga.title}" se ha quedado sin source (scrapers eliminados: ${removedNames}) y no se encontró alternativa en las fuentes activas.`;
        logger.warn(`[Sources Sync] ${msg}`);
        errors.push(msg);
        continue; // keep its rows so user can resolve manually
      }

      await prisma.mangaSource.create({
        data: { mangaId: manga.id, source: found.source, title: found.title, priority: 0 },
      });
      newPrimary = found.source;
      logger.info(
        `[Sources Sync] Alternative source for "${manga.title}": ${found.source} (${found.chapters} chapters)`,
      );
    } else if (remaining[0]) {
      // Ensure the promoted remaining source has priority 0
      await prisma.mangaSource.update({
        where: { id: remaining[0].id },
        data: { priority: 0 },
      });
    }

    await prisma.mangaSource.deleteMany({ where: { mangaId: manga.id, source: { in: removed } } });
    if (newPrimary && removed.includes(manga.source)) {
      await prisma.manga.update({ where: { id: manga.id }, data: { source: newPrimary } });
    }
  }
}

/** Removes GITHUB-origin scrapers that no longer exist in any configured repo. */
async function pruneRemovedGithubSources(cleanPath: string, remoteNames: Set<string>, errors: string[]) {
  const githubSources = await prisma.luaSource.findMany({ where: { origin: 'GITHUB' } });
  const stale = githubSources.map((s) => s.name).filter((name) => !remoteNames.has(name));
  if (stale.length === 0) return 0;

  logger.info(`[Sources Sync] Removing scrapers deleted from the repo: ${stale.join(', ')}`);

  for (const name of stale) {
    const fileName = `${name}.lua`;
    await fs.rm(path.join(cleanPath, fileName), { force: true }).catch(() => {});
    await fs.rm(path.join(cleanPath, 'disabled', fileName), { force: true }).catch(() => {});
    await fs.rm(path.join(cleanPath, 'disabled', 'failed', fileName), { force: true }).catch(() => {});
    await prisma.luaSource.delete({ where: { name } }).catch(() => {});
    resetSourceFailure(name);
  }

  await clearCache().catch(() => {});
  await reassignMangasFromRemovedSources(stale, errors);
  return stale.length;
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
      return { success: true, count: 0, removed: 0, errors: ['No hay repositorios configurados para sincronizar.'] };
    }

    const { stdout: sourcesPath } = await mangalExec(['where', '-s']);
    const cleanPath = sourcesPath.trim();

    let syncedCount = 0;
    const errors: string[] = [];
    const remoteNames = new Set<string>();
    let allReposOk = true;

    for (const repoObj of repos) {
      try {
        const [owner, repo] = repoObj.url.split('/');
        if (!owner || !repo) {
          errors.push(`Formato inválido para ${repoObj.url}. Se espera owner/repo`);
          allReposOk = false;
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
          allReposOk = false;
          continue;
        }

        const files = (await response.json()) as GithubContentFile[];
        const luaFiles = files.filter((f) => f.name.endsWith('.lua') && f.type === 'file');

        luaFiles.forEach((f) => remoteNames.add(f.name.replace('.lua', '')));

        for (const file of luaFiles) {
          const baseName = file.name.replace('.lua', '');
          // A locally edited/uploaded/AI-generated scraper takes precedence over the repo version
          const existing = await prisma.luaSource.findUnique({ where: { name: baseName } });
          if (existing && existing.origin !== 'GITHUB') {
            logger.info(`[Sources Sync] Keeping local version of ${baseName} (origin: ${existing.origin})`);
            continue;
          }

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
        allReposOk = false;
      }
    }

    let removedCount = 0;
    if (allReposOk && remoteNames.size > 0) {
      try {
        removedCount = await pruneRemovedGithubSources(cleanPath, remoteNames, errors);
      } catch (e: unknown) {
        errors.push(`Fallo al limpiar scrapers eliminados: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else if (!allReposOk) {
      logger.warn('[Sources Sync] Skipping prune of removed scrapers because at least one repo failed to sync.');
    }

    await clearCache().catch(() => {});
    return { success: true, count: syncedCount, removed: removedCount, errors };
  } catch (err) {
    logger.error(`Failed to sync sources from GitHub: ${err}`);
    throw err;
  }
}

export async function syncAllSources() {
  logger.info('[Sources Auto-Sync] Starting background synchronization of configured user GitHub sources...');
  let githubResults = { count: 0, removed: 0, errors: [] as string[] };

  try {
    githubResults = await syncSourcesFromGithub();
    logger.info(`[Sources Auto-Sync] GitHub sync complete. Synced ${githubResults.count} sources, removed ${githubResults.removed ?? 0}.`);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[Sources Auto-Sync] GitHub sync failed: ${errMsg}`);
    githubResults.errors = [errMsg];
  }

  return {
    githubCount: githubResults.count,
    githubRemoved: githubResults.removed ?? 0,
    githubErrors: githubResults.errors,
    officialCount: 0,
  };
}
