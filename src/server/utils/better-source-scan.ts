import { prisma } from '../db/client';
import {
  getAvailableSources,
  getChaptersFromRemote,
  getEffectiveMaxChapter,
  mangalExec,
  ScraperCore,
  search,
} from './mangal';
import { logger } from '../../utils/logging';

export interface BetterSourceRecommendation {
  mangaId: number;
  title: string;
  currentSource: string;
  currentMaxChapter: number;
  bestSource: string;
  bestMatchedTitle: string;
  bestMaxChapter: number;
  delta: number;
  isReading: boolean;
}

export interface BetterSourceScanStatus {
  isRunning: boolean;
  cancelled: boolean;
  processedCount: number;
  totalCount: number;
  totalReleasingInLibrary: number;
  totalReadingReleasingInLibrary: number;
  currentMangaTitle: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  recommendations: BetterSourceRecommendation[];
}

let cancelRequested = false;
let state: Omit<BetterSourceScanStatus, 'totalReleasingInLibrary' | 'totalReadingReleasingInLibrary'> = {
  isRunning: false,
  cancelled: false,
  processedCount: 0,
  totalCount: 0,
  currentMangaTitle: null,
  startedAt: null,
  finishedAt: null,
  recommendations: [],
};

async function loadPrioritizedReleasingMangas() {
  const releasingMangas = await prisma.manga.findMany({
    where: {
      isAcceptedStandalone: false,
      source: { not: 'NONE' },
      metadata: { status: 'RELEASING' },
    },
    include: {
      chapters: {
        select: {
          fileName: true,
          index: true,
          isRead: true,
          lastReadAt: true,
          lastReadPage: true,
          userProgress: {
            select: {
              isRead: true,
              lastReadAt: true,
              lastReadPage: true,
            },
          },
        },
      },
      sources: true,
      userFavorites: { select: { id: true } },
    },
  });

  const enriched = releasingMangas.map((manga) => {
    let lastReadMs = 0;
    let hasReadingProgress = false;

    for (const ch of manga.chapters) {
      if (ch.isRead || ch.lastReadPage > 0 || ch.lastReadAt) {
        hasReadingProgress = true;
        if (ch.lastReadAt) {
          const t = ch.lastReadAt.getTime();
          if (t > lastReadMs) lastReadMs = t;
        }
      }
      for (const up of ch.userProgress || []) {
        if (up.isRead || up.lastReadPage > 0 || up.lastReadAt) {
          hasReadingProgress = true;
          if (up.lastReadAt) {
            const t = up.lastReadAt.getTime();
            if (t > lastReadMs) lastReadMs = t;
          }
        }
      }
    }

    const isFav = manga.isFavorite || (manga.userFavorites?.length || 0) > 0;
    return {
      manga,
      hasReadingProgress,
      lastReadMs,
      isFav,
    };
  });

  // Priority order:
  // 1. Actively being read (most recently read first)
  // 2. Favorited mangas
  // 3. Remaining RELEASING mangas (newest first)
  enriched.sort((a, b) => {
    if (a.hasReadingProgress !== b.hasReadingProgress) {
      return a.hasReadingProgress ? -1 : 1;
    }
    if (a.lastReadMs !== b.lastReadMs) {
      return b.lastReadMs - a.lastReadMs;
    }
    if (a.isFav !== b.isFav) {
      return a.isFav ? -1 : 1;
    }
    return b.manga.createdAt.getTime() - a.manga.createdAt.getTime();
  });

  return enriched;
}

export async function getBetterSourceScanStatus(): Promise<BetterSourceScanStatus> {
  let totalReleasingInLibrary = 0;
  let totalReadingReleasingInLibrary = 0;

  try {
    const prioritized = await loadPrioritizedReleasingMangas();
    totalReleasingInLibrary = prioritized.length;
    totalReadingReleasingInLibrary = prioritized.filter((p) => p.hasReadingProgress).length;
  } catch {
    // ignore
  }

  return {
    ...state,
    totalReleasingInLibrary,
    totalReadingReleasingInLibrary,
    recommendations: [...state.recommendations].sort((a, b) => {
      if (a.isReading !== b.isReading) return a.isReading ? -1 : 1;
      return b.delta - a.delta;
    }),
  };
}

