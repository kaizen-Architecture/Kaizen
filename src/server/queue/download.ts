import { Prisma } from '@prisma/client';
import { Job, Queue, Worker } from 'bullmq';
import { sanitizer } from '../../utils';
import { logger } from '../../utils/logging';
import { prisma } from '../db/client';
import { downloadChapter, getChapterFromLocal, getChaptersFromRemote } from '../utils/mangal';
import { integrationQueue } from './integration';
import { notificationQueue } from './notify';

const mangaWithChaptersAndLibrary = Prisma.validator<Prisma.MangaArgs>()({
  include: { chapters: true, library: true },
});

type MangaWithChaptersAndLibrary = Prisma.MangaGetPayload<typeof mangaWithChaptersAndLibrary>;
export interface IDownloadWorkerData {
  mangaId: number;
  chapterIndex: number;
  source?: string;
  sourceTitle?: string;
}

export const downloadWorker = new Worker(
  'downloadQueue',
  async (job: Job) => {
    const { chapterIndex, mangaId, source, sourceTitle }: IDownloadWorkerData = job.data;
    let filePath;
    try {
      await job.updateProgress(10);
      const mangaInDb = await prisma.manga.findUnique({
        where: { id: mangaId },
        include: { library: true, metadata: true, sources: true },
      });
      if (!mangaInDb) {
        job.log(`Manga with id ${mangaId} is removed from db.`);
        return;
      }

      // Use the source provided in the job data, or fallback to the primary source
      const finalSource = source || mangaInDb.source;
      const finalTitle = sourceTitle || mangaInDb.title;

      const sanitizedChapterIndex = String(chapterIndex).replace('@', '');

      // Check if the source actually has this chapter index before attempting download
      try {
        const remoteChapters = await getChaptersFromRemote(finalSource, finalTitle);
        if (remoteChapters.length > 0) {
          const indexNum = Number(sanitizedChapterIndex);
          if (indexNum >= remoteChapters.length) {
            logger.warn(
              `[SKIP] Source ${finalSource} only has ${remoteChapters.length} chapters. Skipping download of chapter index ${indexNum} for "${mangaInDb.title}" as it exceeds available chapters.`,
            );
            await job.log(
              `Skipped download: chapter index ${indexNum} is not available on source ${finalSource} (total chapters: ${remoteChapters.length})`,
            );
            await job.updateProgress(100);
            return;
          }
        }
      } catch (err) {
        logger.error(
          `Failed to pre-check chapter availability on source ${finalSource} for "${mangaInDb.title}". err: ${err}`,
        );
      }

      filePath = await downloadChapter(
        mangaInDb.title,
        finalSource,
        sanitizedChapterIndex,
        mangaInDb.library.path,
        finalTitle,
      );

      let chapter;
      try {
        chapter = await getChapterFromLocal(filePath);
      } catch (err) {
        logger.error(`Error processing downloaded file at ${filePath}: ${err}`);
        throw new Error(
          `The download finished but the resulting file could not be processed. This often happens if the file is empty or corrupted. (Path: ${filePath})`,
        );
      }

      // Cleanup existing records by index OR fileName to prevent unique constraint violations
      // We do this before upsert to be extra safe about index-only changes
      await prisma.chapter.deleteMany({
        where: {
          mangaId: mangaInDb.id,
          OR: [{ index: Number(sanitizedChapterIndex) }, { fileName: chapter.fileName }],
        },
      });

      const chapterInDb = await prisma.chapter.upsert({
        where: {
          mangaId_fileName: {
            mangaId: mangaInDb.id,
            fileName: chapter.fileName,
          },
        },
        update: {
          ...chapter,
        },
        create: {
          ...chapter,
          mangaId: mangaInDb.id,
        },
      });

      try {
        await prisma.mangaRequest.updateMany({
          where: {
            title: {
              equals: mangaInDb.title,
              mode: 'insensitive',
            },
            status: 'APPROVED',
          },
          data: {
            status: 'AVAILABLE',
          },
        });
      } catch (e) {
        logger.error(`Failed to update MangaRequest statuses on download: ${e}`);
      }

      await notificationQueue.add(`notify_${sanitizer(mangaInDb.title)}_${chapterInDb.id}`, {
        chapterIndex,
        chapterFileName: chapter.fileName,
        mangaTitle: mangaInDb.title,
        source: finalSource,
        url: mangaInDb.metadata.urls.find((url) => url.includes('anilist')),
      });
      await integrationQueue.add('run_integrations', null, { jobId: 'run_integrations' });
      await job.updateProgress(100);
    } catch (err) {
      await job.log(`${err}`);
      throw err;
    }
  },
  {
    concurrency: 5,
    connection: {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    },
  },
);

export const downloadQueue = new Queue('downloadQueue', {
  connection: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  defaultJobOptions: {
    attempts: 20,
    backoff: {
      type: 'fixed',
      delay: 1000 * 60 * 2,
    },
  },
});

export const removeDownloadJobs = async (manga: MangaWithChaptersAndLibrary) => {
  await Promise.all(
    manga.chapters.map(async (chapter) => {
      const jobId = `${sanitizer(manga.title)}_${chapter.index}_download`;
      try {
        const job = await downloadQueue.getJob(jobId);
        if (job) {
          await job.remove();
        }
      } catch (err) {
        logger.error(`job could not be cancelled. err: ${err}`);
      }
    }),
  );
};
