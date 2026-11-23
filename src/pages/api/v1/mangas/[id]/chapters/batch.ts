import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import { prisma } from '../../../../../../server/db/client';
import { checkChaptersQueue } from '../../../../../../server/queue/checkChapters';
import { auditIntegrityQueue } from '../../../../../../server/queue/auditIntegrity';
import { getMangaPath } from '../../../../../../server/utils/mangal';
import { logger } from '../../../../../../utils/logging';
import { validateApiToken } from '../../../../../../utils/apiAuth';

type BatchAction = 'markRead' | 'markUnread' | 'reportCorrupt' | 'delete' | 'redownload';

const MANAGEMENT_ROLES = new Set(['SUPERADMIN', 'ADMIN', 'MANAGER']);

/**
 * POST /api/v1/mangas/[id]/chapters/batch
 *
 * Unified batch chapter operations endpoint for external clients (e.g. Kaizen iOS App) and web tools.
 * Body:
 * {
 *   "action": "markRead" | "markUnread" | "reportCorrupt" | "delete" | "redownload",
 *   "chapterIds": [101, 102, 105],          // optional (explicit selection)
 *   "startIndex": 10, "endIndex": 20,       // optional (inclusive 0-based index range)
 *   "deleteFiles": true                     // optional for "delete" (default: true)
 * }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const isValid = await validateApiToken(req, res);
  if (!isValid) return;

  const { id } = req.query;
  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: 'Invalid manga ID' });
  }
  const mangaId = parseInt(id, 10);
  if (Number.isNaN(mangaId)) {
    return res.status(400).json({ error: 'Invalid manga ID format' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const action = String(body.action || '') as BatchAction;
    const validActions: BatchAction[] = ['markRead', 'markUnread', 'reportCorrupt', 'delete', 'redownload'];
    if (!validActions.includes(action)) {
      return res.status(400).json({
        error: `Invalid action "${action}". Allowed: ${validActions.join(', ')}`,
      });
    }

    // Destructive / management actions require management role when auth is enabled
    if (action === 'delete' || action === 'redownload') {
      const settings = await prisma.settings.findFirst({ select: { authEnabled: true } });
      if (settings?.authEnabled) {
        const apiUser = (req as any).apiUser as { id: number; role?: string } | undefined;
        const normalizedRole = (apiUser?.role || '').toUpperCase();
        if (!apiUser || !MANAGEMENT_ROLES.has(normalizedRole)) {
          return res.status(403).json({
            error: `Forbidden: management permissions required for "${action}"`,
          });
        }
      }
    }

    const manga = await prisma.manga.findUnique({
      where: { id: mangaId },
      include: { library: true },
    });
    if (!manga) {
      return res.status(404).json({ error: 'Manga not found' });
    }

    const requestedIds: number[] = Array.isArray(body.chapterIds)
      ? Array.from(new Set(body.chapterIds.map((v: any) => Number(v)).filter((n: number) => !Number.isNaN(n) && n > 0)))
      : [];
    const hasRange =
      body.startIndex !== undefined &&
      body.endIndex !== undefined &&
      !Number.isNaN(Number(body.startIndex)) &&
      !Number.isNaN(Number(body.endIndex));

    if (requestedIds.length === 0 && !hasRange) {
      return res.status(400).json({
        error: 'Provide either non-empty "chapterIds" or both "startIndex" and "endIndex".',
      });
    }

    let targetChapters;
    if (requestedIds.length > 0) {
      targetChapters = await prisma.chapter.findMany({
        where: {
          mangaId,
          id: { in: requestedIds },
        },
        select: { id: true, index: true, fileName: true },
      });
    } else {
      const minIdx = Math.min(Number(body.startIndex), Number(body.endIndex));
      const maxIdx = Math.max(Number(body.startIndex), Number(body.endIndex));
      targetChapters = await prisma.chapter.findMany({
        where: {
          mangaId,
          index: { gte: minIdx, lte: maxIdx },
        },
        select: { id: true, index: true, fileName: true },
      });
    }

    const matchedIdSet = new Set(targetChapters.map((c) => c.id));
    const failedIds = requestedIds.filter((cid) => !matchedIdSet.has(cid));
    const targetIds = targetChapters.map((c) => c.id);

    if (targetIds.length === 0) {
      return res.status(200).json({
        success: true,
        action,
        mangaId,
        processedCount: 0,
        failedIds,
      });
    }

    if (action === 'markRead' || action === 'markUnread') {
      const isRead = action === 'markRead';
      const now = isRead ? new Date() : null;
      const apiUser = (req as any).apiUser as { id: number } | undefined;

      await prisma.chapter.updateMany({
        where: { mangaId, id: { in: targetIds } },
        data: {
          isRead,
          lastReadAt: now,
        },
      });

      if (apiUser?.id) {
        await prisma.$transaction(
          targetIds.map((chapterId) =>
            prisma.userChapterProgress.upsert({
              where: {
                userId_chapterId: {
                  userId: apiUser.id,
                  chapterId,
                },
              },
              create: {
                userId: apiUser.id,
                chapterId,
                isRead,
                lastReadAt: now,
              },
              update: {
                isRead,
                lastReadAt: now,
              },
            }),
          ),
        );
      }

      return res.status(200).json({
        success: true,
        action,
        mangaId,
        processedCount: targetIds.length,
        failedIds,
      });
    }

    if (action === 'reportCorrupt') {
      logger.warn(
        `[API Batch Report] ${targetIds.length} chapter(s) for mangaId=${mangaId} reported corrupt. Enqueuing single background integrity audit.`,
      );
      await auditIntegrityQueue.add(nanoid(), { mangaId });

      return res.status(200).json({
        success: true,
        action,
        mangaId,
        processedCount: targetIds.length,
        failedIds,
      });
    }

    if (action === 'delete' || action === 'redownload') {
      const shouldDeleteFiles = action === 'redownload' ? true : body.deleteFiles !== false;
      const mangaDir = getMangaPath(manga.library.path, manga.title);

      if (shouldDeleteFiles) {
        for (const ch of targetChapters) {
          if (ch.fileName) {
            const filePath = path.join(mangaDir, ch.fileName);
            // eslint-disable-next-line no-await-in-loop
            await fs.promises.unlink(filePath).catch(() => {});
          }
        }
      }

      await prisma.chapter.deleteMany({
        where: { mangaId, id: { in: targetIds } },
      });

      if (action === 'redownload') {
        await checkChaptersQueue.add(nanoid(), { mangaId });
      }

      return res.status(200).json({
        success: true,
        action,
        mangaId,
        processedCount: targetIds.length,
        failedIds,
      });
    }

    return res.status(400).json({ error: 'Unhandled action' });
  } catch (err: any) {
    logger.error(`[API Batch Chapters] Error for mangaId=${mangaId}: ${err?.message || err}`);
    return res.status(500).json({ error: err?.message || 'Internal Server Error' });
  }
}
