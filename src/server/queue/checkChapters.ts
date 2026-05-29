import { Library, Manga, MangaSource, Prisma } from '@prisma/client';
import { Job, Queue, Worker } from 'bullmq';
import fs from 'fs/promises';
import path from 'path';
import { sanitizer } from '../../utils';
import { logger } from '../../utils/logging';
import { prisma } from '../db/client';
import { findMissingChapterFiles, getChaptersFromLocal, getChaptersFromRemote } from '../utils/mangal';
import { downloadQueue } from './download';

const mangaWithLibraryAndMetadata = Prisma.validator<Prisma.MangaArgs>()({
  include: { library: true, metadata: true, sources: true },
});

export type MangaWithLibraryAndMetadata = Prisma.MangaGetPayload<typeof mangaWithLibraryAndMetadata>;

export interface MinimalMangaForSync {
  id: number;
  title: string;
  library: {
    path: string;
  };
}

const mangaForCheck = Prisma.validator<Prisma.MangaArgs>()({
  include: { library: true, sources: true },
});
export type MangaForCheck = Prisma.MangaGetPayload<typeof mangaForCheck>;

export const syncDbWithFiles = async (manga: MinimalMangaForSync) => {
  const mangaDir = path.resolve(manga.library.path, sanitizer(manga.title));

  const localChapters = await getChaptersFromLocal(mangaDir);
  const dbChapters = await prisma.chapter.findMany({
    where: {
      mangaId: manga.id,
    },
  });

  const localChaptersSet = new Set(localChapters.map((c) => `${c.fileName}-${c.index}`));
  const dbOnlyChapters = dbChapters.filter(
    (dbChapter) => !localChaptersSet.has(`${dbChapter.fileName}-${dbChapter.index}`),
  );

  const dbChaptersSet = new Set(dbChapters.map((c) => `${c.fileName}-${c.index}`));
  const missingDbChapters = localChapters.filter(
    (localChapter) => !dbChaptersSet.has(`${localChapter.fileName}-${localChapter.index}`),
  );

  await prisma.$transaction([
    ...dbOnlyChapters.map((chapter) =>
      prisma.chapter.delete({
        where: {
          id: chapter.id,
        },
      }),
    ),
    prisma.chapter.createMany({
      data: missingDbChapters.map((chapter) => ({
        ...chapter,
        mangaId: manga.id,
      })),
      skipDuplicates: true,
    }),
  ]);
};

const checkChapters = async (manga: MangaForCheck) => {
  logger.info(`Checking for new chapters: ${manga.title}`);
  const mangaDir = path.resolve(manga.library.path, sanitizer(manga.title));

  // Determine sources to check: use the new 'sources' table or fallback to the legacy fields
  let sourcesToCheck =
    manga.sources.length > 0
      ? manga.sources.sort((a, b) => a.priority - b.priority)
      : [{ source: manga.source, title: manga.title }];

  // 1. Auto-swap sources if any alternative source has more chapters
  if (sourcesToCheck.length > 1) {
    let bestSource = sourcesToCheck[0];
    let maxChaptersCount = 0;

    for (const s of sourcesToCheck) {
      try {
        const chapters = await getChaptersFromRemote(s.source, s.title);
        if (chapters.length > maxChaptersCount) {
          maxChaptersCount = chapters.length;
          bestSource = s;
        }
      } catch (err) {
        logger.error(`Failed to fetch chapters from remote source ${s.source} for ${manga.title}. err: ${err}`);
      }
    }

    if (bestSource && bestSource.source !== manga.source) {
      logger.info(
        `[AUTO-SWAP] Promoting source ${bestSource.source} (${maxChaptersCount} chapters) over ${manga.source} as primary for manga ${manga.title}`,
      );

      await prisma.manga.update({
        where: { id: manga.id },
        data: { source: bestSource.source },
      });

      const dbSources = await prisma.mangaSource.findMany({
        where: { mangaId: manga.id },
      });

      await prisma.$transaction(
        dbSources.map((ds) => {
          const priority = ds.source === bestSource.source ? 0 : 1;
          return prisma.mangaSource.update({
            where: { id: ds.id },
            data: { priority },
          });
        }),
      );

      // Update local variables and sort sourcesToCheck again
      manga.source = bestSource.source;
      if (manga.sources) {
        manga.sources = manga.sources.map((s) => ({
          ...s,
          priority: s.source === bestSource.source ? 0 : 1,
        }));
        sourcesToCheck = manga.sources.sort((a, b) => a.priority - b.priority);
      } else {
        sourcesToCheck = [{ source: bestSource.source, title: manga.title }];
      }
    }
  }

  await syncDbWithFiles(manga);

  // Check chapter threshold for planned mangas
  if (manga.minChaptersForDownload > 0) {
    try {
      const primarySource = sourcesToCheck[0];
      const remoteChapters = await getChaptersFromRemote(primarySource.source, primarySource.title);
      await prisma.manga.update({
        where: { id: manga.id },
        data: { remoteChaptersCount: remoteChapters.length },
      });
      if (remoteChapters.length < manga.minChaptersForDownload) {
        logger.info(
          `[SKIP-DOWNLOAD] ${manga.title} has ${remoteChapters.length} remote chapters. Threshold is ${manga.minChaptersForDownload}. Skipping.`,
        );
        return;
      }
    } catch (err) {
      logger.error(`Failed to verify chapter threshold for ${manga.title}. err: ${err}`);
    }
  }

  // Get local chapters to see what's missing
  await fs.mkdir(mangaDir, { recursive: true });
  const localChapters = (await fs.readdir(mangaDir)).filter((f: string) => path.extname(f) === '.cbz');
  const localChapterIndexList = localChapters
    .map((f: string) => {
      const indexRegexp = /.*?\[(\d+)\].*/;
      const match = indexRegexp.exec(f);
      return match ? parseInt(match[1]!, 10) - 1 : null;
    })
    .filter((i: number | null): i is number => i !== null);

  // Map of chapterIndex -> { source, sourceTitle }
  // Since sourcesToCheck is sorted by priority (lowest first),
  // the first source that has a chapter will be preserved in the map if we iterate backwards,
  // or we can iterate forwards and only set if not present.
  const missingChaptersMap = new Map<number, { source: string; title: string }>();

  // Iterate sources in REVERSE priority so higher priority sources overwrite lower ones in the map
  const reversedSources = [...sourcesToCheck].reverse();
  for (const s of reversedSources) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const missingInThisSource = await findMissingChapterFiles(mangaDir, s.source, s.title);
      for (const chapterIndex of missingInThisSource) {
        missingChaptersMap.set(chapterIndex, { source: s.source, title: s.title });
      }
    } catch (err) {
      logger.error(`Failed to check chapters for ${manga.title} on source ${s.source}. err: ${err}`);
    }
  }

  const missingIndices = Array.from(missingChaptersMap.keys());

  if (missingIndices.length === 0) {
    logger.info(`There are no missing chapter files for ${manga.title}`);
    return;
  }

  logger.info(`There are ${missingIndices.length} new chapters for ${manga.title}`);

  await Promise.all(
    missingIndices.map(async (chapterIndex) => {
      const job = await downloadQueue.getJob(`${sanitizer(manga.title)}_${chapterIndex}_download`);
      if (job) {
        await job.remove();
      }
    }),
  );

  await downloadQueue.addBulk(
    missingIndices.map((chapterIndex) => {
      const sourceInfo = missingChaptersMap.get(chapterIndex)!;
      return {
        opts: {
          jobId: `${sanitizer(manga.title)}_${chapterIndex}_download`,
        },
        name: `${sanitizer(manga.title)}_chapter#${chapterIndex}_download`,
        data: {
          mangaId: manga.id,
          chapterIndex,
          source: sourceInfo.source,
          sourceTitle: sourceInfo.title,
        },
      };
    }),
  );
};

