import { Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import path from 'path';
import { z } from 'zod';
import fs from 'fs';
import { isCronValid, sanitizer } from '../../../utils';
import { logger } from '../../../utils/logging';
import { checkChaptersQueue, removeJob, schedule } from '../../queue/checkChapters';
import { checkOutOfSyncChaptersQueue } from '../../queue/checkOutOfSyncChapters';
import { downloadQueue, downloadWorker, removeDownloadJobs } from '../../queue/download';
import { fixOutOfSyncChaptersQueue } from '../../queue/fixOutOfSyncChapters';
import { scheduleUpdateMetadata } from '../../queue/updateMetadata';
import { triggerStatusAuditNow } from '../../queue/refreshMangaStatus';
import { scanLibrary } from '../../utils/integration';
import { refreshMetadata as refreshKavita } from '../../utils/integration/kavita';
import { refreshMetadata as refreshKomga } from '../../utils/integration/komga';
import {
  bindTitleToAnilistId,
  clearCache,
  getAvailableSources,
  getMangaDetail,
  getMangaMetadata,
  getMangaPath,
  removeManga,
  search,
} from '../../utils/mangal';
import { t } from '../trpc';

const mangaWithLibraryAndChapters = Prisma.validator<Prisma.MangaArgs>()({
  include: { library: true, chapters: true, sources: true },
});

export type MangaWithLibraryAndChapters = Prisma.MangaGetPayload<typeof mangaWithLibraryAndChapters>;

let staggerProgress = {
  title: '',
  current: 0,
  total: 0,
};

export const mangaRouter = t.router({
  query: t.procedure.query(async ({ ctx }) => {
    const mangas = await ctx.prisma.manga.findMany({
      include: {
        metadata: {
          select: {
            cover: true,
            status: true,
          },
        },
        library: true,
        chapters: {
          where: {
            metadataInjected: false,
          },
          select: {
            id: true,
          },
        },
        _count: {
          select: { chapters: true, outOfSyncChapters: true },
        },
      },
    });

    const readCounts = await ctx.prisma.chapter.groupBy({
      by: ['mangaId'],
      where: {
        isRead: true,
      },
      _count: {
        id: true,
      },
    });

    const readCountMap = new Map(readCounts.map((c) => [c.mangaId, c._count.id]));

    return mangas.map((manga) => {
      const readCount = readCountMap.get(manga.id) || 0;
      const totalCount = manga._count.chapters;
      return {
        ...manga,
        readChaptersCount: readCount,
        isFullyRead: totalCount > 0 && readCount === totalCount,
      };
    });
  }),
  scanLibrary: t.procedure.mutation(async () => {
    await scanLibrary();
  }),
  failedIntegrations: t.procedure.query(async ({ ctx }) => {
    return ctx.prisma.chapter.findMany({
      where: { metadataFailed: true },
      select: {
        id: true,
        index: true,
        fileName: true,
        metadataError: true,
        createdAt: true,
        manga: {
          select: {
            title: true,
            source: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }),
  retryFailedIntegration: t.procedure.input(z.object({ chapterId: z.number() })).mutation(async ({ input, ctx }) => {
    await ctx.prisma.chapter.update({
      where: { id: input.chapterId },
      data: {
        metadataFailed: false,
        metadataError: null,
      },
    });
    const { injectMetadata } = await import('../../utils/integration/kavita');
    await injectMetadata(input.chapterId);
  }),
  retryAllFailedIntegrations: t.procedure.mutation(async ({ ctx }) => {
    const failedChapters = await ctx.prisma.chapter.findMany({
      where: { metadataFailed: true },
      select: { id: true },
    });

    if (failedChapters.length > 0) {
      await ctx.prisma.chapter.updateMany({
        where: { id: { in: failedChapters.map((c) => c.id) } },
        data: {
          metadataFailed: false,
          metadataError: null,
        },
      });

      const { integrationQueue } = await import('../../queue/integration');
      await integrationQueue.add('run_integrations', null);
    }
  }),
  sources: t.procedure.query(async () => {
    return getAvailableSources();
  }),
  getSchedules: t.procedure.query(async ({ ctx }) => {
    return ctx.prisma.manga.findMany({
      select: {
        id: true,
        title: true,
        interval: true,
        source: true,
        metadata: {
          select: {
            cover: true,
            status: true,
          },
        },
        isLocked: true,
      },
      orderBy: { title: 'asc' },
    });
  }),
  sync: t.procedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const { id } = input;
    await checkChaptersQueue.add(nanoid(), { mangaId: id });
  }),
  syncAll: t.procedure.input(z.object({ source: z.string().nullish() }).optional()).mutation(async ({ input, ctx }) => {
    const source = input?.source;
    const allMangas = await ctx.prisma.manga.findMany({
      where: source ? { source } : undefined,
      select: { id: true },
    });
    await checkChaptersQueue.addBulk(
      allMangas.map((m) => ({
        opts: {
          jobId: nanoid(),
        },
        data: { mangaId: m.id },
        name: nanoid(),
      })),
    );
  }),
  bind: t.procedure
    .input(
      z.object({
        title: z.string().trim().min(1),
        anilistId: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const { title, anilistId } = input;
      await bindTitleToAnilistId(title, anilistId);
    }),
  detail: t.procedure
    .input(
      z.object({
        source: z.string().trim().min(1),
        title: z.string().trim().min(1),
      }),
    )
    .query(async ({ input }) => {
      const { title, source } = input;
      return getMangaDetail(source, title);
    }),
  get: t.procedure
    .input(
      z.object({
        id: z.number(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { id } = input;
      return ctx.prisma.manga.findUniqueOrThrow({
        include: {
          chapters: {
            select: {
              id: true,
              index: true,
              createdAt: true,
              fileName: true,
              size: true,
              isRead: true,
              lastReadAt: true,
              lastReadPage: true,
              favoritePages: true,
            },
            orderBy: {
              index: 'desc',
            },
          },
          library: true,
          metadata: true,
          outOfSyncChapters: {
            select: {
              id: true,
            },
          },
          sources: {
            orderBy: {
              priority: 'asc',
            },
          },
        },
        where: { id },
      });
    }),
  updateMinChapters: t.procedure
    .input(
      z.object({
        id: z.number(),
        minChapters: z.number(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { id, minChapters } = input;
      const manga = await ctx.prisma.manga.update({
        where: { id },
        data: { minChaptersForDownload: minChapters },
      });
      // Re-schedule the manga when threshold changes
      const fullManga = await ctx.prisma.manga.findUniqueOrThrow({
        include: { library: true, sources: true },
        where: { id },
      });
      await schedule(fullManga, true);
      return manga;
    }),
  updateLastReadPage: t.procedure
    .input(
      z.object({
        id: z.number(),
        page: z.number(),
        isRead: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { id, page, isRead } = input;
      return ctx.prisma.chapter.update({
        where: { id },
        data: {
          lastReadPage: page,
          lastReadAt: new Date(),
          isRead: isRead !== undefined ? isRead : undefined,
        },
      });
    }),
  bookmarkedChapters: t.procedure.query(async ({ ctx }) => {
    return ctx.prisma.chapter.findMany({
      where: {
        NOT: {
          favoritePages: {
            equals: [],
          },
        },
      },
      include: {
        manga: {
          include: {
            metadata: {
              select: {
                cover: true,
              },
            },
          },
        },
      },
      orderBy: {
        lastReadAt: 'desc',
      },
    });
  }),
  toggleChapterFavorite: t.procedure
    .input(z.object({ id: z.number(), isFavorite: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const { id, isFavorite } = input;
      return ctx.prisma.chapter.update({
        where: { id },
        data: { isFavorite },
      });
    }),
  toggleMangaFavorite: t.procedure
    .input(z.object({ id: z.number(), isFavorite: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const { id, isFavorite } = input;
      return ctx.prisma.manga.update({
        where: { id },
        data: { isFavorite },
      });
    }),
  toggleChapterRead: t.procedure
    .input(z.object({ id: z.number(), isRead: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const { id, isRead } = input;
      return ctx.prisma.chapter.update({
        where: { id },
        data: {
          isRead,
          lastReadAt: isRead ? new Date() : null,
        },
      });
    }),
  toggleMangaRead: t.procedure
    .input(z.object({ id: z.number(), isRead: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const { id, isRead } = input;
      return ctx.prisma.chapter.updateMany({
        where: { mangaId: id },
        data: {
          isRead,
          lastReadAt: isRead ? new Date() : null,
        },
      });
    }),
  search: t.procedure
    .input(
      z.object({
        keyword: z.string().trim().min(1),
        source: z.union([z.string().trim().min(1), z.array(z.string().trim().min(1))]),
      }),
    )
    .query(async ({ input }) => {
      const { keyword, source } = input;
      const { result } = await search(source, keyword);
      return result
        .map((m) => ({
          status: m.mangal?.metadata?.status,
          title: m.mangal?.name,
          source: m.source,
          chapters: m.mangal?.metadata?.chapters || m.mangal?.chapters?.length || 0,
          cover:
            m.mangal.metadata.cover?.extraLarge || m.mangal.metadata.cover?.large || m.mangal.metadata.cover?.medium,
        }))
        .filter((m) => !!m.title);
    }),
  remove: t.procedure
    .input(
      z.object({
        id: z.number(),
        shouldRemoveFiles: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { id, shouldRemoveFiles } = input;
      await downloadWorker.pause(true);
      const removed = await ctx.prisma.manga.delete({
        include: {
          library: true,
          chapters: true,
        },
        where: {
          id,
        },
      });
      await ctx.prisma.metadata.delete({
        where: {
          id: removed.metadataId,
        },
      });
      await removeJob(removed.title);
      await removeDownloadJobs(removed);
      if (shouldRemoveFiles === true) {
        const mangaPath = path.resolve(removed.library.path, sanitizer(removed.title));
        await removeManga(mangaPath);
        await scanLibrary();
      }
      downloadWorker.resume();
    }),
  add: t.procedure
    .input(
      z.object({
        source: z.union([
          z.string().trim().min(1),
          z
            .array(
              z.object({
                source: z.string().trim().min(1),
                title: z.string().trim().min(1),
              }),
            )
            .min(1),
        ]),
        title: z.string().trim().min(1),
        interval: z
          .string()
          .trim()
          .min(1)
          .refine((value) => isCronValid(value), {
            message: 'Invalid interval',
          }),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { source, title, interval } = input;
      const actualSources = Array.isArray(source) ? source : [{ source, title }];
      const uniqueSources = actualSources.filter((v, i, a) => a.findIndex((t) => t.source === v.source) === i);
      const primarySource = uniqueSources[0]!;

      const mangaDetail = await getMangaDetail(primarySource.source, primarySource.title);
      const library = await ctx.prisma.library.findFirst();
      if (!mangaDetail || !library) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Cannot find the ${title}.`,
        });
      }
      const result = await ctx.prisma.manga.findFirst({
        where: {
          title,
        },
      });
      if (result) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `${title} already exists in the library.`,
        });
      }

      if (mangaDetail.name !== title && mangaDetail.name !== primarySource.title) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `${title} does not match the found manga.`,
        });
      }

      const manga = await ctx.prisma.manga.create({
        include: {
          library: true,
          metadata: true,
          sources: true,
        },
        data: {
          source: primarySource.source,
          title: mangaDetail.name,
          library: {
            connect: {
              id: library.id,
            },
          },
          interval,
          sources: {
            create: uniqueSources.map((s, idx) => ({
              source: s.source,
              title: s.title,
              priority: idx,
            })),
          },
          metadata: {
            create: {
              cover:
                mangaDetail.metadata.cover?.extraLarge ||
                mangaDetail.metadata.cover?.large ||
                mangaDetail.metadata.cover?.medium,
              authors: mangaDetail.metadata.staff?.story ? [...mangaDetail.metadata.staff.story] : [],
              characters: mangaDetail.metadata.characters ? [...mangaDetail.metadata.characters] : [],
              genres: mangaDetail.metadata.genres ? [...mangaDetail.metadata.genres] : [],
              startDate: mangaDetail.metadata.startDate
                ? new Date(
                    mangaDetail.metadata.startDate.year,
                    mangaDetail.metadata.startDate.month,
                    mangaDetail.metadata.startDate.day,
                  )
                : undefined,
              endDate: mangaDetail.metadata.endDate
                ? new Date(
                    mangaDetail.metadata.endDate.year,
                    mangaDetail.metadata.endDate.month,
                    mangaDetail.metadata.endDate.day,
                  )
                : undefined,
              status: mangaDetail.metadata.status,
              summary: mangaDetail.metadata.summary,
              synonyms: mangaDetail.metadata.synonyms ? [...mangaDetail.metadata.synonyms] : [],
              tags: mangaDetail.metadata.tags ? [...mangaDetail.metadata.tags] : [],
              urls: mangaDetail.metadata.urls ? [...mangaDetail.metadata.urls] : [],
            },
          },
        },
      });

      schedule(manga, true);

      return manga;
    }),
  update: t.procedure
    .input(
      z.object({
        id: z.number(),
        interval: z
          .string()
          .trim()
          .min(1)
          .refine((value) => isCronValid(value), {
            message: 'Invalid interval',
          }),
        anilistId: z.string().nullish(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { id, interval, anilistId } = input;
      const mangaInDb = await ctx.prisma.manga.findUniqueOrThrow({
        include: {
          library: true,
        },
        where: { id },
      });

      if (anilistId) {
        await bindTitleToAnilistId(mangaInDb.title, anilistId);
        await scheduleUpdateMetadata(mangaInDb.library.path, mangaInDb.title);
      }

      const mangaDetail = await getMangaDetail(mangaInDb.source, mangaInDb.title);
      if (!mangaDetail) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Cannot find the metadata for ${mangaInDb.title}.`,
        });
      }

      await ctx.prisma.metadata.update({
        where: {
          id: mangaInDb.metadataId,
        },
        data: {
          cover:
            mangaDetail.metadata.cover?.extraLarge ||
            mangaDetail.metadata.cover?.large ||
            mangaDetail.metadata.cover?.medium,
          authors: mangaDetail.metadata.staff?.story ? [...mangaDetail.metadata.staff.story] : [],
          characters: mangaDetail.metadata.characters,
          genres: mangaDetail.metadata.genres,
          startDate: mangaDetail.metadata.startDate
            ? new Date(
                mangaDetail.metadata.startDate.year,
                mangaDetail.metadata.startDate.month,
                mangaDetail.metadata.startDate.day,
              )
            : undefined,
          endDate: mangaDetail.metadata.endDate
            ? new Date(
                mangaDetail.metadata.endDate.year,
                mangaDetail.metadata.endDate.month,
                mangaDetail.metadata.endDate.day,
              )
            : undefined,
          status: mangaDetail.metadata.status,
          summary: mangaDetail.metadata.summary,
          synonyms: mangaDetail.metadata.synonyms,
          tags: mangaDetail.metadata.tags,
          urls: mangaDetail.metadata.urls,
        },
      });

      if (interval !== mangaInDb.interval) {
        const updatedManga = await ctx.prisma.manga.update({
          include: { library: true, metadata: true, sources: true },
          where: { id },
          data: {
            interval,
          },
        });
        await schedule(updatedManga, false);
      }

      return ctx.prisma.manga.findUniqueOrThrow({
        include: { metadata: true, library: true, sources: true },
        where: { id },
      });
    }),
  history: t.procedure.query(async ({ ctx }) => {
    return ctx.prisma.chapter.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
      include: {
        manga: {
          select: {
            title: true,
            metadata: {
              select: {
                cover: true,
              },
            },
          },
        },
      },
    });
  }),
  activityHistory: t.procedure.query(async ({ ctx }) => {
    // Get chapter counts grouped by day for the last 14 days
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const chapters = await ctx.prisma.chapter.findMany({
      where: {
        createdAt: {
          gte: fourteenDaysAgo,
        },
      },
      select: {
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Group by date string (YYYY-MM-DD)
    const grouped: Record<string, number> = {};
    chapters.forEach((chapter) => {
      const dateKey = chapter.createdAt.toISOString().split('T')[0];
      grouped[dateKey] = (grouped[dateKey] || 0) + 1;
    });

    // Fill in missing days with 0
    const result = [];
    for (let i = 13; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const key = date.toISOString().split('T')[0];
      result.push({
        date: key,
        // Short label like "Apr 30"
        label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        count: grouped[key] || 0,
      });
    }

    return result;
  }),
  activity: t.procedure.query(async ({ ctx }) => {
    const outOfSyncCount = await ctx.prisma.manga.count({
      where: {
        outOfSyncChapters: {
          some: {},
        },
      },
    });
    return {
      active: await downloadQueue.getActiveCount(),
      queued: await downloadQueue.getWaitingCount(),
      scheduled: await checkChaptersQueue.getDelayedCount(),
      failed: await downloadQueue.getFailedCount(),
      completed: await downloadQueue.getCompletedCount(),
      outOfSync: outOfSyncCount,
    };
  }),
  refreshMetaData: t.procedure
    .input(
      z.object({
        id: z.number(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { id } = input;
      const mangaInDb = await ctx.prisma.manga.findUniqueOrThrow({
        include: { library: true, metadata: true, sources: true },
        where: { id },
      });
      const metadata = await getMangaMetadata(mangaInDb.source, mangaInDb.title);
      if (!metadata) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Cannot find the metadata for ${mangaInDb.title}.`,
        });
      }
      await ctx.prisma.metadata.update({
        where: {
          id: mangaInDb.metadataId,
        },
        data: {
          cover: metadata.cover?.extraLarge || metadata.cover?.large || metadata.cover?.medium,
          authors: metadata.staff?.story ? [...metadata.staff.story] : [],
          characters: metadata.characters,
          genres: metadata.genres,
          startDate: metadata.startDate
            ? new Date(metadata.startDate.year, metadata.startDate.month, metadata.startDate.day)
            : undefined,
          endDate: metadata.endDate
            ? new Date(metadata.endDate.year, metadata.endDate.month, metadata.endDate.day)
            : undefined,
          status: metadata.status,
          summary: metadata.summary,
          synonyms: metadata.synonyms,
          tags: metadata.tags,
          urls: metadata.urls,
        },
      });
      await scheduleUpdateMetadata(mangaInDb.library.path, mangaInDb.title);

      return ctx.prisma.manga.findUniqueOrThrow({ include: { metadata: true, library: true }, where: { id } });
    }),
  refreshAllMetadata: t.procedure.mutation(async ({ ctx }) => {
    // Find all manga with missing cover or summary
    const allManga = await ctx.prisma.manga.findMany({
      include: { metadata: true, library: true, sources: true },
    });

    const needsRefresh = allManga.filter((m) => !m.metadata?.cover || !m.metadata?.summary);

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const manga of needsRefresh) {
      try {
        const metadata = await getMangaMetadata(manga.source, manga.title);
        if (!metadata) {
          skipped += 1;
          continue;
        }
        await ctx.prisma.metadata.update({
          where: { id: manga.metadataId },
          data: {
            cover:
              metadata.cover?.extraLarge || metadata.cover?.large || metadata.cover?.medium || manga.metadata?.cover,
            authors: metadata.staff?.story ? [...metadata.staff.story] : undefined,
            genres: metadata.genres || undefined,
            status: metadata.status || undefined,
            summary: metadata.summary || undefined,
            tags: metadata.tags || undefined,
            urls: metadata.urls || undefined,
          },
        });
        updated += 1;
        // Small delay to prevent rate-limiting/heavy load during bulk process
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (err) {
        logger.error(`refreshAllMetadata: failed for ${manga.title}: ${err}`);
        errors.push(manga.title);
      }
    }

    logger.info(`refreshAllMetadata: ${updated} updated, ${skipped} skipped, ${errors.length} errors`);
    return { total: needsRefresh.length, updated, skipped, errors };
  }),
  updateManualMetadata: t.procedure
    .input(
      z.object({
        id: z.number(),
        cover: z.string().optional(),
        summary: z.string().optional(),
        status: z.string().optional(),
        genres: z.array(z.string()).optional(),
        authors: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { id, cover, summary, status, genres, authors } = input;
      const mangaInDb = await ctx.prisma.manga.findUniqueOrThrow({
        where: { id },
        include: { library: true },
      });
      await ctx.prisma.metadata.update({
        where: { id: mangaInDb.metadataId },
        data: {
          cover: cover !== undefined ? cover : undefined,
          summary: summary !== undefined ? summary : undefined,
          status: status !== undefined ? status : undefined,
          genres: genres !== undefined ? genres : undefined,
          authors: authors !== undefined ? authors : undefined,
        },
      });

      if (cover) {
        try {
          const mangaDir = getMangaPath(mangaInDb.library.path, mangaInDb.title);
          await fs.promises.mkdir(mangaDir, { recursive: true });

          if (cover.startsWith('data:image/')) {
            const parts = cover.split(',');
            if (parts.length >= 2) {
              const buffer = Buffer.from(parts[1], 'base64');
              await fs.promises.writeFile(path.join(mangaDir, 'cover.jpg'), buffer);
              logger.info(`updateManualMetadata: saved uploaded base64 cover.jpg locally for ${mangaInDb.title}`);
            }
          } else if (cover.startsWith('http')) {
            const coverRes = await fetch(cover);
            if (coverRes.ok) {
              const buffer = Buffer.from(await coverRes.arrayBuffer());
              await fs.promises.writeFile(path.join(mangaDir, 'cover.jpg'), buffer);
              logger.info(`updateManualMetadata: saved cover.jpg locally for ${mangaInDb.title}`);
            }
          }
        } catch (err) {
          logger.error(`updateManualMetadata: failed to save cover image locally for ${mangaInDb.title}: ${err}`);
        }
      }

      // Notify Komga / Kavita integrations asynchronously
      refreshKavita(mangaInDb.title).catch((err) =>
        logger.error(`updateManualMetadata: refreshKavita failed for ${mangaInDb.title}: ${err}`),
      );
      refreshKomga(mangaInDb.title).catch((err) =>
        logger.error(`updateManualMetadata: refreshKomga failed for ${mangaInDb.title}: ${err}`),
      );

      return ctx.prisma.manga.findUniqueOrThrow({ include: { metadata: true, library: true }, where: { id } });
    }),
  checkOutOfSyncChapters: t.procedure

    .input(
      z.object({
        id: z.number().nullish(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const inProgressCount = (
        await Promise.all([
          checkOutOfSyncChaptersQueue.getActiveCount(),
          checkOutOfSyncChaptersQueue.getWaitingCount(),
          fixOutOfSyncChaptersQueue.getActiveCount(),
          fixOutOfSyncChaptersQueue.getWaitingCount(),
        ])
      ).reduce((acc, curr) => acc + curr, 0);
      if (inProgressCount > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'There is another active job running. Please wait until it finishes',
        });
      }
      const { id } = input;
      await clearCache();
      if (id) {
        await checkOutOfSyncChaptersQueue.add(nanoid(), { mangaId: id });
      } else {
        const allMangas = await ctx.prisma.manga.findMany({ select: { id: true } });
        await checkOutOfSyncChaptersQueue.addBulk(
          allMangas.map((m) => ({
            opts: {
              jobId: nanoid(),
            },
            data: { mangaId: m.id },
            name: nanoid(),
          })),
        );
      }
    }),
  fixOutOfSyncChapters: t.procedure
    .input(
      z.object({
        id: z.number().nullish(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const inProgressCount = (
        await Promise.all([
          checkOutOfSyncChaptersQueue.getActiveCount(),
          checkOutOfSyncChaptersQueue.getWaitingCount(),
          fixOutOfSyncChaptersQueue.getActiveCount(),
          fixOutOfSyncChaptersQueue.getWaitingCount(),
        ])
      ).reduce((acc, curr) => acc + curr, 0);
      if (inProgressCount > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'There is another active job running. Please wait until it finishes',
        });
      }
      const { id } = input;
      if (id) {
        await fixOutOfSyncChaptersQueue.add(nanoid(), { mangaId: id });
      } else {
        const allMangas = await ctx.prisma.manga.findMany({ select: { id: true } });
        await fixOutOfSyncChaptersQueue.addBulk(
          allMangas.map((m) => ({
            opts: {
              jobId: nanoid(),
            },
            data: { mangaId: m.id },
            name: nanoid(),
          })),
        );
      }
    }),
  getSources: t.procedure
    .input(
      z.object({
        id: z.number(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { id } = input;
      return ctx.prisma.mangaSource.findMany({
        where: { mangaId: id },
        orderBy: { priority: 'asc' },
      });
    }),
  addSource: t.procedure
    .input(
      z.object({
        mangaId: z.number(),
        source: z.string().trim().min(1),
        title: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { mangaId, source, title } = input;
      logger.info(`Adding source ${source} to manga ${mangaId} with title ${title}`);

      try {
        const mangaDetail = await getMangaDetail(source, title);
        if (!mangaDetail) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Cannot find the ${title} on ${source}.`,
          });
        }

        const existingSource = await ctx.prisma.mangaSource.findUnique({
          where: {
            mangaId_source: {
              mangaId: Number(mangaId),
              source,
            },
          },
        });

        if (existingSource) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Source ${source} already exists for this manga.`,
          });
        }

        const lastSource = await ctx.prisma.mangaSource.findFirst({
          where: { mangaId: Number(mangaId) },
          orderBy: { priority: 'desc' },
        });

        const newSource = await ctx.prisma.mangaSource.create({
          data: {
            mangaId: Number(mangaId),
            source,
            title,
            priority: lastSource ? lastSource.priority + 1 : 0,
          },
        });

        logger.info(`Successfully added source ${source} to manga ${mangaId}`);
        return newSource;
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown database error';
        logger.error(`CRITICAL ERROR in addSource: ${errorMessage}`);
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: errorMessage,
        });
      }
    }),
  removeSource: t.procedure
    .input(
      z.object({
        id: z.number(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { id } = input;
      const sourceToRemove = await ctx.prisma.mangaSource.findUniqueOrThrow({
        where: { id },
      });
      const deleted = await ctx.prisma.mangaSource.delete({
        where: { id },
      });

      // Purge orphaned failed download jobs pointing to this deleted source
      const failedJobs = await downloadQueue.getFailed();
      for (const j of failedJobs) {
        if (j.data?.mangaId === sourceToRemove.mangaId && j.data?.source === sourceToRemove.source) {
          await j.remove();
        }
      }

      return deleted;
    }),
  updateSourcePriority: t.procedure
    .input(
      z.object({
        mangaId: z.number(),
        sourcePriorities: z.array(
          z.object({
            id: z.number(),
            priority: z.number(),
          }),
        ),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { sourcePriorities } = input;
      return ctx.prisma.$transaction(
        sourcePriorities.map((sp) =>
          ctx.prisma.mangaSource.update({
            where: { id: sp.id },
            data: { priority: sp.priority },
          }),
        ),
      );
    }),
  updateInterval: t.procedure
    .input(
      z.object({
        id: z.number(),
        interval: z
          .string()
          .trim()
          .min(1)
          .refine((value) => isCronValid(value), {
            message: 'Invalid interval',
          }),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { id, interval } = input;
      const updatedManga = await ctx.prisma.manga.update({
        include: { library: true, metadata: true, sources: true },
        where: { id },
        data: {
          interval,
        },
      });
      await schedule(updatedManga, false);
      return updatedManga;
    }),
  getStaggerProgress: t.procedure.query(() => {
    return staggerProgress;
  }),
  autoStaggerAll: t.procedure
    .input(
      z.object({
        startHour: z.number().min(0).max(23),
        endHour: z.number().min(0).max(23),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { startHour, endHour } = input;
      if (startHour >= endHour) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'End hour must be greater than start hour',
        });
      }

      const mangas = await ctx.prisma.manga.findMany({
        where: {
          interval: {
            not: 'never',
          },
          isLocked: false,
        },
      });

      let count = 0;
      staggerProgress = { title: '', current: 0, total: mangas.length };

      // eslint-disable-next-line no-restricted-syntax
      for (const m of mangas) {
        staggerProgress.title = m.title;
        const interval = m.interval.trim();
        const isDailyCron = /^\d+ \d+ \* \* \*$/.test(interval);
        if (isDailyCron || interval === '0 * * * *') {
          const randomMinute = Math.floor(Math.random() * 60);
          const range = endHour - startHour + 1;
          const randomHour = startHour + Math.floor(Math.random() * range);
          const newInterval = `${randomMinute} ${randomHour} * * *`;

          // eslint-disable-next-line no-await-in-loop
          const updatedManga = await ctx.prisma.manga.update({
            include: { library: true, metadata: true, sources: true },
            where: { id: m.id },
            data: { interval: newInterval },
          });
          // eslint-disable-next-line no-await-in-loop
          await schedule(updatedManga, false);
          count += 1;
        }
        staggerProgress.current += 1;
      }

      staggerProgress = { title: '', current: 0, total: 0 };

      return { count };
    }),
  retryAllFailedJobs: t.procedure
    .input(z.object({ source: z.string().nullish() }).optional())
    .mutation(async ({ input, ctx }) => {
      const source = input?.source;
      const failed = await downloadQueue.getFailed();

      let jobsToRetry = failed;
      if (source && source !== 'Unknown') {
        const mangaIds = [...new Set(failed.map((j) => (j.data as any).mangaId))];
        const mangas = await ctx.prisma.manga.findMany({
          where: { id: { in: mangaIds } },
          select: { id: true, source: true },
        });
        const mangaMap = new Map(mangas.map((m) => [m.id, m.source]));

        jobsToRetry = failed.filter((j) => {
          const jobSource = (j.data as any).source || mangaMap.get((j.data as any).mangaId) || 'Unknown';
          return jobSource === source;
        });
      }

      // Read delay from settings — prevents rate-limiting when retrying many jobs
      const settings = await ctx.prisma.settings.findFirst();
      const delayMs = settings?.retryDelayMs ?? 2000;

      // Sequential retry with configurable delay between each job
      for (let i = 0; i < jobsToRetry.length; i++) {
        await jobsToRetry[i]!.retry();
        if (i < jobsToRetry.length - 1) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      return { success: true, retriedCount: jobsToRetry.length };
    }),
  retryJob: t.procedure.input(z.object({ jobId: z.string() })).mutation(async ({ input }) => {
    const { jobId } = input;
    const job = await downloadQueue.getJob(jobId);
    if (!job) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Job ${jobId} not found`,
      });
    }
    await job.retry();
    return { success: true };
  }),
  failureStatsBySource: t.procedure.query(async ({ ctx }) => {
    const failed = await downloadQueue.getFailed();
    const sourceCounts = new Map<string, number>();

    const jobsWithoutSource = failed.filter((job) => {
      const { data } = job;
      return !data.source;
    });
    const mangaIdsToFetch = [
      ...new Set(
        jobsWithoutSource.map((job) => {
          const { data } = job;
          return data.mangaId;
        }),
      ),
    ];

    let mangaMap = new Map();
    if (mangaIdsToFetch.length > 0) {
      const mangas = await ctx.prisma.manga.findMany({
        where: { id: { in: mangaIdsToFetch } },
        select: { id: true, source: true },
      });
      mangaMap = new Map(
        mangas.map((m) => {
          const { id, source } = m;
          return [id, source];
        }),
      );
    }

    failed.forEach((job) => {
      const { data } = job;
      let { source } = data;
      if (!source || source === 'Unknown') {
        source = mangaMap.get(data.mangaId) || 'Unknown';
      }
      const currentCount = sourceCounts.get(source) || 0;
      sourceCounts.set(source, currentCount + 1);
    });

    return Array.from(sourceCounts.entries()).map(([source, count]) => ({
      source,
      count,
    }));
  }),
  failedJobs: t.procedure.query(async ({ ctx }) => {
    const failed = await downloadQueue.getFailed();
    const jobsData = failed.map((job) => {
      const { data } = job;
      return {
        id: job.id,
        mangaId: data.mangaId,
        chapterIndex: data.chapterIndex,
        source: data.source || 'Unknown',
        failedReason: job.failedReason,
        timestamp: job.timestamp,
      };
    });

    const mangaIds = [...new Set(jobsData.map((job) => job.mangaId))];
    const mangas = await ctx.prisma.manga.findMany({
      where: { id: { in: mangaIds } },
      select: { id: true, title: true, source: true, sources: { orderBy: { priority: 'asc' } } },
    });

    const mangaMap = new Map(
      mangas.map((m) => {
        const { id } = m;
        return [id, m];
      }),
    );

    return jobsData.map((job) => {
      const manga = mangaMap.get(job.mangaId);
      return {
        ...job,
        mangaTitle: manga?.title || 'Unknown Manga',
        source: job.source === 'Unknown' ? manga?.source || 'Unknown' : job.source,
        configuredSources: manga?.sources?.map((s) => s.source) || [],
      };
    });
  }),
  downloadQueue: t.procedure.query(async ({ ctx }) => {
    const [active, waiting, recentCompleted, recentFailed] = await Promise.all([
      downloadQueue.getActive(),
      downloadQueue.getWaiting(),
      downloadQueue.getCompleted(0, 19),
      downloadQueue.getFailed(0, 9),
    ]);

    const allJobs = [
      ...active.map((j) => ({ ...j, status: 'active' as const })),
      ...waiting.map((j) => ({ ...j, status: 'waiting' as const })),
      ...recentCompleted.map((j) => ({ ...j, status: 'completed' as const })),
      ...recentFailed.map((j) => ({ ...j, status: 'failed' as const })),
    ];

    const mangaIds = [...new Set(allJobs.map((j) => (j.data as any).mangaId).filter(Boolean))];
    const mangas = await ctx.prisma.manga.findMany({
      where: { id: { in: mangaIds } },
      select: { id: true, title: true, source: true },
    });
    const mangaMap = new Map(mangas.map((m) => [m.id, m]));

    return allJobs.map((j) => {
      const manga = mangaMap.get((j.data as any).mangaId);
      return {
        id: j.id ?? '',
        mangaId: (j.data as any).mangaId as number,
        mangaTitle: manga?.title ?? 'Unknown Manga',
        source: (j.data as any).source || manga?.source || 'Unknown',
        chapterIndex: (j.data as any).chapterIndex as number,
        status: j.status,
        progress: typeof j.progress === 'number' ? j.progress : 0,
        failedReason: (j as any).failedReason ?? null,
        timestamp: j.timestamp,
        processedOn: j.processedOn,
      };
    });
  }),
  cleanQueue: t.procedure.mutation(async () => {
    await Promise.all([
      downloadQueue.clean(0, 0, 'completed'),
      downloadQueue.clean(0, 0, 'failed'),
      checkChaptersQueue.clean(0, 0, 'completed'),
      checkChaptersQueue.clean(0, 0, 'failed'),
    ]);
    return { success: true };
  }),
  deleteChapter: t.procedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
    const chapter = await ctx.prisma.chapter.findUnique({
      where: { id: input.id },
      include: { manga: { include: { library: true } } },
    });

    if (!chapter) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Chapter not found',
      });
    }

    // 1. Delete physical file
    try {
      const libraryPath = chapter.manga.library.path;
      const { fileName } = chapter;
      const filePath = path.join(libraryPath, sanitizer(chapter.manga.title), fileName);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.info(`Deleted physical file for chapter ${chapter.index}: ${filePath}`);
      }
    } catch (err) {
      logger.error(`Failed to delete physical file for chapter ${chapter.id}: ${err}`);
    }

    // 2. Delete from DB
    await ctx.prisma.chapter.delete({
      where: { id: input.id },
    });

    return { success: true };
  }),
  cleanupDuplicates: t.procedure.mutation(async ({ ctx }) => {
    logger.info('Starting manual duplicate chapter cleanup...');
    const mangas = await ctx.prisma.manga.findMany({
      include: { chapters: true },
    });

    let totalDeleted = 0;
    for (const manga of mangas) {
      const chapterMap = new Map<string, number[]>();
      for (const chapter of manga.chapters) {
        // Use mangaId + fileName + index as key for absolute duplication
        const key = `${manga.id}-${chapter.fileName}-${chapter.index}`;
        if (!chapterMap.has(key)) {
          chapterMap.set(key, []);
        }
        chapterMap.get(key)!.push(chapter.id);
      }

      const toDelete: number[] = [];
      for (const ids of chapterMap.values()) {
        if (ids.length > 1) {
          // Keep the first one, delete the rest
          toDelete.push(...ids.slice(1));
        }
      }

      if (toDelete.length > 0) {
        await ctx.prisma.chapter.deleteMany({
          where: { id: { in: toDelete } },
        });
        totalDeleted += toDelete.length;
      }
    }
    logger.info(`Cleanup complete. Deleted ${totalDeleted} duplicate chapters.`);
    return { deleted: totalDeleted };
  }),
  bulkUpdateIntervalByStatus: t.procedure
    .input(
      z.object({
        status: z.string().trim().min(1),
        interval: z
          .string()
          .trim()
          .min(1)
          .refine((value) => isCronValid(value), {
            message: 'Invalid interval',
          }),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { status, interval } = input;
      const targetMangas = await ctx.prisma.manga.findMany({
        where: {
          isLocked: false,
          metadata: {
            status: {
              equals: status,
              mode: 'insensitive',
            },
          },
        },
        include: { library: true, metadata: true, sources: true },
      });

      let updatedCount = 0;
      for (const m of targetMangas) {
        if (m.interval !== interval) {
          const updatedManga = await ctx.prisma.manga.update({
            where: { id: m.id },
            data: { interval },
            include: { library: true, metadata: true, sources: true },
          });
          await schedule(updatedManga, false);
          updatedCount += 1;
        }
      }

      logger.info(
        `bulkUpdateIntervalByStatus: updated ${updatedCount} unlocked manga with status ${status} to interval ${interval}`,
      );
      return { count: updatedCount };
    }),
  bulkLockByStatus: t.procedure
    .input(
      z.object({
        status: z.string().trim().min(1),
        isLocked: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { status, isLocked } = input;
      const targetMangas = await ctx.prisma.manga.findMany({
        where: {
          metadata: {
            status: {
              equals: status,
              mode: 'insensitive',
            },
          },
        },
        select: { id: true },
      });

      const res = await ctx.prisma.manga.updateMany({
        where: {
          id: { in: targetMangas.map((m) => m.id) },
        },
        data: { isLocked },
      });

      logger.info(`bulkLockByStatus: set isLocked=${isLocked} for ${res.count} manga with status ${status}`);
      return { count: res.count };
    }),
  toggleLock: t.procedure
    .input(z.object({ id: z.number(), isLocked: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const { id, isLocked } = input;
      return ctx.prisma.manga.update({
        where: { id },
        data: { isLocked },
      });
    }),
  downloadChapterFromAlternativeSource: t.procedure
    .input(
      z.object({
        jobId: z.string(),
        mangaId: z.number(),
        chapterIndex: z.number(),
        newSource: z.string().trim().min(1),
        newSourceTitle: z.string().trim().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { jobId, mangaId, chapterIndex, newSource, newSourceTitle } = input;
      const manga = await ctx.prisma.manga.findUniqueOrThrow({
        where: { id: mangaId },
        include: { sources: true, metadata: true },
      });

      const settings = await ctx.prisma.settings.findFirst();
      const strategy = settings?.alternativeSourceMatching ?? 'exact';

      let actualTitle = newSourceTitle || manga.title;
      if (!newSourceTitle && strategy === 'fuzzy') {
        try {
          // 1. Try primary title
          const { result } = await search(newSource, manga.title);
          let bestMatch = result.find((r) => !!r.mangal?.name);

          // 2. Fallback to synonyms if no match found
          if (!bestMatch && manga.metadata?.synonyms && manga.metadata.synonyms.length > 0) {
            logger.info(`Primary title search failed for ${newSource}. Trying synonyms for ${manga.title}...`);
            for (const synonym of manga.metadata.synonyms) {
              const { result: synResult } = await search(newSource, synonym);
              bestMatch = synResult.find((r) => !!r.mangal?.name);
              if (bestMatch) {
                logger.info(`Found match using synonym: ${synonym}`);
                break;
              }
            }
          }

          if (bestMatch?.mangal?.name) {
            actualTitle = bestMatch.mangal.name;
          }
        } catch (err) {
          logger.error(`Fuzzy search fallback failed for source ${newSource}: ${err}`);
        }
      }

      // Ensure source exists in MangaSource mapping table
      const existingMangaSource = manga.sources.find((s) => s.source === newSource);
      if (!existingMangaSource) {
        const lastSource = manga.sources.sort((a, b) => b.priority - a.priority)[0];
        await ctx.prisma.mangaSource.create({
          data: {
            mangaId,
            source: newSource,
            title: actualTitle,
            priority: lastSource ? lastSource.priority + 1 : 0,
          },
        });
      }

      // Remove the specific failed download job
      const job = await downloadQueue.getJob(jobId);
      if (job) {
        await job.remove();
      } else {
        const failedJobs = await downloadQueue.getFailed();
        const found = failedJobs.find((j) => j.data?.mangaId === mangaId && j.data?.chapterIndex === chapterIndex);
        if (found) {
          await found.remove();
        }
      }

      // Enqueue fresh chapter download configured targeting the alternative source
      const optsJobId = `${sanitizer(manga.title)}_${chapterIndex}_download`;
      await downloadQueue.add(
        `${sanitizer(manga.title)}_chapter#${chapterIndex}_download`,
        {
          mangaId,
          chapterIndex,
          source: newSource,
          sourceTitle: actualTitle,
        },
        {
          jobId: optsJobId,
        },
      );

      return { success: true, actualTitle };
    }),
  switchMangaPrimarySource: t.procedure
    .input(
      z.object({
        mangaId: z.number(),
        newSource: z.string().trim().min(1),
        newSourceTitle: z.string().trim().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { mangaId, newSource, newSourceTitle } = input;
      const manga = await ctx.prisma.manga.findUniqueOrThrow({
        where: { id: mangaId },
        include: { sources: true, metadata: true },
      });

      const settings = await ctx.prisma.settings.findFirst();
      const strategy = settings?.alternativeSourceMatching ?? 'exact';

      let actualTitle = newSourceTitle || manga.title;
      if (!newSourceTitle && strategy === 'fuzzy') {
        try {
          // 1. Try primary title
          const { result } = await search(newSource, manga.title);
          let bestMatch = result.find((r) => !!r.mangal?.name);

          // 2. Fallback to synonyms if no match found
          if (!bestMatch && manga.metadata?.synonyms && manga.metadata.synonyms.length > 0) {
            logger.info(
              `Primary title search failed during switch to ${newSource}. Trying synonyms for ${manga.title}...`,
            );
            for (const synonym of manga.metadata.synonyms) {
              const { result: synResult } = await search(newSource, synonym);
              bestMatch = synResult.find((r) => !!r.mangal?.name);
              if (bestMatch) {
                logger.info(`Found switch match using synonym: ${synonym}`);
                break;
              }
            }
          }

          if (bestMatch?.mangal?.name) {
            actualTitle = bestMatch.mangal.name;
          }
        } catch (err) {
          logger.error(`Fuzzy search fallback failed for source switching targeting ${newSource}: ${err}`);
        }
      }

      // Update parent manga string directly
      await ctx.prisma.manga.update({
        where: { id: mangaId },
        data: { source: newSource },
      });

      // Rearrange priorities in MangaSource mapping table so the newSource takes priority 0
      const otherSources = manga.sources.filter((s) => s.source !== newSource);
      await ctx.prisma.$transaction([
        // Upsert newSource row as priority 0
        ctx.prisma.mangaSource.upsert({
          where: { mangaId_source: { mangaId, source: newSource } },
          update: { priority: 0, title: actualTitle },
          create: { mangaId, source: newSource, title: actualTitle, priority: 0 },
        }),
        // Shift remaining sources down by 1
        ...otherSources.map((s, idx) =>
          ctx.prisma.mangaSource.update({
            where: { id: s.id },
            data: { priority: idx + 1 },
          }),
        ),
      ]);

      // Purge all outstanding failed download jobs for this manga to reset error state cleanly
      const failedJobs = await downloadQueue.getFailed();
      for (const j of failedJobs) {
        if (j.data?.mangaId === mangaId) {
          await j.remove();
        }
      }

      // Immediately schedule check/download from the new parent source
      const updatedManga = await ctx.prisma.manga.findUniqueOrThrow({
        where: { id: mangaId },
        include: { sources: true, library: true },
      });
      schedule(updatedManga, true);

      return { success: true, actualTitle };
    }),
  triggerStatusAudit: t.procedure.mutation(async () => {
    await triggerStatusAuditNow();
    return { success: true };
  }),
  bulkUpdateInterval: t.procedure
    .input(z.object({ ids: z.array(z.number()), interval: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prisma.manga.updateMany({
        where: { id: { in: input.ids } },
        data: { interval: input.interval },
      });
      return { success: true, count: result.count };
    }),
  sourceStats: t.procedure.query(async ({ ctx }) => {
    const mangaCounts = await ctx.prisma.manga.groupBy({
      by: ['source'],
      _count: {
        id: true,
      },
    });

    const chapters = await ctx.prisma.chapter.findMany({
      select: {
        size: true,
        manga: {
          select: {
            source: true,
          },
        },
      },
    });

    const sourceSizes: Record<string, number> = {};
    for (const ch of chapters) {
      const src = ch.manga.source;
      sourceSizes[src] = (sourceSizes[src] || 0) + ch.size;
    }

    return mangaCounts.map((mc) => {
      return {
        source: mc.source,
        mangaCount: mc._count.id,
        totalSize: sourceSizes[mc.source] || 0,
      };
    });
  }),
});
