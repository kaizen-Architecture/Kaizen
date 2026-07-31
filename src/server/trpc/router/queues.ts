import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { t } from '../trpc';
import { auditIntegrityQueue } from '../../queue/auditIntegrity';
import { checkChaptersQueue } from '../../queue/checkChapters';
import { checkOutOfSyncChaptersQueue } from '../../queue/checkOutOfSyncChapters';
import { downloadQueue } from '../../queue/download';
import { fixOutOfSyncChaptersQueue } from '../../queue/fixOutOfSyncChapters';
import { integrationQueue } from '../../queue/integration';
import { notificationQueue } from '../../queue/notify';
import { refreshMangaStatusQueue } from '../../queue/refreshMangaStatus';
import { updateMetadataQueue } from '../../queue/updateMetadata';

const QUEUE_MAP = {
  downloadQueue: { name: 'downloadQueue', label: 'Descarga de Capítulos', queue: downloadQueue },
  checkChaptersQueue: { name: 'checkChaptersQueue', label: 'Comprobación del Planificador', queue: checkChaptersQueue },
  auditIntegrityQueue: { name: 'auditIntegrityQueue', label: 'Auditoría de Integridad CBZ', queue: auditIntegrityQueue },
  refreshMangaStatusQueue: { name: 'refreshMangaStatusQueue', label: 'Estado de Mangas', queue: refreshMangaStatusQueue },
  updateMetadataQueue: { name: 'updateMetadataQueue', label: 'Actualización de Metadatos', queue: updateMetadataQueue },
  integrationQueue: { name: 'integrationQueue', label: 'Sincronización de Disco', queue: integrationQueue },
  notificationQueue: { name: 'notificationQueue', label: 'Notificaciones Push / Telegram', queue: notificationQueue },
  checkOutOfSyncChaptersQueue: { name: 'checkOutOfSyncChaptersQueue', label: 'Detección de Desfases', queue: checkOutOfSyncChaptersQueue },
  fixOutOfSyncChaptersQueue: { name: 'fixOutOfSyncChaptersQueue', label: 'Corrección de Desfases', queue: fixOutOfSyncChaptersQueue },
} as const;

export type QueueKey = keyof typeof QUEUE_MAP;

export const queuesRouter = t.router({
  getMetrics: t.procedure.query(async () => {
    const queueEntries = Object.entries(QUEUE_MAP);

    const metrics = await Promise.all(
      queueEntries.map(async ([key, { label, queue }]) => {
        const counts = await queue.getJobCounts('active', 'completed', 'failed', 'delayed', 'waiting');
        const isPaused = await queue.isPaused();

        return {
          id: key,
          name: key,
          label,
          active: counts.active || 0,
          waiting: counts.waiting || 0,
          delayed: counts.delayed || 0,
          failed: counts.failed || 0,
          completed: counts.completed || 0,
          total: (counts.active || 0) + (counts.waiting || 0) + (counts.delayed || 0) + (counts.failed || 0),
          isPaused,
        };
      })
    );

    const summary = metrics.reduce(
      (acc, q) => {
        acc.totalActive += q.active;
        acc.totalWaiting += q.waiting;
        acc.totalDelayed += q.delayed;
        acc.totalFailed += q.failed;
        return acc;
      },
      { totalActive: 0, totalWaiting: 0, totalDelayed: 0, totalFailed: 0 }
    );

    return {
      summary,
      queues: metrics,
    };
  }),

  getQueueJobs: t.procedure
    .input(
      z.object({
        queueName: z.string(),
        status: z.enum(['active', 'waiting', 'delayed', 'failed', 'completed']),
        page: z.number().optional().default(1),
        pageSize: z.number().optional().default(15),
      })
    )
    .query(async ({ input }) => {
      const queueInfo = QUEUE_MAP[input.queueName as QueueKey];
      if (!queueInfo) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Queue not found' });
      }

      const q = queueInfo.queue;
      const start = (input.page - 1) * input.pageSize;
      const end = start + input.pageSize - 1;

      const jobs = await q.getJobs([input.status], start, end, true);
      const totalCount = await q.getJobCountByTypes(input.status);

      const formattedJobs = jobs.map((job) => ({
        id: String(job.id),
        name: job.name,
        data: job.data || {},
        failedReason: job.failedReason || null,
        stacktrace: job.stacktrace || [],
        timestamp: job.timestamp ? new Date(job.timestamp).toISOString() : null,
        processedOn: job.processedOn ? new Date(job.processedOn).toISOString() : null,
        finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
        attemptsMade: job.attemptsMade || 0,
      }));

      return {
        queueName: input.queueName,
        label: queueInfo.label,
        status: input.status,
        totalCount,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(totalCount / input.pageSize) || 1,
        jobs: formattedJobs,
      };
    }),

  retryJob: t.procedure
    .input(
      z.object({
        queueName: z.string(),
        jobId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const q = QUEUE_MAP[input.queueName as QueueKey]?.queue;
      if (!q) return { success: false, message: 'Queue not found' };

      const job = await q.getJob(input.jobId);
      if (!job) return { success: false, message: 'Job not found' };

      await job.retry();
      return { success: true };
    }),

  removeJob: t.procedure
    .input(
      z.object({
        queueName: z.string(),
        jobId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const q = QUEUE_MAP[input.queueName as QueueKey]?.queue;
      if (!q) return { success: false, message: 'Queue not found' };

      const job = await q.getJob(input.jobId);
      if (job) {
        await job.remove();
      }
      return { success: true };
    }),

  retryAllFailed: t.procedure
    .input(
      z.object({
        queueName: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const q = QUEUE_MAP[input.queueName as QueueKey]?.queue;
      if (!q) return { success: false, message: 'Queue not found' };

      const failedJobs = await q.getFailed(0, 500);
      await Promise.all(failedJobs.map((j) => j.retry().catch(() => {})));
      return { success: true, count: failedJobs.length };
    }),

  cleanQueue: t.procedure
    .input(
      z.object({
        queueName: z.string(),
        type: z.enum(['completed', 'failed']),
      })
    )
    .mutation(async ({ input }) => {
      const q = QUEUE_MAP[input.queueName as QueueKey]?.queue;
      if (!q) return { success: false, message: 'Queue not found' };

      if (input.type === 'completed') {
        await q.clean(0, 0, 'completed');
      } else if (input.type === 'failed') {
        await q.clean(0, 0, 'failed');
      }

      return { success: true };
    }),
});
