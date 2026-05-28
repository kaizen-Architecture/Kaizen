import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../server/db/client';
import { validateApiToken } from '../../../../utils/apiAuth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    res.setHeader('Allow', ['GET', 'PATCH']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const isValid = await validateApiToken(req, res);
  if (!isValid) return;

  const { id } = req.query;

  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  const mangaId = parseInt(id, 10);
  if (isNaN(mangaId)) {
    return res.status(400).json({ error: 'Invalid ID format' });
  }

  // 1. Handle PATCH request (Update reading status)
  if (req.method === 'PATCH') {
    try {
      const mangaExists = await prisma.manga.findUnique({
        where: { id: mangaId },
      });
      if (!mangaExists) {
        return res.status(404).json({ error: 'Manga not found' });
      }

      const { isRead, chapters } = req.body;

      // Format A: Update all chapters
      if (typeof isRead === 'boolean') {
        const result = await prisma.chapter.updateMany({
          where: { mangaId },
          data: {
            isRead,
            lastReadAt: isRead ? new Date() : null,
          },
        });
        return res.status(200).json({ success: true, updatedChaptersCount: result.count });
      }

      // Format B: Update specific chapters
      if (Array.isArray(chapters)) {
        const updates = chapters.map((ch: any) => {
          if (!ch.id || (ch.isRead === undefined && ch.lastReadPage === undefined)) {
            throw new Error('Invalid chapter format inside array: must provide id and either isRead or lastReadPage');
          }
          const updateData: any = {};
          if (typeof ch.isRead === 'boolean') {
            updateData.isRead = ch.isRead;
          }
          if (typeof ch.lastReadPage === 'number') {
            updateData.lastReadPage = ch.lastReadPage;
            updateData.lastReadAt = new Date();
          } else if (ch.isRead) {
            updateData.lastReadAt = new Date();
          } else if (ch.isRead === false) {
            updateData.lastReadAt = null;
          }

          return prisma.chapter.updateMany({
            where: {
              id: Number(ch.id),
              mangaId, // Security: ensure it belongs to the current manga
            },
            data: updateData,
          });
        });

        const results = await prisma.$transaction(updates);
        const totalUpdated = results.reduce((acc, r) => acc + r.count, 0);
        return res.status(200).json({ success: true, updatedChaptersCount: totalUpdated });
      }

      return res.status(400).json({ error: 'Invalid request body. Provide "isRead" or "chapters".' });
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('Error updating manga reading status:', error);
      return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  }

  // 2. Handle GET request
  try {
    const manga = await prisma.manga.findUnique({
      where: {
        id: mangaId,
      },
      include: {
        metadata: true,
        library: true,
        chapters: {
          orderBy: {
            index: 'desc',
          },
        },
      },
    });

    if (!manga) {
      return res.status(404).json({ error: 'Manga not found' });
    }

    const totalChapters = manga.chapters.length;
    const readChapters = manga.chapters.filter((c) => c.isRead).length;

    const host = req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const coverUrl = manga.metadata?.cover ? `${protocol}://${host}/api/v1/mangas/${manga.id}/cover` : null;

    if (manga.metadata) {
      manga.metadata.cover = coverUrl || '';
    }

    const response = {
      ...manga,
      readingStatus: {
        totalChapters,
        readChapters,
        unreadChapters: totalChapters - readChapters,
        percentageComplete: totalChapters > 0 ? Math.round((readChapters / totalChapters) * 100) : 0,
        isFullyRead: totalChapters > 0 && readChapters === totalChapters,
      },
    };

    return res.status(200).json(response);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching manga:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
