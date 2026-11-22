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
}

export interface BetterSourceScanStatus {
  isRunning: boolean;
  cancelled: boolean;
  processedCount: number;
  totalCount: number;
  totalReleasingInLibrary: number;
  currentMangaTitle: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  recommendations: BetterSourceRecommendation[];
}

let cancelRequested = false;
let state: Omit<BetterSourceScanStatus, 'totalReleasingInLibrary'> = {
  isRunning: false,
  cancelled: false,
  processedCount: 0,
  totalCount: 0,
  currentMangaTitle: null,
  startedAt: null,
  finishedAt: null,
  recommendations: [],
};

export async function getBetterSourceScanStatus(): Promise<BetterSourceScanStatus> {
  const totalReleasingInLibrary = await prisma.manga
    .count({
      where: {
        isAcceptedStandalone: false,
        source: { not: 'NONE' },
        metadata: { status: 'RELEASING' },
      },
    })
    .catch(() => 0);

  return {
    ...state,
    totalReleasingInLibrary,
    recommendations: [...state.recommendations].sort((a, b) => b.delta - a.delta),
  };
}

export function cancelBetterSourceScan(): { cancelled: boolean } {
  if (state.isRunning) {
    cancelRequested = true;
  }
  return { cancelled: true };
}

export async function startBetterSourceScan(
  limit?: number,
): Promise<{ started: boolean; alreadyRunning: boolean; total: number }> {
  if (state.isRunning) {
    return { started: false, alreadyRunning: true, total: state.totalCount };
  }

  const releasingMangas = await prisma.manga.findMany({
    where: {
      isAcceptedStandalone: false,
      source: { not: 'NONE' },
      metadata: { status: 'RELEASING' },
    },
    include: {
      chapters: { select: { fileName: true, index: true } },
      sources: true,
    },
    orderBy: { createdAt: 'desc' },
    ...(limit ? { take: limit } : {}),
  });

  cancelRequested = false;
  state = {
    isRunning: true,
    cancelled: false,
    processedCount: 0,
    totalCount: releasingMangas.length,
    currentMangaTitle: releasingMangas[0]?.title || null,
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

      for (const manga of releasingMangas) {
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

  return { started: true, alreadyRunning: false, total: releasingMangas.length };
}
