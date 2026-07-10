import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../server/db/client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
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

    const { data } = req.body;
    if (!data) {
      return res.status(400).json({ error: 'Invalid backup file: missing "data" key' });
    }

    // Safely extract table data with fallbacks for maximum resilience
    const metadataList = data.metadata || [];
    const libraries = data.libraries || [];
    const mangas = data.mangas || [];
    const mangaSources = data.mangaSources || [];
    const chapters = data.chapters || [];
    const outOfSyncChapters = data.outOfSyncChapters || [];
    const settingsList = data.settings || [];
    const users = data.users || [];

    // Perform database restoration in a single transaction for absolute atomicity
    await prisma.$transaction(async (tx) => {
      // 1. Clean out existing database records in foreign key dependency order
      await tx.outOfSyncChapter.deleteMany();
      await tx.chapter.deleteMany();
      await tx.mangaSource.deleteMany();
      await tx.manga.deleteMany();
      await tx.library.deleteMany();
      await tx.metadata.deleteMany();
      await tx.user.deleteMany();
      await tx.settings.deleteMany();

      // 2. Restore all data records sequentially to satisfy structural constraints
      if (users.length > 0) {
        await tx.user.createMany({ data: users });
      }
      if (settingsList.length > 0) {
        await tx.settings.createMany({ data: settingsList });
      }
      if (metadataList.length > 0) {
        await tx.metadata.createMany({ data: metadataList });
      }
      if (libraries.length > 0) {
        await tx.library.createMany({ data: libraries });
      }
      if (mangas.length > 0) {
        await tx.manga.createMany({ data: mangas });
      }
      if (mangaSources.length > 0) {
        await tx.mangaSource.createMany({ data: mangaSources });
      }
      if (chapters.length > 0) {
        await tx.chapter.createMany({ data: chapters });
      }
      if (outOfSyncChapters.length > 0) {
        await tx.outOfSyncChapter.createMany({ data: outOfSyncChapters });
      }
    });

    return res.status(200).json({ success: true, message: 'Database restored successfully' });
  } catch (err) {
    console.error('Failed to restore database from backup:', err);
    return res.status(500).json({ error: `Restoration Failed: ${(err as Error).message}` });
  }
}
