import * as komga from './komga';
import * as kavita from './kavita';
import { prisma } from '../../db/client';
import { logger } from '../../../utils/logging';

export const scanLibrary = async () => {
  // 1. Process pending metadata injections first
  const pendingChapters = await prisma.chapter.findMany({
    where: {
      metadataInjected: false,
      metadataFailed: false,
    },
    select: { id: true },
  });

  if (pendingChapters.length > 0) {
    logger.info(`Integration: Processing ${pendingChapters.length} pending metadata injections...`);
    for (const chapter of pendingChapters) {
      try {
        await kavita.injectMetadata(chapter.id);
        // Add komga.injectMetadata here if needed in the future
      } catch (err) {
        logger.error(`Integration: Failed to process chapter ${chapter.id}: ${err}`);
      }
    }
  }

  // 2. Trigger library scans on external platforms
  logger.info('Integration: Coordinating library scans across all active platforms...');
  const results = await Promise.allSettled([komga.scanLibrary(), kavita.scanLibrary()]);
  results.forEach((res, index) => {
    if (res.status === 'rejected') {
      const platform = index === 0 ? 'Komga' : 'Kavita';
      logger.error(`Integration: ${platform} library scan failed: ${res.reason}`);
    }
  });
};

export const refreshMetadata = async (mangaTitle: string) => {
  const results = await Promise.allSettled([komga.refreshMetadata(mangaTitle), kavita.refreshMetadata(mangaTitle)]);
  results.forEach((res, index) => {
    if (res.status === 'rejected') {
      const platform = index === 0 ? 'Komga' : 'Kavita';
      logger.error(`Integration: ${platform} metadata refresh failed for "${mangaTitle}": ${res.reason}`);
    }
  });
};
