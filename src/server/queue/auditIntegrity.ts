import { Job, Queue, Worker } from 'bullmq';
import fs from 'fs';
import path from 'path';
import { sanitizer } from '../../utils';
import { logger } from '../../utils/logging';
import { prisma } from '../db/client';
import { validateCbzIntegrity } from '../utils/chapterIntegrity';
import { checkChaptersQueue } from './checkChapters';
import { nanoid } from 'nanoid';

export interface IAuditMangaJobData {
  mangaId: number;
}

export const auditIntegrityQueue = new Queue('auditIntegrityQueue', {
  connection: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: 100,
  },
});

export const auditIntegrityWorker = new Worker(
  'auditIntegrityQueue',
  async (job: Job) => {
    const { mangaId } = job.data as IAuditMangaJobData;
    job.log(`Starting integrity audit for manga ID: ${mangaId}`);

    const manga = await prisma.manga.findUnique({
      where: { id: mangaId },
      include: {
        library: true,
        chapters: true,
      },
    });

    if (!manga) {
      job.log(`Manga ${mangaId} not found in database, skipping audit.`);
      return;
    }

    const mangaDir = path.join(manga.library.path, sanitizer(manga.title));
    const totalChapters = manga.chapters.length;
    let auditedCount = 0;
    const purgedChapterIds: number[] = [];

    for (const ch of manga.chapters) {
      auditedCount++;
      const progress = Math.floor((auditedCount / (totalChapters || 1)) * 100);
      await job.updateProgress(progress);

      if (ch.fileName) {
        const filePath = path.join(mangaDir, ch.fileName);
        const check = await validateCbzIntegrity(filePath);

        if (!check.isValid) {
          logger.warn(
            `Background integrity audit flagged corrupt chapter #${ch.index} (${ch.fileName}) for ${manga.title}: ${check.reason}`
          );
          purgedChapterIds.push(ch.id);
          await fs.promises.unlink(filePath).catch(() => {});
        }
      }
    }

    if (purgedChapterIds.length > 0) {
      await prisma.chapter.deleteMany({
        where: { id: { in: purgedChapterIds } },
      });

      // Trigger download queue to re-fetch missing chapters
      await checkChaptersQueue.add(nanoid(), { mangaId: manga.id });
      logger.info(
        `Purged ${purgedChapterIds.length} corrupt chapters for ${manga.title} and queued automatic re-download.`
      );
    }

    await job.updateProgress(100);
  },
  {
    concurrency: 2, // Low concurrency keeps CPU load minimal during ZIP parsing
    connection: {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    },
  }
);
