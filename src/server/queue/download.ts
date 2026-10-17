import { Prisma } from '@prisma/client';
import { Job, Queue, Worker } from 'bullmq';
import { sanitizer } from '../../utils';
import { logger } from '../../utils/logging';
import { prisma } from '../db/client';
import { downloadChapter, getChapterFromLocal, getChaptersFromRemote } from '../utils/mangal';
import { integrationQueue } from './integration';
import { notificationQueue } from './notify';
import { dispatchNotification } from '../utils/notifications';

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

      // Post-Download Integrity Check Guard
      const { validateCbzIntegrity } = await import('../utils/chapterIntegrity');
      const integrityCheck = await validateCbzIntegrity(filePath);
      if (!integrityCheck.isValid) {
        const fs = await import('fs');
        await fs.promises.unlink(filePath).catch(() => {});
        logger.error(
          `[CORRUPT DOWNLOAD] Downloaded chapter file for "${mangaInDb.title}" failed integrity verification (${integrityCheck.reason}). Unlinked corrupt file at ${filePath}`,
        );
        throw new Error(
          `Downloaded chapter archive failed integrity check: ${integrityCheck.reason}. The corrupt file was discarded.`,
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
        const matchingRequests = await prisma.mangaRequest.findMany({
          where: {
            title: {
              equals: mangaInDb.title,
              mode: 'insensitive',
            },
            status: 'APPROVED',
          },
        });

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

        // Notify each user whose requested manga is now available
        for (const req of matchingRequests) {
          if (req.userId) {
            dispatchNotification(
              'MANGA_REQUEST_AVAILABLE',
              {
                title: `Manga Solicitado Disponible: ${mangaInDb.title}`,
                body: `¡El manga "${mangaInDb.title}" que solicitaste ya está descargado y disponible para leer en tu biblioteca!`,
                mangaId: mangaInDb.id,
                mangaTitle: mangaInDb.title,
                severity: 'success',
              },
              req.userId,
            ).catch((err) => logger.error(`Failed to dispatch request notification: ${err}`));
          }
        }
      } catch (e) {
        logger.error(`Failed to update MangaRequest statuses on download: ${e}`);
      }

      // Handle favorite chapter notifications (buffered in digest or immediate)
      try {
        const { bufferDigestItem } = await import('./digest');
        const { getCachedSettings } = await import('../utils/settings-cache');
        const settings = await getCachedSettings().catch(() => null);
        const digestMode = (settings as any)?.notificationDigestMode || 'HOURLY';

        if (digestMode !== 'IMMEDIATE') {
          await bufferDigestItem({
            event: 'FAVORITE_CHAPTER_DOWNLOADED',
            mangaId: mangaInDb.id,
            mangaTitle: mangaInDb.title,
            chapterIndex: Number(sanitizedChapterIndex),
            source: finalSource,
            severity: 'info',
          });
        } else {
          dispatchNotification('FAVORITE_CHAPTER_DOWNLOADED', {
            title: `Nuevo Capítulo: ${mangaInDb.title}`,
            body: `Se ha descargado el capítulo #${Number(sanitizedChapterIndex) + 1} de "${mangaInDb.title}" desde ${finalSource}.`,
            mangaId: mangaInDb.id,
            mangaTitle: mangaInDb.title,
            chapterIndex: Number(sanitizedChapterIndex),
            source: finalSource,
            severity: 'info',
          }).catch((err) => logger.error(`Failed to dispatch favorite notification: ${err}`));
        }
      } catch (notifyErr) {
        logger.error(`Failed to handle favorite notification: ${notifyErr}`);
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
    } catch (err: any) {
      await job.log(`${err}`);

      // Route failure to digest buffer or immediate dispatch
      try {
        const { bufferDigestItem } = await import('./digest');
        const { getCachedSettings } = await import('../utils/settings-cache');
        const settings = await getCachedSettings().catch(() => null);
        const digestMode = (settings as any)?.notificationDigestMode || 'HOURLY';

        if (digestMode !== 'IMMEDIATE') {
          await bufferDigestItem({
            event: 'CHAPTER_DOWNLOAD_FAILED',
            mangaId,
            mangaTitle: sourceTitle || `Manga #${mangaId}`,
            chapterIndex: Number(chapterIndex),
            source,
            errorText: err?.message || String(err),
            severity: 'error',
          });
        } else {
          dispatchNotification('CHAPTER_DOWNLOAD_FAILED', {
            title: `Fallo de Descarga: ${sourceTitle || `Manga #${mangaId}`}`,
            body: `Error al descargar el capítulo #${Number(chapterIndex) + 1} desde la fuente "${source || 'primaria'}": ${err?.message || err}`,
            mangaId,
            mangaTitle: sourceTitle,
            chapterIndex: Number(chapterIndex),
            source,
            errorText: err?.message || String(err),
            severity: 'error',
          }).catch((notifyErr) => logger.error(`Failed to dispatch download failure notification: ${notifyErr}`));
        }
      } catch (failureErr) {
        logger.error(`Failed to buffer/dispatch download failure alert: ${failureErr}`);
      }

      throw err;
    }
  },
  {
    concurrency: 5,
    lockDuration: 1000 * 60 * 10,
    lockRenewTime: 1000 * 15,
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
