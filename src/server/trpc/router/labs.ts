import { z } from 'zod';
import { t } from '../trpc';
import { clearMangalCache, getCoreDiagnostics, ScraperCore } from '../../utils/mangal';

const BUILTIN_PROVIDERS = ['Mangadex', 'Manganato', 'Manganelo', 'Mangapill'];

export const labsRouter = t.router({
  getStatus: t.procedure.query(async ({ ctx }) => {
    const [diagnostics, settings, mangas, builtinMangaSources] = await Promise.all([
      getCoreDiagnostics(),
      ctx.prisma.settings.findFirst({ select: { id: true, defaultScraperCore: true } }),
      ctx.prisma.manga.findMany({
        select: {
          id: true,
          title: true,
          source: true,
          scraperCore: true,
        },
      }),
      ctx.prisma.mangaSource.findMany({
        where: {
          source: { in: BUILTIN_PROVIDERS },
        },
        select: {
          mangaId: true,
          source: true,
          manga: { select: { title: true } },
        },
      }),
    ]);

    const defaultScraperCore: ScraperCore =
      settings?.defaultScraperCore === 'kaizen-mangal' ? 'kaizen-mangal' : 'mangal';

    let mangalCount = 0;
    let kaizenMangalCount = 0;
    for (const m of mangas) {
      if (m.scraperCore === 'kaizen-mangal') {
        kaizenMangalCount += 1;
      } else {
        mangalCount += 1;
      }
    }

    const builtinPrimary = mangas.filter((m) => BUILTIN_PROVIDERS.includes(m.source));
    const affectedMap = new Map<number, { id: number; title: string; sources: Set<string> }>();
    for (const m of builtinPrimary) {
      affectedMap.set(m.id, { id: m.id, title: m.title, sources: new Set([m.source]) });
    }
    for (const ms of builtinMangaSources) {
      const existing = affectedMap.get(ms.mangaId);
      if (existing) {
        existing.sources.add(ms.source);
      } else {
        affectedMap.set(ms.mangaId, {
          id: ms.mangaId,
          title: ms.manga.title,
          sources: new Set([ms.source]),
        });
      }
    }

    const builtinAudit = Array.from(affectedMap.values()).map((item) => ({
      id: item.id,
      title: item.title,
      sources: Array.from(item.sources),
    }));

    return {
      diagnostics,
      defaultScraperCore,
      envOverride: process.env.KAIZEN_SCRAPER_BIN || null,
      counts: {
        total: mangas.length,
        mangal: mangalCount,
        kaizenMangal: kaizenMangalCount,
      },
      builtinAudit,
    };
  }),

  listMangas: t.procedure.query(async ({ ctx }) => {
    const mangas = await ctx.prisma.manga.findMany({
      orderBy: { title: 'asc' },
      include: {
        metadata: { select: { cover: true } },
        _count: { select: { chapters: true } },
      },
    });

    return mangas.map((m) => ({
      id: m.id,
      title: m.title,
      source: m.source,
      scraperCore: (m.scraperCore === 'kaizen-mangal' ? 'kaizen-mangal' : 'mangal') as ScraperCore,
      chaptersCount: m._count.chapters,
      cover: m.metadata?.cover || '/cover-not-found.jpg',
    }));
  }),

  setDefaultCore: t.procedure
    .input(
      z.object({
        core: z.enum(['mangal', 'kaizen-mangal']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.settings.findFirst({ select: { id: true } });
      if (existing) {
        await ctx.prisma.settings.update({
          where: { id: existing.id },
          data: { defaultScraperCore: input.core },
        });
      } else {
        await ctx.prisma.settings.create({
          data: { defaultScraperCore: input.core },
        });
      }
      clearMangalCache();
      return { success: true, defaultScraperCore: input.core };
    }),

  assignCore: t.procedure
    .input(
      z.object({
        core: z.enum(['mangal', 'kaizen-mangal']),
        mangaIds: z.array(z.number()).optional(),
        source: z.string().optional(),
        all: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let whereClause: Record<string, any> = {};
      if (input.all) {
        whereClause = {};
      } else if (input.source) {
        whereClause = { source: input.source };
      } else if (input.mangaIds && input.mangaIds.length > 0) {
        whereClause = { id: { in: input.mangaIds } };
      } else {
        return { updated: 0 };
      }

      const res = await ctx.prisma.manga.updateMany({
        where: whereClause,
        data: { scraperCore: input.core },
      });

      // When moving mangas to kaizen-mangal, clear any 24h FailedDownload circuit-breaker pauses
      // inherited from legacy mangal failures so kaizen-mangal can retry them immediately.
      if (input.core === 'kaizen-mangal') {
        if (input.all) {
          await ctx.prisma.failedDownload.deleteMany({}).catch(() => {});
        } else if (input.mangaIds && input.mangaIds.length > 0) {
          await ctx.prisma.failedDownload
            .deleteMany({ where: { mangaId: { in: input.mangaIds } } })
            .catch(() => {});
        } else if (input.source) {
          const affected = await ctx.prisma.manga.findMany({
            where: { source: input.source },
            select: { id: true },
          });
          if (affected.length > 0) {
            await ctx.prisma.failedDownload
              .deleteMany({ where: { mangaId: { in: affected.map((m) => m.id) } } })
              .catch(() => {});
          }
        }
      }

      clearMangalCache();
      return { updated: res.count };
    }),
});
