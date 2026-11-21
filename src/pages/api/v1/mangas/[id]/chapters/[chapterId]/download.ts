import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fs from 'fs';
import { prisma } from '../../../../../../../server/db/client';
import { validateApiToken } from '../../../../../../../utils/apiAuth';
import { resolveChapterFile } from '../../../../../../../server/utils/resolveChapterFile';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', ['GET', 'HEAD']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // 1. Validar el token Bearer, query param (?token=) o sesión cookie
  const isValid = await validateApiToken(req, res);
  if (!isValid) {
    if (!res.headersSent) {
      res.status(401).json({ error: 'Unauthorized' });
    }
    return;
  }

  const { id, chapterId } = req.query;

  if (!id || Array.isArray(id) || !chapterId || Array.isArray(chapterId)) {
    return res.status(400).json({ error: 'Parámetros inválidos' });
  }

  const mangaId = parseInt(id, 10);
  const chId = parseInt(chapterId, 10);

  if (Number.isNaN(mangaId) || Number.isNaN(chId)) {
    return res.status(400).json({ error: 'Formato de ID inválido' });
  }

  try {
    // 2. Buscar el manga y el capítulo en la base de datos
    const manga = await prisma.manga.findUnique({
      where: { id: mangaId },
      include: { library: true, sources: true },
    });

    if (!manga) {
      return res.status(404).json({ error: 'Manga no encontrado en la base de datos' });
    }

    const chapter = await prisma.chapter.findFirst({
      where: { id: chId, mangaId },
    });

    if (!chapter) {
      return res.status(404).json({ error: 'Capítulo no encontrado en la base de datos' });
    }

    // 3. Resolver la ruta física del archivo con soporte de fallbacks y auto-heal
    const { cbzPath, exists, isSafe } = resolveChapterFile(manga, chapter);

    if (!isSafe) {
      return res.status(403).json({ error: 'Acceso no permitido al archivo' });
    }

    if (!exists) {
      return res.status(404).json({
        error: `El archivo CBZ no existe físicamente en el disco: ${chapter.fileName}`,
      });
    }

    if (cbzPath.toLowerCase().endsWith('.pdf')) {
      return res.status(400).json({
        error: 'El capítulo se descargó en formato PDF. La descarga requiere formato CBZ.',
      });
    }

    // 4. Obtener metadatos del archivo para streaming y caché
    const stat = await fs.promises.stat(cbzPath);
    const fileSize = stat.size;
    const etag = `W/"${fileSize}-${stat.mtimeMs}"`;

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    const downloadFileName = chapter.fileName.endsWith('.cbz')
      ? chapter.fileName
      : `${path.basename(cbzPath, path.extname(cbzPath))}.cbz`;

    res.setHeader('Content-Type', 'application/vnd.comicbook+zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadFileName)}"`);
    res.setHeader('ETag', etag);
    res.setHeader('Last-Modified', stat.mtime.toUTCString());
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 horas

    // 5. Soporte para descargas reanudables (Range Requests - RFC 7233)
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (Number.isNaN(start) || start >= fileSize || (parts[1] && end >= fileSize) || start > end) {
        res.setHeader('Content-Range', `bytes */${fileSize}`);
        return res.status(416).end();
      }

      const chunkSize = end - start + 1;
      res.statusCode = 206;
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', chunkSize);

      if (req.method === 'HEAD') {
        return res.end();
      }

      const stream = fs.createReadStream(cbzPath, { start, end });
      stream.on('error', (streamErr) => {
        // eslint-disable-next-line no-console
        console.error('Error durante streaming de rango del capítulo:', streamErr);
        if (!res.headersSent) {
          res.status(500).end();
        }
      });
      stream.pipe(res);
      return;
    }

    // 6. Descarga completa estándar
    res.setHeader('Content-Length', fileSize);

    if (req.method === 'HEAD') {
      return res.end();
    }

    const stream = fs.createReadStream(cbzPath);
    stream.on('error', (streamErr) => {
      // eslint-disable-next-line no-console
      console.error('Error durante streaming del capítulo:', streamErr);
      if (!res.headersSent) {
        res.status(500).end();
      }
    });
    stream.pipe(res);
  } catch (error: any) {
    // eslint-disable-next-line no-console
    console.error('Error en endpoint de descarga de capítulo:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: error?.message || 'Error Interno del Servidor' });
    }
  }
}
