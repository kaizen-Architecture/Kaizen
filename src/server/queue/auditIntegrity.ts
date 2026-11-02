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
  mangaId?: number;
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
    const { mangaId } = (job.data as IAuditMangaJobData) || {};

    // If no mangaId is specified, this is a global library audit request: enqueue each manga sequentially
    if (!mangaId) {
      job.log('Starting global library integrity audit for all manga...');
      logger.info('[Integrity Audit] Global library audit triggered. Enqueuing all manga series...');
      const mangas = await prisma.manga.findMany({ select: { id: true, title: true } });
      for (const m of mangas) {
        await auditIntegrityQueue.add(`audit-${m.id}`, { mangaId: m.id });
      }
      job.log(`Enqueued ${mangas.length} series for integrity audit.`);
      return { totalQueued: mangas.length };
    }

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

    let mangaDir = path.join(manga.library.path, sanitizer(manga.title));
    if (!fs.existsSync(mangaDir)) {
      const rawDir = path.join(manga.library.path, manga.title);
      if (fs.existsSync(rawDir)) {
        mangaDir = rawDir;
      } else {
        job.log(`Manga directory not found on disk at "${mangaDir}". Skipping audit to prevent accidental purge.`);
        logger.warn(
          `[Integrity Audit] Manga directory not found at "${mangaDir}". Aborting audit for "${manga.title}" to protect database.`
        );
        return { audited: 0, purged: 0 };
      }
    }
    const totalChapters = manga.chapters.length;
    let auditedCount = 0;
    const purgedChapterIds: number[] = [];

    // Collision avoidance: yield if downloads are actively running
    const { downloadQueue } = await import('./download');

    for (const ch of manga.chapters) {
      // 1. Check for active downloads and yield to avoid CPU/disk contention
      let activeDownloads = await downloadQueue.getActiveCount();
      while (activeDownloads > 0) {
        job.log(`Active downloads detected (${activeDownloads}). Pausing integrity audit for 5s...`);
        await new Promise((res) => setTimeout(res, 5000));
        activeDownloads = await downloadQueue.getActiveCount();
      }

      auditedCount++;
      const progress = Math.floor((auditedCount / (totalChapters || 1)) * 100);
      await job.updateProgress(progress);

      if (ch.fileName) {
        const filePath = path.join(mangaDir, ch.fileName);
        if (!fs.existsSync(filePath)) {
          // File missing from local worker disk: DO NOT purge database record!
          continue;
        }
        const check = await validateCbzIntegrity(filePath);

        if (!check.isValid) {
          logger.warn(
            `[Integrity Audit] Corrupt chapter #${ch.index} (${ch.fileName}) flagged for "${manga.title}": ${check.reason}`
          );
          purgedChapterIds.push(ch.id);
          await fs.promises.unlink(filePath).catch(() => {});
        }
      }

      // 2. CPU throttle: small 25ms delay between chapters to keep CPU spikes near zero
      await new Promise((res) => setTimeout(res, 25));
    }

    if (purgedChapterIds.length > 0) {
      await prisma.chapter.deleteMany({
        where: { id: { in: purgedChapterIds } },
      });

      // Trigger download queue to re-fetch purged chapters
      await checkChaptersQueue.add(nanoid(), { mangaId: manga.id });
      logger.info(
        `[Integrity Audit] Purged ${purgedChapterIds.length} corrupt chapters for "${manga.title}" and queued automatic re-download.`
      );
    }

    await job.updateProgress(100);
    return { audited: auditedCount, purged: purgedChapterIds.length };
  },
  {
    concurrency: 1, // Single concurrency ensures strictly bounded CPU footprint
    lockDuration: 1000 * 60 * 15,
    lockRenewTime: 1000 * 30,
    connection: {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    },
  }
);

/**
 * Registers the recurring schedule for chapter integrity audits based on admin settings.
 */
export const scheduleAuditIntegrity = async () => {
  try {
    // 1. Remove existing repeatable jobs
    const repeatableJobs = await auditIntegrityQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      await auditIntegrityQueue.removeRepeatableByKey(job.key);
    }

    const settings = await prisma.settings.findFirst();
    if (!settings) return;

    const interval = (settings as any).auditIntegrityInterval || 'weekly';
    const hour = typeof (settings as any).auditIntegrityHour === 'number' ? (settings as any).auditIntegrityHour : 14;

    if (interval === 'never') {
      logger.info('[Integrity Audit] Scheduled integrity audit is configured to "never". Background loop disabled.');
      return;
    }

    let cronPattern = `0 ${hour} * * 0`;
    if (interval === 'daily') {
      cronPattern = `0 ${hour} * * *`;
    } else if (interval === 'monthly') {
      cronPattern = `0 ${hour} 1 * *`;
    }

    logger.info(
      `[Integrity Audit] Scheduling automated background chapter integrity audit with pattern "${cronPattern}" (${interval} at ${hour}:00)`
    );

    await auditIntegrityQueue.add(
      'auditIntegrityCron',
      {},
      {
        repeatJobKey: 'auditIntegrityCron',
        repeat: {
          pattern: cronPattern,
        },
      }
    );
  } catch (err) {
    logger.error(`[Integrity Audit] Failed to register recurring integrity audit schedule: ${err}`);
  }
};

/**
 * Triggers an immediate global library integrity audit.
 */
export const triggerGlobalIntegrityAudit = async () => {
  await auditIntegrityQueue.add('globalLibraryAudit', {});
};