export function cancelBetterSourceScan(): { cancelled: boolean } {
  if (state.isRunning) {
    cancelRequested = true;
  }
  return { cancelled: true };
}

export async function startBetterSourceScan(options?: {
  limit?: number;
  readingOnly?: boolean;
}): Promise<{ started: boolean; alreadyRunning: boolean; total: number }> {
  if (state.isRunning) {
    return { started: false, alreadyRunning: true, total: state.totalCount };
  }

  const prioritized = await loadPrioritizedReleasingMangas();
  let selected = options?.readingOnly ? prioritized.filter((p) => p.hasReadingProgress) : prioritized;
  if (options?.limit && options.limit > 0) {
    selected = selected.slice(0, options.limit);
  }

  cancelRequested = false;
  state = {
    isRunning: true,
    cancelled: false,
    processedCount: 0,
    totalCount: selected.length,
    currentMangaTitle: selected[0]?.manga.title || null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    recommendations: [],
  };

  (async () => {
    try {
      const allSources = await getAvailableSources();
      const normalizeTitle = (str: string) =>
        str
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
          .trim();

      for (const entry of selected) {
        const { manga, hasReadingProgress } = entry;
        if (cancelRequested) {
          state.cancelled = true;
          break;
        }

        state.currentMangaTitle = manga.title;
        const currentMax = getEffectiveMaxChapter(manga.chapters);
        const normTitle = normalizeTitle(manga.title);
        const otherSources = allSources.filter((s) => s !== manga.source);

        if (otherSources.length > 0) {
          try {
            const { result } = await search(otherSources, manga.title, 'kaizen-mangal');
            let best: { source: string; title: string; maxCh: number } | null = null;
            for (const r of result || []) {
              if (!r.source || !r.mangal?.name) continue;
              const normRes = normalizeTitle(r.mangal.name);
              if (normRes !== normTitle && !normRes.includes(normTitle) && !normTitle.includes(normRes)) {
                continue;
              }
              const maxCh = getEffectiveMaxChapter(r.mangal.chapters || []);
              if (maxCh > currentMax && (!best || maxCh > best.maxCh)) {
                best = { source: r.source, title: r.mangal.name, maxCh };
              }
            }
            if (best) {
              state.recommendations.push({
                mangaId: manga.id,
                title: manga.title,
                currentSource: manga.source,
                currentMaxChapter: currentMax,
                bestSource: best.source,
                bestMatchedTitle: best.title,
                bestMaxChapter: best.maxCh,
                delta: best.maxCh - currentMax,
                isReading: hasReadingProgress,
              });
            }
          } catch {
            // ignore per-manga search errors
          }
        }

        state.processedCount += 1;
        if (!cancelRequested) {
          await new Promise((res) => setTimeout(res, 400));
        }
      }
    } finally {
      state.isRunning = false;
      state.currentMangaTitle = null;
      state.finishedAt = new Date().toISOString();
    }
  })();

  return { started: true, alreadyRunning: false, total: selected.length };
}

// ============================================================================
// Per-Manga Async Better Source Advisor (live per-source progress & streaming)
// ============================================================================

export interface MangaBetterSourceSuggestion {
  source: string;
  matchedTitle: string;
  remoteMaxChapter: number;
  remoteTotalEntries: number;
  chapterGain: number;
  delta: number;
  isBetter: boolean;
}

export interface MangaBetterSourceScanStatus {
  mangaId: number;
  title: string;
  isRunning: boolean;
  cancelled: boolean;
  processedSources: number;
  totalSources: number;
  currentSource: string | null;
  currentQuery: string | null;
  currentSourceName: string;
  currentMaxChapter: number;
  localMaxChapter: number;
  startedAt: string | null;
  finishedAt: string | null;
  failedSources: string[];
  suggestions: MangaBetterSourceSuggestion[];
}

interface PerMangaScanEntry {
  status: MangaBetterSourceScanStatus;
  cancelRequested: boolean;
  lastUpdatedMs: number;
}

const PER_MANGA_SCAN_TTL_MS = 60 * 60 * 1000; // 1 hour
const PER_MANGA_SCAN_MAX_FINISHED = 50;
const SINGLE_SOURCE_TIMEOUT_MS = 30_000;

