import { prisma } from '../db/client';
import { getAvailableSources, getEffectiveMaxChapter, search } from './mangal';

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
