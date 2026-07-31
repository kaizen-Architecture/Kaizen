import { sanitizer } from '../../../utils';
import { prisma } from '../../db/client';
import { getCachedSettings } from '../settings-cache';
import { logger } from '../../../utils/logging';
import { safeJsonParse } from '../http';

interface Library {
  id: string;
}

interface Series {
  content: SeriesContent[];
}

interface SeriesContent {
  id: string;
  name: string;
}

export const scanLibrary = async () => {
  const settings = await getCachedSettings();

  if (settings.komgaEnabled && settings.komgaHost && settings.komgaUser && settings.komgaPassword) {
    logger.info(`Komga: Starting library scan... Host: ${settings.komgaHost}`);
    try {
      const baseKomgaUrl = settings.komgaHost.toLowerCase().startsWith('http')
        ? settings.komgaHost
        : `http://${settings.komgaHost}`;
      const headers = {
        Authorization: `Basic ${Buffer.from(`${settings.komgaUser}:${settings.komgaPassword}`).toString('base64')}`,
      };
      const komgaLibrariesUrl = new URL('/api/v1/libraries', baseKomgaUrl).href;

      logger.debug(`Komga: Fetching libraries from ${komgaLibrariesUrl}`);
      const librariesResponse = await fetch(komgaLibrariesUrl, { headers });
      if (!librariesResponse.ok) {
        throw new Error(`Failed to fetch Komga libraries: HTTP ${librariesResponse.status}`);
      }
      const libraries: Library[] = await safeJsonParse(librariesResponse);

      logger.info(`Komga: Triggering scan for ${libraries.length} libraries...`);

      await Promise.all(
        libraries.map(async (library) => {
          const komgaLibraryUrl = new URL(`/api/v1/libraries/${library.id}/scan`, baseKomgaUrl).href;
          logger.debug(`Komga: POST scanning library: ${library.id}`);
          const scanResponse = await fetch(komgaLibraryUrl, {
            method: 'POST',
            headers,
          });
          if (scanResponse.ok) {
            logger.info(`Komga: Successfully triggered scan for library "${library.id}"`);
          } else {
            logger.error(`Komga: Failed to trigger scan for library "${library.id}": HTTP ${scanResponse.status}`);
          }
        }),
      );
    } catch (err) {
      logger.error(`Komga: Library scan failed: ${err}`);
    }
  } else {
    logger.warn('Komga: Scan skipped because Komga is not fully configured or enabled');
  }
};

export const refreshMetadata = async (mangaName: string) => {
  const settings = await getCachedSettings();

  if (settings.komgaEnabled && settings.komgaHost && settings.komgaUser && settings.komgaPassword) {
    logger.info(`Komga: Refreshing metadata for series "${mangaName}"...`);
    try {
      const baseKomgaUrl = settings.komgaHost.toLowerCase().startsWith('http')
        ? settings.komgaHost
        : `http://${settings.komgaHost}`;
      const headers = {
        Authorization: `Basic ${Buffer.from(`${settings.komgaUser}:${settings.komgaPassword}`).toString('base64')}`,
      };
      const komgaSeriesUrl = new URL('/api/v1/series?unpaged=true', baseKomgaUrl).href;

      logger.debug(`Komga: Fetching series list from ${komgaSeriesUrl}`);
      const seriesResponse = await fetch(komgaSeriesUrl, { headers });
      if (!seriesResponse.ok) {
        throw new Error(`Failed to fetch Komga series list: HTTP ${seriesResponse.status}`);
      }
      const series: Series = await safeJsonParse(seriesResponse);

      const content = series.content.find((c) => c.name === sanitizer(mangaName));

      if (!content) {
        logger.warn(`Komga: Series "${mangaName}" not found in Komga. Skipping metadata refresh.`);
        return;
      }

      const komgaSeriesRefreshUrl = new URL(`/api/v1/series/${content.id}/metadata/refresh`, baseKomgaUrl).href;
      logger.debug(`Komga: POST series refresh for "${mangaName}" (Series ID: ${content.id})`);
      const refreshResponse = await fetch(komgaSeriesRefreshUrl, {
        method: 'POST',
        headers,
      });
      if (refreshResponse.ok) {
        logger.info(`Komga: Successfully triggered metadata refresh for series "${mangaName}"`);
      } else {
        logger.error(`Komga: Failed to refresh metadata for series "${mangaName}": HTTP ${refreshResponse.status}`);
      }
    } catch (err) {
      logger.error(`Komga: Failed to refresh metadata for series "${mangaName}": ${err}`);
    }
  }
};
