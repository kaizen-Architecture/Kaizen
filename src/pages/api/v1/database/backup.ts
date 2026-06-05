import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../server/db/client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const settings = await prisma.settings.findFirst();
    const authEnabled = settings?.authEnabled === true;

    if (authEnabled) {
      const session = req.cookies['kaizen-session'];
      if (!session) {
        return res.status(401).json({ error: 'Unauthorized: Session required' });
      }
    }

    // Sequentially retrieve all database tables to compile the full backup
    const libraries = await prisma.library.findMany();
    const mangas = await prisma.manga.findMany();
    const mangaSources = await prisma.mangaSource.findMany();
    const chapters = await prisma.chapter.findMany();
    const outOfSyncChapters = await prisma.outOfSyncChapter.findMany();
    const metadataList = await prisma.metadata.findMany();
    const settingsList = await prisma.settings.findMany();
    const users = await prisma.user.findMany();

    const backupData = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      data: {
        libraries,
        mangas,
        mangaSources,
        chapters,
        outOfSyncChapters,
        metadata: metadataList,
        settings: settingsList,
        users,
      },
    };

    const fileName = `kaizen-backup-${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.status(200).json(backupData);
  } catch (err) {
    console.error('Failed to create database backup:', err);
    return res.status(500).json({ error: `Internal Server Error: ${(err as Error).message}` });
  }
}
