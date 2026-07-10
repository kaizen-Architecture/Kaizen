import { Job, Queue, Worker } from 'bullmq';
import { prisma } from '../db/client';
import { logger } from '../../utils/logging';
import { checkMangaStatusLightweight } from '../utils/lightweight-status';
import { syncAllSources } from '../utils/sources';

export const refreshMangaStatusWorker = new Worker(
  'refreshMangaStatusQueue',
  async (job: Job) => {
    logger.info('[Status Audit] Beginning background automated manga publishing status audit loop...');
    try {
      // Sincronizar y reactivar fuentes antes de auditar los estados de los mangas
      try {
        await syncAllSources();
      } catch (syncErr) {
        logger.error(`[Status Audit] Falló la sincronización automática de fuentes en el bucle: ${syncErr}`);
      }

      const settings = await prisma.settings.findFirstOrThrow();
      const providers = (settings as any).metadataProviders || ['anilist', 'mangadex'];

      // Find all manga and filter in memory to avoid strict Prisma relation typing errors
      const allMangas = await prisma.manga.findMany({
        include: { metadata: true },
      });

      const activeMangas = (allMangas as any[]).filter((m) => {
        const st = m.metadata?.status?.toUpperCase() || '';
        return !['COMPLETED', 'FINISHED', 'CANCELLED'].includes(st);
      });

      logger.info(
        `[Status Audit] Found ${activeMangas.length} ongoing/unknown series to audit using providers: ${providers.join(
          ' -> ',
        )}`,
      );

      let updatedCount = 0;
      for (const manga of activeMangas) {
        const mItem = manga as any;
        if (!mItem.metadata) continue;

        const currentStatus = mItem.metadata.status?.toUpperCase() || '';
        const newStatus = await checkMangaStatusLightweight(mItem.title, providers);

        if (
          newStatus &&
          newStatus !== currentStatus &&
          ['FINISHED', 'COMPLETED', 'CANCELLED', 'HIATUS'].includes(newStatus)
        ) {
          logger.info(
            `[Status Audit] Series "${mItem.title}" changed status from "${currentStatus}" to "${newStatus}"! Updating metadata...`,
          );
          await prisma.metadata.update({
            where: { id: mItem.metadata.id },
            data: { status: newStatus },
          });
          updatedCount++;
        }
      }

      logger.info(`[Status Audit] Background audit complete. Successfully updated ${updatedCount} series.`);
      await job.updateProgress(100);
      return { updatedCount, totalAudited: activeMangas.length };
    } catch (err) {
      logger.error(`[Status Audit] Error executing automated status loop: ${err}`);
      throw err;
    }
  },
  {
    connection: {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    },
    concurrency: 1,
  },
);

export const refreshMangaStatusQueue = new Queue('refreshMangaStatusQueue', {
  connection: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  defaultJobOptions: {
    removeOnComplete: true,
    attempts: 3,
    backoff: {
      type: 'fixed',
      delay: 1000 * 60,
    },
  },
});

export const scheduleMangaStatusRefresh = async () => {
  try {
    // 1. Remove existing repeatable jobs
    const repeatableJobs = await refreshMangaStatusQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      await refreshMangaStatusQueue.removeRepeatableByKey(job.key);
    }

    const settings = await prisma.settings.findFirst();
    if (!settings) return;

    const interval = (settings as any).refreshStatusInterval || 'weekly';
    const window = (settings as any).refreshStatusWindow || 'night';

    if (interval === 'never') {
      logger.info('[Status Audit] Scheduled status audit is configured to "never". Background loop disabled.');
      return;
    }

    // Determine hour based on window preference
    const hour = window === 'day' ? '12' : '3'; // Day: 12 PM, Night: 3 AM

    let cronPattern = `0 ${hour} * * 0`; // weekly default
    if (interval === 'daily') {
      cronPattern = `0 ${hour} * * *`;
    } else if (interval === 'monthly') {
      cronPattern = `0 ${hour} 1 * *`;
    }

    logger.info(
      `[Status Audit] Scheduling automated background maintenance loop with pattern "${cronPattern}" (${interval} at ${window} window)`,
    );
    await refreshMangaStatusQueue.add(
      'refreshMangaStatusCron',
      {},
      {
        repeatJobKey: 'refreshMangaStatusCron',
        repeat: {
          pattern: cronPattern,
        },
      },
    );
  } catch (err) {
    logger.error(`[Status Audit] Failed to register recurring schedule: ${err}`);
  }
};

export const triggerStatusAuditNow = async () => {
  await refreshMangaStatusQueue.add('manualTrigger', {});
};
