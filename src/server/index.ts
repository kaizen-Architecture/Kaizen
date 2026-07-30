import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';
import express, { Request, Response } from 'express';
import next from 'next';
import { logger } from '../utils/logging';
import { auditIntegrityQueue } from './queue/auditIntegrity';
import { checkChaptersQueue, scheduleAll } from './queue/checkChapters';
import { checkOutOfSyncChaptersQueue } from './queue/checkOutOfSyncChapters';
import { downloadQueue } from './queue/download';
import { fixOutOfSyncChaptersQueue } from './queue/fixOutOfSyncChapters';
import { integrationQueue } from './queue/integration';
import { notificationQueue } from './queue/notify';
import { updateMetadataQueue } from './queue/updateMetadata';
import { refreshMangaStatusQueue, scheduleMangaStatusRefresh } from './queue/refreshMangaStatus';
import { syncAllSources } from './utils/sources';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/bull/queues');

createBullBoard({
  queues: [
    new BullAdapter(downloadQueue),
    new BullAdapter(checkChaptersQueue),
    new BullAdapter(notificationQueue),
    new BullAdapter(updateMetadataQueue),
    new BullAdapter(integrationQueue),
    new BullAdapter(checkOutOfSyncChaptersQueue),
    new BullAdapter(fixOutOfSyncChaptersQueue),
    new BullAdapter(refreshMangaStatusQueue),
    new BullAdapter(auditIntegrityQueue),
  ],
  serverAdapter,
});

(async () => {
  try {
    await app.prepare();
    const port = process.env.KAIZEN_PORT || process.env.KAIZOKU_PORT || 3000;
    await scheduleAll();
    await scheduleMangaStatusRefresh();

    // Sincronizar y reactivar fuentes en segundo plano al arrancar
    syncAllSources().catch((err) => {
      logger.error(`[Startup Source Sync] Falló la sincronización en segundo plano: ${err}`);
    });
    const server = express();
    server.use('/bull/queues', serverAdapter.getRouter()).all('*', (req: Request, res: Response) => {
      return handle(req, res);
    });

    server.listen(port, () => {
      logger.info(`> Ready on http://localhost:${port} - env ${process.env.NODE_ENV}`);
    });
  } catch (e) {
    logger.error(e);
    process.exit(1);
  }
})();
