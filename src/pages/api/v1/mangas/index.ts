import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../server/db/client';
import { validateApiToken } from '../../../../utils/apiAuth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const isValid = await validateApiToken(req, res);
  if (!isValid) return;

  try {
    const { genre, author, status } = req.query;

    const where: any = {};

    if (genre || author || status) {
      where.metadata = {};

      if (genre) {
        const genreList = Array.isArray(genre) ? genre : [genre];
        where.metadata.genres = {
          hasSome: genreList,
        };
      }

      if (author) {
        const authorList = Array.isArray(author) ? author : [author];
        where.metadata.authors = {
          hasSome: authorList,
        };
      }

      if (status) {
        where.metadata.status = {
          equals: String(status),
          mode: 'insensitive',
        };
      }
    }

    const mangas = await prisma.manga.findMany({
      where,
      include: {
        metadata: true,
        library: true,
        chapters: {
          select: {
            isRead: true,
          },
        },
      },
    });

    const { host } = req.headers;
    const protocol = req.headers['x-forwarded-proto'] || 'http';

    const response = mangas.map((manga) => {
      const totalChapters = manga.chapters.length;
      const readChapters = manga.chapters.filter((c) => c.isRead).length;

      const { chapters, ...mangaWithoutChapters } = manga;

      const coverUrl = manga.metadata?.cover ? `${protocol}://${host}/api/v1/mangas/${manga.id}/cover` : null;
      if (mangaWithoutChapters.metadata) {
        mangaWithoutChapters.metadata.cover = coverUrl || '';
      }

      return {
        ...mangaWithoutChapters,
        readingStatus: {
          totalChapters,
          readChapters,
          unreadChapters: totalChapters - readChapters,
          percentageComplete: totalChapters > 0 ? Math.round((readChapters / totalChapters) * 100) : 0,
          isFullyRead: totalChapters > 0 && readChapters === totalChapters,
        },
      };
    });

    return res.status(200).json(response);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching mangas:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
