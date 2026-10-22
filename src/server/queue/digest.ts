import { Job, Queue, Worker } from 'bullmq';
import { prisma } from '../db/client';
import { logger } from '../../utils/logging';
import { getCachedSettings } from '../utils/settings-cache';
import { getNotificationI18n } from '../utils/notifications/i18n';
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
 * Format an array of chapter indexes into concise ranges (e.g. "1-5, 8, 10-12")
 */
function formatChapterRanges(chapters: number[], chapterWord = 'Cap.'): string {
  if (chapters.length === 0) return '';
  const sorted = [...new Set(chapters)].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i <= sorted.length; i++) {
    if (i < sorted.length && sorted[i] === prev + 1) {
      prev = sorted[i];
    } else {
      if (start === prev) {
        ranges.push(`${chapterWord} ${start}`);
      } else {
        ranges.push(`${chapterWord} ${start}-${prev}`);
      }
      if (i < sorted.length) {
        start = sorted[i];
        prev = sorted[i];
      }
    }
  }

  return ranges.join(', ');
}

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
    const i18n = getNotificationI18n(serverLang);

    // Group items by category
    const failures = pendingItems.filter((i) => i.event === 'CHAPTER_DOWNLOAD_FAILED');
    const downloads = pendingItems.filter((i) => i.event === 'FAVORITE_CHAPTER_DOWNLOADED');

    // Group failures by mangaTitle + source
    const failuresByManga: Record<string, { chapters: number[]; source: string; errors: Set<string> }> = {};
    for (const item of failures) {
      const key = `${item.mangaTitle || 'Desconocido'}|${item.source || 'Desconocido'}`;
      if (!failuresByManga[key]) {
        failuresByManga[key] = { chapters: [], source: item.source || 'fuente', errors: new Set() };
      }
      if (item.chapterIndex !== null && item.chapterIndex !== undefined) {
        failuresByManga[key].chapters.push(item.chapterIndex + 1);
      }
      if (item.errorText) {
        failuresByManga[key].errors.add(item.errorText.slice(0, 50));
      }
    }

    // Group downloads by mangaTitle
    const downloadsByManga: Record<string, number[]> = {};
    for (const item of downloads) {
      const title = item.mangaTitle || 'Manga';
      if (!downloadsByManga[title]) downloadsByManga[title] = [];
      if (item.chapterIndex !== null && item.chapterIndex !== undefined) {
        downloadsByManga[title].push(item.chapterIndex + 1);
      }
    }

    // Build the consolidated text
    const lines: string[] = [i18n.digestTitle, ''];

    if (Object.keys(failuresByManga).length > 0) {
      lines.push(`${i18n.digestFailuresHeader} (${failures.length})`);
      for (const [key, val] of Object.entries(failuresByManga)) {
        const manga = key.split('|')[0];
        const rangeText = formatChapterRanges(val.chapters, i18n.digestChapters);
        const errorNote = val.errors.size > 0 ? ` [${[...val.errors].join('; ')}]` : '';
        lines.push(`• *${manga}*: ${rangeText} (${i18n.digestSource} ${val.source})${errorNote}`);
      }
      lines.push('');
    }

    if (Object.keys(downloadsByManga).length > 0) {
      lines.push(`${i18n.digestDownloadsHeader} (${downloads.length})`);
      for (const [manga, chapters] of Object.entries(downloadsByManga)) {
        const rangeText = formatChapterRanges(chapters, i18n.digestChapters);
        lines.push(`• *${manga}*: ${rangeText}`);
      }
      lines.push('');
    }

    lines.push(`${i18n.digestTotal} ${pendingItems.length}`);
    lines.push(i18n.digestAction);

    const bodyText = lines.join('\n');

    // Dispatch the digest alert
    await dispatchNotification('SERVER_CRITICAL_ERROR', {
      title: i18n.digestTitle,
      body: bodyText,
      severity: failures.length > 0 ? 'warn' : 'info',
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
