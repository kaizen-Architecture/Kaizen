import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../server/db/client';
import { checkChaptersQueue } from '../../../../server/queue/checkChapters';
import {
  cancelBetterSourceScan,
  getBetterSourceScanStatus,
  startBetterSourceScan,
} from '../../../../server/utils/better-source-scan';
import { validateApiToken } from '../../../../utils/apiAuth';
import { nanoid } from 'nanoid';

/**
 * REST v1 endpoint for remote Better Source Advisor control (used by Kaizen iOS App & external clients).
 * - GET  /api/v1/system/better-sources -> live scan progress & streaming recommendations
 * - POST /api/v1/system/better-sources
 *     { action: "start", limit?: number }
 *     { action: "cancel" }
 *     { action: "switch", mangaId: number, newSource: string, newSourceTitle?: string }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const isValid = await validateApiToken(req, res);
  if (!isValid) return;

  try {
    if (req.method === 'GET') {
      const status = await getBetterSourceScanStatus();
      return res.status(200).json(status);
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const action = String(body.action || 'start');

      if (action === 'start') {
        const limit =
          body.limit !== undefined && body.limit !== null && Number(body.limit) > 0 ? Number(body.limit) : undefined;
        const result = await startBetterSourceScan(limit);
        return res.status(200).json(result);
      }

      if (action === 'cancel') {
        const result = cancelBetterSourceScan();
        return res.status(200).json(result);
      }

      if (action === 'switch') {
        const mangaId = Number(body.mangaId);
        const newSource = String(body.newSource || '').trim();
        if (!mangaId || !newSource) {
          return res.status(400).json({ error: 'mangaId and newSource are required' });
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
