import { NextApiRequest, NextApiResponse } from 'next';
import { nanoid } from 'nanoid';
import { prisma } from '../../../../../server/db/client';
import { checkChaptersQueue } from '../../../../../server/queue/checkChapters';
import {
  cancelMangaBetterSourceScan,
  getMangaBetterSourceScanStatus,
  startMangaBetterSourceScan,
  updateMangaBetterSourceScanAfterSwitch,
} from '../../../../../server/utils/better-source-scan';
import { validateApiToken } from '../../../../../utils/apiAuth';

/**
 * REST v1 endpoint for async per-manga Better Source Advisor with live per-source progress.
 * - GET  /api/v1/mangas/{id}/better-sources -> live scan status & streaming suggestions
 * - POST /api/v1/mangas/{id}/better-sources
 *     { action: "start" }
 *     { action: "cancel" }
 *     { action: "switch", newSource: string, newSourceTitle?: string }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const isValid = await validateApiToken(req, res);
  if (!isValid) return;

  const { id } = req.query;
  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  const mangaId = parseInt(id, 10);
  if (Number.isNaN(mangaId) || mangaId <= 0) {
    return res.status(400).json({ error: 'Invalid ID format' });
  }

  try {
    if (req.method === 'GET') {
      const status = await getMangaBetterSourceScanStatus(mangaId);
      if (!status) {
        return res.status(404).json({ error: `Manga ${mangaId} not found` });
      }
      return res.status(200).json(status);
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const action = String(body.action || 'start');

      if (action === 'start') {
        const result = await startMangaBetterSourceScan(mangaId);
        if (!result) {
          return res.status(404).json({ error: `Manga ${mangaId} not found` });
        }
        return res.status(200).json(result);
      }

      if (action === 'cancel') {
        const result = cancelMangaBetterSourceScan(mangaId);
        return res.status(200).json(result);
      }

      if (action === 'switch') {
        const newSource = String(body.newSource || '').trim();
        if (!newSource) {
          return res.status(400).json({ error: 'newSource is required' });
        }

        const manga = await prisma.manga.findUnique({ where: { id: mangaId } });
        if (!manga) {
          return res.status(404).json({ error: `Manga ${mangaId} not found` });
        }

        const newSourceTitle = String(body.newSourceTitle || manga.title).trim();

        await prisma.manga.update({
          where: { id: mangaId },
          data: { source: newSource },
        });

        await prisma.mangaSource.updateMany({
          where: { mangaId },
          data: { priority: 1 },
        });

        await prisma.mangaSource.upsert({
          where: { mangaId_source: { mangaId, source: newSource } },
          create: { mangaId, source: newSource, title: newSourceTitle, priority: 0 },
          update: { title: newSourceTitle, priority: 0 },
        });

        updateMangaBetterSourceScanAfterSwitch(mangaId, newSource);

        await checkChaptersQueue.add(nanoid(), { mangaId });
        return res.status(200).json({ success: true, mangaId, newSource, newSourceTitle });
      }

      return res.status(400).json({ error: `Unsupported action: ${action}` });
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Internal Server Error' });
  }
}
