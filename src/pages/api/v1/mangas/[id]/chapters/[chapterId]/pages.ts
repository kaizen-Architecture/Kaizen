import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fs from 'fs';
import AdmZip from 'adm-zip';
import { prisma } from '../../../../../../../server/db/client';
import { validateApiToken } from '../../../../../../../utils/apiAuth';
import { sanitizer } from '../../../../../../../utils';

/**
 * GET /api/v1/mangas/[id]/chapters/[chapterId]/pages
 *
 * - Sin parámetro 'pageIndex': Devuelve JSON con el listado de páginas y URLs de renderizado.
 * - Con parámetro 'pageIndex': Extrae en memoria y sirve la imagen binaria (JPEG/PNG/WebP/GIF/BMP) de esa página.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // 1. Validar el token Bearer del usuario
  const isValid = await validateApiToken(req, res);
  if (!isValid) return;

  const { id, chapterId, pageIndex } = req.query;

  if (!id || Array.isArray(id) || !chapterId || Array.isArray(chapterId)) {
    return res.status(400).json({ error: 'Parámetros inválidos' });
  }

  const mangaId = parseInt(id, 10);
  const chId = parseInt(chapterId, 10);

  if (isNaN(mangaId) || isNaN(chId)) {
    return res.status(400).json({ error: 'Formato de ID inválido' });
  }

  try {
    // 2. Buscar el manga y el capítulo en la base de datos
    const manga = await prisma.manga.findUnique({
      where: { id: mangaId },
      include: { library: true },
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
    const mangaDir = path.resolve(manga.library.path, sanitizer(manga.title));
    const cbzPath = path.join(mangaDir, chapter.fileName);

    if (!fs.existsSync(cbzPath)) {
      return res.status(404).json({
        error: `El archivo CBZ no existe físicamente en el disco: ${chapter.fileName}`,
      });
    }

    // 4. Abrir el CBZ en memoria con AdmZip
    const zip = new AdmZip(cbzPath);
    const zipEntries = zip.getEntries();

    // 5. Filtrar archivos que sean imágenes y ordenarlos alfabéticamente
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];
    const entries = zipEntries
      .filter((entry) => {
        if (entry.isDirectory) return false;
        const entryPath = entry.entryName;
        // Ignorar archivos ocultos y temporales de macOS/sistemas
        if (path.basename(entryPath).startsWith('._')) return false;
        if (entryPath.includes('__MACOSX')) return false;

        const ext = path.extname(entryPath).toLowerCase();
        return imageExtensions.includes(ext);
      })
      .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true, sensitivity: 'base' }));

    // 6. CASO A: Servir la imagen binaria de una página
    if (pageIndex !== undefined) {
      const pIdx = parseInt(Array.isArray(pageIndex) ? pageIndex[0] : pageIndex, 10);
      if (isNaN(pIdx) || pIdx < 0 || pIdx >= entries.length) {
        return res.status(400).json({ error: 'Índice de página fuera de rango o inválido' });
      }

      const entry = entries[pIdx];
      const data = entry.getData(); // Extraer directamente a Buffer
      const ext = path.extname(entry.entryName).toLowerCase();

      let contentType = 'image/jpeg';
      if (ext === '.png') contentType = 'image/png';
      else if (ext === '.webp') contentType = 'image/webp';
      else if (ext === '.gif') contentType = 'image/gif';
      else if (ext === '.bmp') contentType = 'image/bmp';

      // Cabeceras HTTP óptimas para caché de imágenes en Paperback
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.send(data);
    }

    // 7. CASO B: Retornar el índice de páginas en formato JSON
    if (!chapter.isRead) {
      await prisma.chapter.update({
        where: { id: chId },
        data: {
          isRead: true,
          lastReadAt: new Date(),
        },
      });
    }

    const baseUrl = `/api/v1/mangas/${mangaId}/chapters/${chId}/pages`;
    const pages = entries.map((entry, idx) => ({
      index: idx,
      name: entry.entryName,
      url: `${baseUrl}?pageIndex=${idx}`,
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
