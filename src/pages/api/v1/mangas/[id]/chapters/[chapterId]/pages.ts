import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fs from 'fs';
import AdmZip from 'adm-zip';
import { prisma } from '../../../../../../../server/db/client';
import { validateApiToken } from '../../../../../../../utils/apiAuth';
import { resolveChapterFile } from '../../../../../../../server/utils/resolveChapterFile';
// eslint-disable-next-line import/no-extraneous-dependencies

// Cache zip entries to prevent memory spikes
const zipCache: Record<string, { time: number; entries: any[] }> = {};
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes
const MAX_CACHE_SIZE = 20;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // 1. Validar el token Bearer del usuario o sesión cookie
  const isValid = await validateApiToken(req, res);
  if (!isValid) {
    if (!res.headersSent) {
      res.status(401).json({ error: 'Unauthorized' });
    }
    return;
  }

  if (req.method === 'POST') {
    const { id, chapterId } = req.query;
    const { favoritePages } = req.body;

    if (!id || !chapterId) return res.status(400).json({ error: 'Missing params' });

    const mangaId = parseInt(id as string, 10);
    const chId = parseInt(chapterId as string, 10);

    if (Number.isNaN(mangaId) || Number.isNaN(chId)) return res.status(400).json({ error: 'Invalid ID' });

    await prisma.chapter.update({
      where: { id: chId },
      data: { favoritePages },
    });

    return res.status(200).json({ success: true });
  }

  const { id, chapterId, pageIndex } = req.query;

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

    // 3. Resolver la ruta absoluta al archivo .cbz
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
        error: 'El capítulo se descargó en formato PDF. El lector integrado requiere formato CBZ. Por favor, re-descarga el capítulo en formato CBZ.',
      });
    }

    const cacheKey = cbzPath;
    let entries: any[] = [];

    // Clean up old cache
    const now = Date.now();
    let keys = Object.keys(zipCache);
    keys.forEach((key) => {
      if (now - zipCache[key].time > CACHE_TTL) {
        delete zipCache[key];
      }
    });

    keys = Object.keys(zipCache);
    if (keys.length > MAX_CACHE_SIZE) {
      // delete oldest
      let oldestKey = keys[0];
      keys.forEach((k) => {
        if (zipCache[k].time < zipCache[oldestKey].time) {
          oldestKey = k;
        }
      });
      delete zipCache[oldestKey];
    }

    // 4. Abrir el CBZ en memoria con AdmZip (con caché)
    if (zipCache[cacheKey]) {
      zipCache[cacheKey].time = now;
      entries = zipCache[cacheKey].entries;
    } else {
      let zip: AdmZip;
      try {
        zip = new AdmZip(cbzPath);
      } catch (zipErr: any) {
        return res.status(500).json({
          error: `No se pudo abrir el archivo CBZ (${path.basename(cbzPath)}): ${zipErr?.message || zipErr}`,
        });
      }
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif'];
      entries = zip
        .getEntries()
        .filter((entry) => {
          if (entry.isDirectory) return false;
          const entryPath = entry.entryName;
          if (path.basename(entryPath).startsWith('._')) return false;
          if (entryPath.includes('__MACOSX')) return false;

          const ext = path.extname(entryPath).toLowerCase();
          return imageExtensions.includes(ext);
        })
        .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true, sensitivity: 'base' }));

      zipCache[cacheKey] = { time: now, entries };
    }

    const isPrefetch =
      req.query.prefetch === 'true' ||
      req.query.peek === 'true' ||
      req.headers['x-kaizen-prefetch'] === 'true';

    // 6. CASO A: Servir la imagen binaria de una página
    if (pageIndex !== undefined) {
      const pIdx = parseInt(Array.isArray(pageIndex) ? pageIndex[0] : pageIndex, 10);
      if (Number.isNaN(pIdx) || pIdx < 0 || pIdx >= entries.length) {
        return res.status(400).json({ error: 'Índice de página fuera de rango o inválido' });
      }

      const entry = entries[pIdx];
      const data = entry.getData(); // Extraer directamente a Buffer
      const ext = path.extname(entry.entryName).toLowerCase();

      let contentType = 'image/jpeg';
      if (ext === '.png') contentType = 'image/png';
      else if (ext === '.webp') contentType = 'image/webp';
      else if (ext === '.avif') contentType = 'image/avif';
      else if (ext === '.gif') contentType = 'image/gif';
      else if (ext === '.bmp') contentType = 'image/bmp';

      // Update reading progress dynamically when Paperback pulls a specific page index (except during prefetch)
      if (!isPrefetch) {
        try {
          await prisma.chapter.update({
            where: { id: chId },
            data: {
              lastReadPage: pIdx,
              lastReadAt: new Date(),
              isRead: pIdx === entries.length - 1 ? true : undefined,
            },
          });
        } catch (err) {
          console.error('Failed to update progress for external reader:', err);
        }
      }

      // Cabeceras HTTP óptimas para caché de imágenes en Paperback
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.send(data);
    }

    // 7. CASO B: Retornar el índice de páginas en formato JSON (excepto si es prefetch o preview)
    if (!chapter.isRead && !isPrefetch) {
      await prisma.chapter.update({
        where: { id: chId },
        data: {
          isRead: true,
          lastReadAt: new Date(),
        },
      });
    }

    const token =
      (req.query.token as string) ||
      (req.query.apiKey as string) ||
      (req.query.apiToken as string) ||
      (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.substring(7).trim() : '');

    const baseUrl = `/api/v1/mangas/${mangaId}/chapters/${chId}/pages`;
    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
    const prefetchParam = isPrefetch ? '&prefetch=true' : '';
    const pages = entries.map((entry, idx) => ({
      index: idx,
      name: entry.entryName,
      url: `${baseUrl}?pageIndex=${idx}${tokenParam}${prefetchParam}`,
    }));

    return res.status(200).json({
      chapterId: chId,
      totalPages: pages.length,
      pages,
    });
  } catch (error: any) {
    // eslint-disable-next-line no-console
    console.error('Error en endpoint de páginas:', error);
    return res.status(500).json({ error: error.message || 'Error Interno del Servidor' });
  }
}