export const checkChaptersQueue = new Queue('checkChaptersQueue', {
  connection: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
});

export const checkChaptersWorker = new Worker(
  'checkChaptersQueue',
  async (job: Job) => {
    const { mangaId } = job.data;
    const mangaInDb = await prisma.manga.findUniqueOrThrow({
      include: { library: true, sources: true },
      where: { id: mangaId },
    });
    await checkChapters(mangaInDb as MangaForCheck);
    await job.updateProgress(100);
  },
  {
    concurrency: 5,
    connection: {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    },
  },
);

export const getJobIdFromTitle = (title: string) => `check_${sanitizer(title)}_chapters`;

export const removeJob = async (title: string) => {
  const jobId = getJobIdFromTitle(title);

  // Remove repeatable jobs
  const repeatableJobs = await checkChaptersQueue.getRepeatableJobs();
  const repeatableJob = repeatableJobs.find((j) => j.id === jobId || j.key.includes(jobId));
  if (repeatableJob) {
    await checkChaptersQueue.removeRepeatableByKey(repeatableJob.key);
  }

  // Also check for any orphaned delayed jobs
  const jobs = await checkChaptersQueue.getJobs(['delayed', 'waiting', 'active']);
  await Promise.all(
    jobs
      .filter((job) => job.opts.repeat?.jobId === jobId || job.id === jobId)
      .map(async (job) => {
        if (job.id) {
          return checkChaptersQueue.remove(job.id);
        }
        return null;
      }),
  );
};

export const schedule = async (
  manga: Pick<Manga, 'id' | 'title' | 'interval' | 'source'> & { library?: { path: string }; sources?: MangaSource[] },
  runImmediately: boolean,
) => {
  await removeJob(manga.title);

  if (runImmediately === true) {
    await checkChapters(manga as MangaForCheck);
  }

  if (manga.interval === 'never') {
    return;
  }
  const jobId = getJobIdFromTitle(manga.title);

  await checkChaptersQueue.add(
    jobId,
    {
      mangaId: manga.id,
    },
    {
      jobId,
      repeatJobKey: jobId,
      repeat: {
        pattern: manga.interval,
      },
    },
  );
};

export const scheduleAll = async () => {
  // 1. Clear all existing repeatable jobs in one go
  const repeatableJobs = await checkChaptersQueue.getRepeatableJobs();
  await Promise.all(repeatableJobs.map((job) => checkChaptersQueue.removeRepeatableByKey(job.key)));

  // 2. Clear any other jobs in the queue
  await checkChaptersQueue.drain();

  const mangaList = await prisma.manga.findMany({
    select: {
      id: true,
      title: true,
      interval: true,
    },
  });

  // 3. Re-schedule everything
  await Promise.all(
    mangaList.map(async (manga) => {
      if (manga.interval === 'never') {
        return;
      }
      const jobId = getJobIdFromTitle(manga.title);
      await checkChaptersQueue.add(
        jobId,
        { mangaId: manga.id },
        {
          jobId,
          repeatJobKey: jobId,
          repeat: { pattern: manga.interval },
        },
      );
    }),
  );
};