const globalForBetterSource = globalThis as unknown as {
  __kaizenMangaBetterSourceScans?: Map<number, PerMangaScanEntry>;
};

function getPerMangaScanMap(): Map<number, PerMangaScanEntry> {
  if (!globalForBetterSource.__kaizenMangaBetterSourceScans) {
    globalForBetterSource.__kaizenMangaBetterSourceScans = new Map<number, PerMangaScanEntry>();
  }
  return globalForBetterSource.__kaizenMangaBetterSourceScans;
}

function pruneStalePerMangaScans() {
  const map = getPerMangaScanMap();
  const now = Date.now();
  const finishedEntries: Array<[number, PerMangaScanEntry]> = [];

  for (const [id, entry] of map.entries()) {
    if (!entry.status.isRunning) {
      if (now - entry.lastUpdatedMs > PER_MANGA_SCAN_TTL_MS) {
        map.delete(id);
      } else {
        finishedEntries.push([id, entry]);
      }
    }
  }

  if (finishedEntries.length > PER_MANGA_SCAN_MAX_FINISHED) {
    finishedEntries.sort((a, b) => a[1].lastUpdatedMs - b[1].lastUpdatedMs);
    const toRemove = finishedEntries.length - PER_MANGA_SCAN_MAX_FINISHED;
    for (let i = 0; i < toRemove; i += 1) {
      const item = finishedEntries[i];
      if (item) {
        map.delete(item[0]);
      }
    }
  }
}

