import { Job, Queue, Worker } from 'bullmq';
import { prisma } from '../db/client';
import { logger } from '../../utils/logging';
import { getCachedSettings } from '../utils/settings-cache';
import { getNotificationI18n, DigestData, buildDigestMessage } from '../utils/notifications/i18n';
import { dispatchNotification } from '../utils/notifications';

export const DIGEST_QUEUE_NAME = 'notificationDigestQueue';

export const notificationDigestQueue = new Queue(DIGEST_QUEUE_NAME, {
  connection: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: 100,
  },
});

/**
 * Consolidate and send pending digest notifications
 */
export async function processNotificationDigest(): Promise<{ sent: boolean; count: number }> {
  try {
    const pendingItems = await prisma.notificationDigestItem.findMany({
      where: { sent: false },
      orderBy: { createdAt: 'asc' },
    });

    if (pendingItems.length === 0) {
      return { sent: false, count: 0 };
    }

    const settings = await getCachedSettings().catch(() => null);
    const serverLang = (settings as any)?.serverLanguage || 'es';

    // Group items by category
    const failures = pendingItems.filter((i) => i.event === 'CHAPTER_DOWNLOAD_FAILED');
    const downloads = pendingItems.filter((i) => i.event === 'FAVORITE_CHAPTER_DOWNLOADED');

    // Group failures by mangaTitle + source
    const failuresByManga: Record<string, { manga: string; chapters: number[]; source: string; errors: string[] }> = {};
    for (const item of failures) {
      const manga = item.mangaTitle || 'Desconocido';
      const key = `${manga}|${item.source || 'Desconocido'}`;
      if (!failuresByManga[key]) {
        failuresByManga[key] = { manga, chapters: [], source: item.source || 'fuente', errors: [] };
      }
      if (item.chapterIndex !== null && item.chapterIndex !== undefined) {
        failuresByManga[key].chapters.push(item.chapterIndex + 1);
      }
      if (item.errorText && !failuresByManga[key].errors.includes(item.errorText.slice(0, 50))) {
        failuresByManga[key].errors.push(item.errorText.slice(0, 50));
      }
    }

    // Group downloads by mangaTitle
    const downloadsByManga: Record<string, { manga: string; chapters: number[] }> = {};
    for (const item of downloads) {
      const manga = item.mangaTitle || 'Manga';
      if (!downloadsByManga[manga]) downloadsByManga[manga] = { manga, chapters: [] };
      if (item.chapterIndex !== null && item.chapterIndex !== undefined) {
        downloadsByManga[manga].chapters.push(item.chapterIndex + 1);
      }
    }

    const digestData: DigestData = {
      failuresByManga,
      downloadsByManga,
      totalCount: pendingItems.length,
    };

    const serverUrl =
      (settings as any)?.serverBaseUrl ||
      process.env.APP_URL ||
      process.env.KAIZEN_URL ||
      process.env.NEXTAUTH_URL ||
      null;

    const initialMessage = buildDigestMessage(digestData, serverLang, serverUrl);

    // Dispatch the digest alert as DOWNLOAD_DIGEST
    await dispatchNotification('DOWNLOAD_DIGEST', {
      title: initialMessage.title,
      body: initialMessage.body,
      url: serverUrl ? serverUrl.trim().replace(/\/+$/, '') : undefined,
      severity: failures.length > 0 ? 'warn' : 'info',
      digestData,
    });

    // Mark as sent
    const ids = pendingItems.map((i) => i.id);
    await prisma.notificationDigestItem.updateMany({
      where: { id: { in: ids } },
      data: { sent: true },
    });

    logger.info(`[Notification Digest] Dispatched digest summary for ${pendingItems.length} items.`);
    return { sent: true, count: pendingItems.length };
  } catch (err: any) {
    logger.error(`[Notification Digest] Failed to process digest: ${err?.message || err}`);
    return { sent: false, count: 0 };
  }
}

export const notificationDigestWorker = new Worker(
  DIGEST_QUEUE_NAME,
  async (job: Job) => {
    logger.info(`[Notification Digest Worker] Running digest job ${job.id}`);
    await processNotificationDigest();
  },
  {
    connection: {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    },
    concurrency: 1,
  },
);

/**
 * Schedule or re-schedule the digest queue based on settings
 */
export async function scheduleNotificationDigest(overrideMode?: string, overrideHour?: number): Promise<void> {
  try {
    const settings = await getCachedSettings().catch(() => null);
    const mode = overrideMode || (settings as any)?.notificationDigestMode || 'HOURLY';
    const hour = overrideHour !== undefined ? overrideHour : (settings as any)?.notificationDigestHour ?? 20;

    // Clear existing repeatable jobs
    const repeatableJobs = await notificationDigestQueue.getRepeatableJobs();
    await Promise.all(repeatableJobs.map((j) => notificationDigestQueue.removeRepeatableByKey(j.key)));
    await notificationDigestQueue.drain();

    if (mode === 'IMMEDIATE') {
      logger.info('[Notification Digest] Digest set to IMMEDIATE mode (no scheduled cron).');
      return;
    }

    let cronPattern = '0 * * * *'; // Default HOURLY
    if (mode === 'EVERY_6_HOURS') {
      cronPattern = '0 */6 * * *';
    } else if (mode === 'DAILY') {
      cronPattern = `0 ${Math.max(0, Math.min(23, hour))} * * *`;
    }

    const jobId = `notification_digest_${mode}`;
    await notificationDigestQueue.add(
      'run_digest',
      {},
      {
        jobId,
        repeatJobKey: jobId,
        repeat: { pattern: cronPattern },
      },
    );

    logger.info(`[Notification Digest] Scheduled digest with pattern "${cronPattern}" (mode: ${mode})`);
  } catch (err: any) {
    logger.error(`[Notification Digest] Failed to schedule digest: ${err?.message || err}`);
  }
}

/**
 * Buffer a single notification item into NotificationDigestItem table
 */
export async function bufferDigestItem(item: {
  event: string;
  mangaId?: number;
  mangaTitle?: string;
  chapterIndex?: number;
  source?: string;
  errorText?: string;
  severity?: string;
  targetUserId?: number;
}): Promise<void> {
  try {
    await prisma.notificationDigestItem.create({
      data: {
        event: item.event,
        mangaId: item.mangaId,
        mangaTitle: item.mangaTitle,
        chapterIndex: item.chapterIndex,
        source: item.source,
        errorText: item.errorText,
        severity: item.severity || 'info',
        targetUserId: item.targetUserId,
        sent: false,
      },
    });
  } catch (err) {
    logger.warn(`[Notification Digest] Failed to buffer item: ${err}`);
  }
}
