import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../../../../server/db/client';
import { validateApiToken } from '../../../../../utils/apiAuth';
import { getMangaPath } from '../../../../../server/utils/mangal';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
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

  try {
    const manga = await prisma.manga.findUnique({
      where: { id: mangaId },
      include: {
        metadata: true,
        library: true,
      },
    });

    if (!manga) {
      return res.status(404).json({ error: 'Manga not found' });
    }

    const coverData = manga.metadata?.cover;
    let mangaDir = '';
    let coverPath = '';

    try {
      mangaDir = getMangaPath(manga.library.path, manga.title);
      coverPath = path.join(mangaDir, 'cover.jpg');
    } catch (_) {}

    // ETag for fast 304 Not Modified validation
    const etag = `W/"manga-cover-${mangaId}"`;
    if (req.headers['if-none-match'] === etag) {
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      return res.status(304).end();
    }

    // 1. Try reading from disk cover.jpg in the manga directory
    if (coverPath && fs.existsSync(coverPath)) {
      try {
        const fileBuffer = await fs.promises.readFile(coverPath);
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        return res.status(200).send(fileBuffer);
      } catch (err) {
        // Ignore disk error and fallback to DB/External
      }
    }

    // 2. Try parsing Base64 from database
    if (coverData && coverData.startsWith('data:image/')) {
      const parts = coverData.split(',');
      if (parts.length >= 2) {
        const buffer = Buffer.from(parts[1], 'base64');
        const mime = coverData.match(/data:([^;]+);/)?.[1] || 'image/jpeg';

        // Cache to disk in background if directory exists
        if (coverPath && mangaDir && fs.existsSync(mangaDir)) {
          fs.promises.writeFile(coverPath, buffer).catch(() => {});
        }

        res.setHeader('Content-Type', mime);
        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        return res.status(200).send(buffer);
      }
    }

    // 3. Try fetching from remote URL if it's an HTTP URL
    if (coverData && coverData.startsWith('http')) {
      const fetchRes = await fetch(coverData);
      if (fetchRes.ok) {
        const arrayBuffer = await fetchRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const contentType = fetchRes.headers.get('content-type') || 'image/jpeg';

        // Cache to disk in background so subsequent requests are instant
        if (coverPath && mangaDir && fs.existsSync(mangaDir)) {
          fs.promises.writeFile(coverPath, buffer).catch(() => {});
        }

        res.setHeader('Content-Type', contentType);
        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        return res.status(200).send(buffer);
      }
    }

    return res.status(404).json({ error: 'Cover not found' });
  } catch (error) {
    console.error('Error serving manga cover:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