function normalizeTitleForAdvisor(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function isFatalScraperError(err: any): boolean {
  if (err?.exitCode === 75) return true;
  const text = `${err?.message || ''} ${err?.stdout || ''} ${err?.stderr || ''}`.toLowerCase();
  return (
    text.includes('[kaizen-mangal:breaker-open]') ||
    text.includes('syntax error') ||
    text.includes('parse error') ||
    text.includes('unexpected symbol') ||
    text.includes('attempt to ') ||
    text.includes('stack traceback') ||
    text.includes('nil value') ||
    text.includes('bad argument') ||
    text.includes('failed to load') ||
    text.includes('no such file') ||
    text.includes('lua error') ||
    text.includes('.lua:')
  );
}

interface FastSingleSourceSearchResult {
  results: Array<{
    source: string;
    mangal?: {
      name?: string;
      chapters?: Array<{ name?: string; index: number }>;
    };
  }>;
  fatalError?: string;
}

/**
 * Queries a single source without Anilist overhead and with fast-fail semantics
 * (1 attempt, 30s timeout) so broken/slow Lua scrapers never stall the per-manga sweep.
 */
async function searchSingleSourceFast(
  source: string,
  query: string,
  scraperCore: ScraperCore,
): Promise<FastSingleSourceSearchResult> {
  const args = ['inline', '--query', query, '-j', '--chapters', 'all', '--source', source];
  try {
    const { stdout } = await mangalExec(args, { timeout: SINGLE_SOURCE_TIMEOUT_MS }, 1, 1000, scraperCore);
    if (!stdout || !stdout.trim()) {
      return { results: [] };
    }
    const parsed = JSON.parse(stdout);
    return { results: Array.isArray(parsed?.result) ? parsed.result : [] };
  } catch (err: any) {
    if (isFatalScraperError(err)) {
      const reason = String(err?.stderr || err?.message || 'scraper runtime error').slice(0, 160);
      logger.warn(`[BetterSourceAdvisor] Skipping broken/tripped scraper "${source}": ${reason}`);
      return { results: [], fatalError: reason };
    }
    return { results: [] };
  }
}

function sortSuggestions(suggestions: MangaBetterSourceSuggestion[]): MangaBetterSourceSuggestion[] {
  return [...suggestions].sort(
    (a, b) => b.remoteMaxChapter - a.remoteMaxChapter || b.remoteTotalEntries - a.remoteTotalEntries,
  );
}

export async function getMangaBetterSourceScanStatus(
  mangaId: number,
): Promise<MangaBetterSourceScanStatus | null> {
  const entry = getPerMangaScanMap().get(mangaId);
  if (entry) {
    return {
      ...entry.status,
      failedSources: [...entry.status.failedSources],
      suggestions: sortSuggestions(entry.status.suggestions),
    };
  }

  const manga = await prisma.manga.findUnique({
    where: { id: mangaId },
    include: {
      chapters: { select: { fileName: true, index: true } },
      sources: true,
    },
  });

  if (!manga) {
    return null;
  }

  const localMax = getEffectiveMaxChapter(manga.chapters);
  const primarySourceObj =
    [...manga.sources].sort((a, b) => a.priority - b.priority)[0] || { source: manga.source, title: manga.title };

  return {
    mangaId: manga.id,
    title: manga.title,
    isRunning: false,
    cancelled: false,
    processedSources: 0,
    totalSources: 0,
    currentSource: null,
    currentQuery: null,
    currentSourceName: primarySourceObj.source,
    currentMaxChapter: localMax,
    localMaxChapter: localMax,
    startedAt: null,
    finishedAt: null,
    failedSources: [],
    suggestions: [],
  };
}

export function cancelMangaBetterSourceScan(mangaId: number): { cancelled: boolean; mangaId: number } {
  const entry = getPerMangaScanMap().get(mangaId);
  if (entry && entry.status.isRunning) {
    entry.cancelRequested = true;
    entry.lastUpdatedMs = Date.now();
  }
  return { cancelled: true, mangaId };
}

export function updateMangaBetterSourceScanAfterSwitch(mangaId: number, newSource: string): void {
  const entry = getPerMangaScanMap().get(mangaId);
  if (!entry) return;
  entry.status.currentSourceName = newSource;
  entry.status.suggestions = entry.status.suggestions.filter((s) => s.source !== newSource);
  entry.lastUpdatedMs = Date.now();
}

export async function startMangaBetterSourceScan(
  mangaId: number,
): Promise<{ started: boolean; alreadyRunning: boolean; mangaId: number; totalSources: number } | null> {
  pruneStalePerMangaScans();
  const map = getPerMangaScanMap();
  const existing = map.get(mangaId);
  if (existing && existing.status.isRunning) {
    return {
      started: false,
      alreadyRunning: true,
      mangaId,
      totalSources: existing.status.totalSources,
    };
  }

  const manga = await prisma.manga.findUnique({
    where: { id: mangaId },
    include: {
      chapters: { select: { fileName: true, index: true } },
      sources: true,
      metadata: { select: { synonyms: true } },
    },
  });

  if (!manga) {
    return null;
  }

  const scraperCore: ScraperCore = manga.scraperCore === 'mangal' ? 'mangal' : 'kaizen-mangal';
  const localMax = getEffectiveMaxChapter(manga.chapters);
  const primarySourceObj =
    [...manga.sources].sort((a, b) => a.priority - b.priority)[0] || { source: manga.source, title: manga.title };

  const candidateQueries = Array.from(
    new Set(
      [
        manga.title,
        primarySourceObj.title,
        manga.title.split(/[:~–—]/)[0]?.trim() || '',
        ...(manga.metadata?.synonyms || []).slice(0, 2),
      ].filter((q) => q && q.length >= 3),
    ),
  ).slice(0, 3);

  const allSources = await getAvailableSources();
  const targetSources = allSources.filter((s) => s !== primarySourceObj.source);

  const entry: PerMangaScanEntry = {
    cancelRequested: false,
    lastUpdatedMs: Date.now(),
    status: {
      mangaId: manga.id,
      title: manga.title,
      isRunning: true,
      cancelled: false,
      processedSources: 0,
      totalSources: targetSources.length,
      currentSource: targetSources[0] || null,
      currentQuery: candidateQueries[0] || null,
      currentSourceName: primarySourceObj.source,
      currentMaxChapter: localMax,
      localMaxChapter: localMax,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      failedSources: [],
      suggestions: [],
    },
  };

  map.set(mangaId, entry);

  (async () => {
    try {
      // 1. Check remote max chapter on the manga's current primary source (in background, non-blocking for /start)
      if (primarySourceObj.source && primarySourceObj.source !== 'NONE' && !entry.cancelRequested) {
        entry.status.currentSource = primarySourceObj.source;
        entry.status.currentQuery = primarySourceObj.title;
        try {
          const currentRemote = await getChaptersFromRemote(
            primarySourceObj.source,
            primarySourceObj.title,
            scraperCore,
          );
          const remoteMax = getEffectiveMaxChapter(currentRemote);
          if (remoteMax > entry.status.currentMaxChapter) {
            entry.status.currentMaxChapter = remoteMax;
          }
        } catch {
          // ignore primary remote check errors; fall back to localMax
        }
      }

      const normTargets = new Set(candidateQueries.map(normalizeTitleForAdvisor).filter(Boolean));
      const matchedSources = new Set<string>();
      const brokenSources = new Set<string>();

      // 2. Scan each candidate source one-by-one, streaming suggestions live as they arrive
      for (const source of targetSources) {
        if (entry.cancelRequested) {
          entry.status.cancelled = true;
          break;
        }

        entry.status.currentSource = source;
        entry.lastUpdatedMs = Date.now();

        for (const query of candidateQueries) {
          if (entry.cancelRequested) {
            entry.status.cancelled = true;
            break;
          }
          if (matchedSources.has(source) || brokenSources.has(source)) {
            break;
          }

          entry.status.currentQuery = query;
          entry.lastUpdatedMs = Date.now();

          const { results, fatalError } = await searchSingleSourceFast(source, query, scraperCore);

          if (fatalError) {
            brokenSources.add(source);
            if (!entry.status.failedSources.includes(source)) {
              entry.status.failedSources.push(source);
            }
            break;
          }

          let bestForSource: { matchedTitle: string; remoteMaxChapter: number; remoteTotalEntries: number } | null =
            null;

          for (const r of results) {
            if (!r.mangal?.name) continue;
            const normResult = normalizeTitleForAdvisor(r.mangal.name);
            const isMatch = Array.from(normTargets).some(
              (nt) => normResult === nt || normResult.includes(nt) || nt.includes(normResult),
            );
            if (!isMatch) continue;

            const chapters = r.mangal.chapters || [];
            const remoteMaxChapter = getEffectiveMaxChapter(chapters);
            const remoteTotalEntries = chapters.length;
            if (remoteMaxChapter <= 0) continue;

            if (
              !bestForSource ||
              remoteMaxChapter > bestForSource.remoteMaxChapter ||
              (remoteMaxChapter === bestForSource.remoteMaxChapter &&
                remoteTotalEntries > bestForSource.remoteTotalEntries)
            ) {
              bestForSource = {
                matchedTitle: r.mangal.name,
                remoteMaxChapter,
                remoteTotalEntries,
              };
            }
          }

          if (bestForSource) {
            const chapterGain = bestForSource.remoteMaxChapter - entry.status.currentMaxChapter;
            matchedSources.add(source);
            entry.status.suggestions.push({
              source,
              matchedTitle: bestForSource.matchedTitle,
              remoteMaxChapter: bestForSource.remoteMaxChapter,
              remoteTotalEntries: bestForSource.remoteTotalEntries,
              chapterGain,
              delta: chapterGain,
              isBetter: chapterGain > 0,
            });
            entry.status.suggestions = sortSuggestions(entry.status.suggestions);
            break;
          }
        }

        if (entry.cancelRequested) {
          entry.status.cancelled = true;
          break;
        }

        entry.status.processedSources += 1;
        entry.lastUpdatedMs = Date.now();
      }
    } catch (err: any) {
      logger.error(`[BetterSourceAdvisor] Per-manga scan failed for manga ${mangaId}: ${err?.message || err}`);
    } finally {
      entry.status.isRunning = false;
      entry.status.currentSource = null;
      entry.status.currentQuery = null;
      entry.status.finishedAt = new Date().toISOString();
      entry.lastUpdatedMs = Date.now();
      logger.info(
        `[BetterSourceAdvisor] Finished per-manga scan for "${manga.title}" (id=${mangaId}): ${entry.status.suggestions.length} suggestions, ${entry.status.failedSources.length} skipped/failed, cancelled=${entry.status.cancelled}`,
      );
    }
  })();

  return {
    started: true,
    alreadyRunning: false,
    mangaId: manga.id,
    totalSources: targetSources.length,
  };
}
