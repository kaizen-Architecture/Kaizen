import path from 'path';
import fs from 'fs';
import os from 'os';
import execa from 'execa';
import { prisma } from '../../db/client';
import { getCachedSettings } from '../settings-cache';
import { logger } from '../../../utils/logging';
import { sanitizer } from '../../../utils';
import { safeJsonParse } from '../http';

interface Library {
  name: string;
  id: string;
}

interface Series {
  id: string;
  libraryId: string;
  name: string;
}

interface LoginResponse {
  token: string;
}

const getBaseUrl = (host: string) => {
  return host.toLowerCase().startsWith('http') ? host : `http://${host}`;
};

const getToken = async (baseKavitaUrl: string, username: string, password: string) => {
  const kavitaLoginUrl = new URL('/api/Account/login', baseKavitaUrl).href;
  const res = await fetch(kavitaLoginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      username,
      password,
    }),
  });

  if (!res.ok) {
    const textSnippet = await res.text().catch(() => '');
    throw new Error(`Kavita authentication failed HTTP ${res.status}: ${textSnippet.slice(0, 100)}`);
  }

  const response = await safeJsonParse<LoginResponse>(res);
  if (!response?.token) {
    throw new Error('Kavita authentication response did not contain a valid token');
  }

  return response.token;
};

export const testConnection = async () => {
  const settings = await getCachedSettings();
  if (!settings.kavitaEnabled || !settings.kavitaHost || !settings.kavitaUser || !settings.kavitaPassword) {
    return { status: 'unhealthy', message: 'Kavita is not fully configured' };
  }

  try {
    const baseUrl = getBaseUrl(settings.kavitaHost);
    const token = await getToken(baseUrl, settings.kavitaUser, settings.kavitaPassword);
    if (!token) throw new Error('Could not get token');

    return { status: 'healthy', message: 'Connected to Kavita successfully' };
  } catch (err) {
    return { status: 'unhealthy', message: `${err}` };
  }
};

export const injectMetadata = async (chapterId: number) => {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { manga: { include: { metadata: true, library: true } } },
  });

  if (!chapter) return;

  const mangaPath = path.join(chapter.manga.library.path, sanitizer(chapter.manga.title));
  const filePath = path.join(mangaPath, chapter.fileName);

  logger.debug(`Kavita: Attempting to inject metadata into ${filePath}`);

  let tempXmlPath = '';
  try {
    tempXmlPath = path.join(os.tmpdir(), `temp_comicinfo_${chapterId}.xml`);
    const comicInfo = `<?xml version="1.0"?>
<ComicInfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <Title>${chapter.fileName.replace('.cbz', '')}</Title>
  <Series>${chapter.manga.title}</Series>
  <Number>${chapter.index}</Number>
  <Summary>${chapter.manga.metadata.summary}</Summary>
  <Writer>${chapter.manga.metadata.authors.join(', ')}</Writer>
  <Genre>${chapter.manga.metadata.genres.join(', ')}</Genre>
  <Web>${chapter.manga.metadata.urls[0] || ''}</Web>
  <LanguageISO>${chapter.manga.metadata.summary.match(/[áéíóúñ]/i) ? 'es' : 'en'}</LanguageISO>
</ComicInfo>`;

    fs.writeFileSync(tempXmlPath, comicInfo, 'utf8');
    let scriptPath = path.join(__dirname, 'kavita_inject.py');
    if (!fs.existsSync(scriptPath)) {
      const prodPath = path.resolve(process.cwd(), 'dist/server/utils/integration/kavita_inject.py');
      if (fs.existsSync(prodPath)) {
        scriptPath = prodPath;
      } else {
        const devPath = path.resolve(process.cwd(), 'src/server/utils/integration/kavita_inject.py');
        if (fs.existsSync(devPath)) {
          scriptPath = devPath;
        }
      }
    }
    // Fast zip integrity check: CBZ must start with the PK magic bytes (0x50 0x4B)
    if (!fs.existsSync(filePath)) {
      throw new Error(`CBZ file not found on disk: ${filePath}`);
    }
    const fd = fs.openSync(filePath, 'r');
    const magic = Buffer.alloc(2);
    fs.readSync(fd, magic, 0, 2, 0);
    fs.closeSync(fd);
    if (magic[0] !== 0x50 || magic[1] !== 0x4b) {
      throw new Error(`CBZ file is corrupt or not a valid zip (bad magic bytes): ${filePath}`);
    }

    await execa('python3', [scriptPath, filePath, tempXmlPath]);

    await prisma.chapter.update({
      where: { id: chapterId },
      data: {
        metadataInjected: true,
        metadataFailed: false,
        metadataError: null,
      },
    });

    logger.info(`Kavita: Successfully injected metadata into ${chapter.fileName}`);
  } catch (err) {
    logger.error(`Kavita: Failed to inject metadata into ${filePath}. Error: ${err}`);
    try {
      await prisma.chapter.update({
        where: { id: chapterId },
        data: {
          metadataInjected: false,
          metadataFailed: true,
          metadataError: (err as Error).message || String(err),
        },
      });
    } catch (updateErr) {
      logger.error(`Kavita: Failed to save error status for chapter ${chapterId}: ${updateErr}`);
    }
  } finally {
    if (tempXmlPath && fs.existsSync(tempXmlPath)) {
      try {
        fs.unlinkSync(tempXmlPath);
      } catch (unlinkErr) {
        logger.error(`Kavita: Failed to delete temp XML file: ${unlinkErr}`);
      }
    }
  }
};

export const scanLibrary = async () => {
  const settings = await getCachedSettings();

  if (settings.kavitaEnabled && settings.kavitaHost && settings.kavitaUser && settings.kavitaPassword) {
    logger.info(`Kavita: Starting library scan... Host: ${settings.kavitaHost}`);
    try {
      const baseKavitaUrl = getBaseUrl(settings.kavitaHost);
      const token = await getToken(baseKavitaUrl, settings.kavitaUser, settings.kavitaPassword);
      if (!token) {
        throw new Error('Failed to retrieve authentication token from Kavita');
      }

      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      const kavitaLibrariesUrl = new URL('/api/Library', baseKavitaUrl).href;
      logger.debug(`Kavita: Fetching libraries from ${kavitaLibrariesUrl}`);
      const librariesResponse = await fetch(kavitaLibrariesUrl, { headers });
      if (!librariesResponse.ok) {
        throw new Error(`Failed to fetch Kavita libraries: HTTP ${librariesResponse.status}`);
      }
      const libraries: Library[] = await safeJsonParse(librariesResponse);

      const includedLibraries = settings.kavitaLibraries;
      const targetLibraries = libraries.filter((library) =>
        includedLibraries.length > 0 ? includedLibraries.includes(library.name) : true,
      );

      logger.info(
        `Kavita: Triggering scan for ${targetLibraries.length} libraries: ${targetLibraries
          .map((l) => l.name)
          .join(', ')}`,
      );

      await Promise.all(
        targetLibraries.map(async (library) => {
          const kavitaLibraryUrl = new URL(`/api/Library/scan?libraryId=${library.id}&force=false`, baseKavitaUrl).href;
          logger.debug(`Kavita: POST scanning library: ${library.name} (${library.id})`);
          const scanResponse = await fetch(kavitaLibraryUrl, {
            method: 'POST',
            headers,
          });
          if (scanResponse.ok) {
            logger.info(`Kavita: Successfully triggered scan for library "${library.name}"`);
          } else {
            logger.error(`Kavita: Failed to trigger scan for library "${library.name}": HTTP ${scanResponse.status}`);
          }
        }),
      );
    } catch (err) {
      logger.error(`Kavita: Library scan failed: ${err}`);
    }
  } else {
    logger.warn('Kavita: Scan skipped because Kavita is not fully configured or enabled');
  }
};

export const refreshMetadata = async (mangaName: string) => {
  const settings = await getCachedSettings();

  if (settings.kavitaEnabled && settings.kavitaHost && settings.kavitaUser && settings.kavitaPassword) {
    logger.info(`Kavita: Refreshing metadata for series "${mangaName}"...`);
    try {
      const baseKavitaUrl = getBaseUrl(settings.kavitaHost);
      const token = await getToken(baseKavitaUrl, settings.kavitaUser, settings.kavitaPassword);
      if (!token) {
        throw new Error('Failed to retrieve authentication token from Kavita');
      }

      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      const kavitaSeriesUrl = new URL('/api/Series', baseKavitaUrl).href;
      const seriesResponse = await fetch(kavitaSeriesUrl, {
        method: 'POST',
        body: JSON.stringify({}),
        headers,
      });
      if (!seriesResponse.ok) {
        throw new Error(`Failed to fetch Kavita series list: HTTP ${seriesResponse.status}`);
      }
      const series: Series[] = await safeJsonParse(seriesResponse);

      const content = series.find((c) => c.name === mangaName);

      if (!content) {
        logger.warn(`Kavita: Series "${mangaName}" not found in Kavita. Skipping metadata refresh.`);
        return;
      }

      const kavitaSeriesRefreshUrl = new URL(`/api/Series/scan`, baseKavitaUrl).href;
      logger.debug(`Kavita: POST series scan for "${mangaName}" (Series ID: ${content.id})`);
      const refreshResponse = await fetch(kavitaSeriesRefreshUrl, {
        method: 'POST',
        body: JSON.stringify({
          libraryId: content.libraryId,
          seriesId: content.id,
          forceUpdate: true,
        }),
        headers,
      });
      if (refreshResponse.ok) {
        logger.info(`Kavita: Successfully triggered metadata refresh for series "${mangaName}"`);
      } else {
        logger.error(`Kavita: Failed to refresh metadata for series "${mangaName}": HTTP ${refreshResponse.status}`);
      }
    } catch (err) {
      logger.error(`Kavita: Failed to refresh metadata for series "${mangaName}": ${err}`);
    }
  }
};
