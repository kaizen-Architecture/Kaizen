import execa, { Options } from 'execa';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/logging';
import { sanitizer } from '../../utils';
/* eslint-disable import/no-cycle */
import { resetSourceFailure, trackSourceFailure } from './failure-tracking';
import { fetchMetadataFromMangaDex } from './metadata-fallback';
import { getMangaMetadataModular, applyModularFallbackToDetail } from './metadata-providers';

interface IOutput {
  result: Result[];
}

interface Result {
  source: string;
  mangal: Mangal;
}

interface Mangal {
  name: string;
  url: string;
  index: number;
  id: string;
  chapters: Chapter[];
  metadata: Metadata;
}

interface Chapter {
  name: string;
  url: string;
  index: number;
  id: string;
  volume: string;
}

interface Metadata {
  genres: string[];
  summary: string;
  staff: Staff;
  cover: Cover;
  bannerImage: string;
  tags: string[];
  characters: string[];
  status: string;
  startDate: MangaDate;
  endDate: MangaDate;
  synonyms: string[];
  chapters: number;
  urls: string[];
}

interface Cover {
  extraLarge: string;
  large: string;
  medium: string;
  color: string;
}

interface MangaDate {
  year: number;
  month: number;
  day: number;
}

interface Staff {
  story: string[];
  art: string[];
  translation: string[];
  lettering: string[];
}

interface ChapterFile {
  index: number;
  size: number;
  fileName: string;
}

export const getMangaPath = (libraryPath: string, title: string) => path.resolve(libraryPath, sanitizer(title));

const mangalActivePromises = new Map<string, Promise<any>>();
const mangalCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes TTL

export async function mangalExec(
  args: string[],
  options: Options = {},
  retries = 3,
  initialDelay = 5000,
): Promise<any> {
  const isReadOnly = args.includes('-j') && !args.includes('-d') && !args.includes('set') && !args.includes('update');
  const cacheKey = `${args.join(' ')}::${options.cwd || ''}`;

  if (isReadOnly) {
    const cached = mangalCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      logger.debug(`[CACHE HIT] Returning cached result for: mangal ${args.join(' ')}`);
      return cached.data;
    }

    const activePromise = mangalActivePromises.get(cacheKey);
    if (activePromise) {
      logger.debug(`[COALESCE] Reusing active in-flight promise for: mangal ${args.join(' ')}`);
      return activePromise;
    }
  }

  const execute = async () => {
    let delay = initialDelay;
    const sourceIndex = args.indexOf('--source');
    const source = sourceIndex !== -1 ? args[sourceIndex + 1] : undefined;

    for (let i = 0; i < retries; i++) {
      try {
        const result = await execa('mangal', args, options);
        if (source) {
          resetSourceFailure(source);
        }
        return {
          stdout: result.stdout,
          stderr: result.stderr,
          escapedCommand: result.escapedCommand,
        };
      } catch (err: any) {
        const errorText = `${err.message || ''} ${err.stdout || ''} ${err.stderr || ''}`;
        const isRateLimit = errorText.includes('429') || errorText.toLowerCase().includes('rate limit');

        if (isRateLimit && i < retries - 1) {
          logger.warn(
            `Rate limit hit (429) while running mangal ${args.join(' ')}. Retrying in ${delay / 1000}s... (Attempt ${
              i + 1
            }/${retries})`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2; // Exponential backoff
          continue;
        }

        if (source && !isRateLimit) {
          await trackSourceFailure(source, errorText);
        }

        throw err;
      }
    }
    throw new Error('Failed to execute mangal after retries');
  };

  if (isReadOnly) {
    const promise = execute();
    mangalActivePromises.set(cacheKey, promise);
    try {
      const result = await promise;
      mangalCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    } finally {
      mangalActivePromises.delete(cacheKey);
    }
  }

  return execute();
}

export const getAvailableSources = async () => {
  try {
    const { stdout, escapedCommand } = await mangalExec(['sources', 'list', '-r']);
    logger.info(`Get available sources with following command: ${escapedCommand}`);
    return (stdout as string)
      .split('\n')
      .map((s: string) => s.trim())
      .filter((s: string) => !!s);
  } catch (err) {
    logger.error(`Failed to get available sources. err: ${err}`);
  }

  return [];
};

interface MangalConfig {
  key: string;
  value: string[] | boolean | number | string;
  default: string[] | boolean | number | string;
  description: string;
  type: MangalConfigType;
}

enum MangalConfigType {
  Bool = 'bool',
  Int = 'int',
  String = 'string',
  StringArray = '[]string',
}

const excludedConfigs = [
  'downloader.chapter_name_template',
  'downloader.redownload_existing',
  'downloader.download_cover',
  'downloader.create_manga_dir',
  'downloader.create_volume_dir',
  'downloader.default_sources',
  'downloader.path',
  'downloader.stop_on_error',
  'metadata.comic_info_xml',
  'metadata.fetch_anilist',
  'metadata.series_json',
  'formats.use',
];

export const getMangalConfig = async (): Promise<MangalConfig[]> => {
  try {
    const { stdout, escapedCommand } = await mangalExec(['config', 'info', '-j']);
    logger.info(`Getting mangal config with following command: ${escapedCommand}`);
    const result = JSON.parse(stdout) as MangalConfig[];

    return result.filter((item) => !excludedConfigs.includes(item.key) && item.type !== '[]string');
  } catch (err) {
    logger.error(`Failed to get mangal config. err: ${err}`);
  }

  return [];
};

export const setMangalConfig = async (key: string, value: string | boolean | number | string[]) => {
  try {
    const { escapedCommand } = await mangalExec(['config', 'set', '--key', key, '--value', `${value}`]);
    logger.info(`set mangal config with following command: ${escapedCommand}`);
  } catch (err) {
    logger.error(`Failed to set mangal config. err: ${err}`);
  }
};

export const bindTitleToAnilistId = async (title: string, anilistId: string) => {
  try {
    const { escapedCommand } = await mangalExec(['inline', 'anilist', 'set', '--name', title, '--id', anilistId]);
    logger.info(`Bind manga to anilist id with following command: ${escapedCommand}`);
  } catch (err) {
    logger.error(`Failed to bind manga to anilist id. err: ${err}`);
  }
};

export const updateExistingMangaMetadata = async (libraryPath: string, title: string) => {
  try {
    const { escapedCommand } = await mangalExec([
      'inline',
      'anilist',
      'update',
      '--path',
      getMangaPath(libraryPath, title),
    ]);
    logger.info(`Updated existing manga metadata: ${escapedCommand}`);
  } catch (err) {
    logger.error(`Failed to update existing manga metadata. err: ${err}`);
  }
};

export const search = async (source: string | string[], keyword: string): Promise<IOutput> => {
  const searchSingleSource = async (s?: string): Promise<Result[]> => {
    const runSearch = async (includeAnilist: boolean): Promise<Result[]> => {
      const args = ['inline', '--query', keyword, '-j', '--chapters', 'all'];
      if (includeAnilist) {
        args.splice(1, 0, '--include-anilist-manga');
      }
      if (s && s !== 'all') {
        args.push('--source');
        args.push(s);
      }
      const { stdout, escapedCommand } = await mangalExec(args);
      logger.info(`Search manga with following command: ${escapedCommand}`);
      const parsed = JSON.parse(stdout) as IOutput;
      return parsed.result || [];
    };

    try {
      return await runSearch(true);
    } catch (err: any) {
      const errorText = `${err.message || ''} ${err.stdout || ''} ${err.stderr || ''}`;
      if (errorText.includes('no results found on Anilist') || errorText.includes('failed to search')) {
        logger.warn(`Anilist search failed for source ${s || 'all'}, retrying without Anilist...`);
        try {
          return await runSearch(false);
        } catch (retryErr) {
          logger.error(`Failed to search manga on source ${s || 'all'} even without Anilist. err: ${retryErr}`);
          return [];
        }
      }
      logger.error(`Failed to search manga on source ${s || 'all'}. err: ${err}`);
      return [];
    }
  }; // v1.2 - Final Anilist Fallback Fix

  try {
    let sourcesToSearch: string[] = [];

    if (source === 'all' || (Array.isArray(source) && source.includes('all'))) {
      sourcesToSearch = await getAvailableSources();
    } else if (Array.isArray(source)) {
      sourcesToSearch = source;
    } else {
      sourcesToSearch = [source];
    }

    const allResults = await Promise.all(sourcesToSearch.map((s) => searchSingleSource(s)));
    const results = allResults.flat();

    return {
      result: results,
    };
  } catch (err) {
    logger.error(`Failed to search manga globally. err: ${err}`);
  }

  return {
    result: [],
  };
};

export const getChaptersFromRemote = async (source: string, title: string): Promise<Chapter[]> => {
  const runGetChapters = async (includeAnilist: boolean, exact: boolean): Promise<Chapter[]> => {
    const args = ['inline', '--source', source, '--query', title, '--chapters', 'all', '-j'];
    if (includeAnilist) {
      args.splice(1, 0, '--include-anilist-manga');
    }
    if (exact) {
      args.push('--manga');
      args.push('exact');
    }
    const { stdout, escapedCommand } = await mangalExec(args);
    logger.info(`Get chapters with following command: ${escapedCommand}`);
    const output: IOutput = JSON.parse(stdout);
    if (
      output &&
      output.result.length === 1 &&
      output.result[0]?.mangal.chapters &&
      output.result[0]?.mangal.chapters.length > 0
    ) {
      return output.result[0].mangal.chapters.map((c) => ({ ...c, index: c.index - 1 }));
    }
    return [];
  };

  const trySearch = async (includeAnilist: boolean): Promise<Chapter[]> => {
    try {
      let chapters = await runGetChapters(includeAnilist, true);
      if (chapters.length === 0) {
        logger.warn(`Exact chapter search for "${title}" on ${source} returned no results. Trying fuzzy search...`);
        chapters = await runGetChapters(includeAnilist, false);
      }
      return chapters;
    } catch (err: any) {
      const errorText = `${err.message || ''} ${err.stdout || ''} ${err.stderr || ''}`;
      if (
        includeAnilist &&
        (errorText.includes('no results found on Anilist') || errorText.includes('failed to search'))
      ) {
        logger.warn(`Anilist chapter fetch failed for ${title}, retrying without Anilist...`);
        return trySearch(false);
      }
      throw err;
    }
  };

  try {
    return await trySearch(true);
  } catch (err) {
    logger.error(`Failed to get chapters from remote for ${title}. err: ${err}`);
  }

  return [];
};

export const getMangaMetadata = async (source: string, title: string): Promise<Metadata | undefined> => {
  return getMangaMetadataModular(source, title);
};

export const getMangaDetail = async (source: string, title: string): Promise<Mangal | undefined> => {
  const runGetDetail = async (includeAnilist: boolean): Promise<Mangal | undefined> => {
    const args = ['inline', '--source', source, '--query', title, '--manga', 'exact', '--chapters', 'all', '-j'];
    if (includeAnilist) {
      args.splice(1, 0, '--include-anilist-manga');
    }
    const { stdout, escapedCommand } = await mangalExec(args);
    logger.info(`Get manga detail with following command: ${escapedCommand}`);
    const output: IOutput = JSON.parse(stdout);
    if (output && output.result.length === 1) {
      return output.result[0].mangal;
    }
    return undefined;
  };

  try {
    const result = await runGetDetail(true);
    return await applyModularFallbackToDetail(source, title, result);
  } catch (err: any) {
    const errorText = `${err.message || ''} ${err.stdout || ''} ${err.stderr || ''}`;
    if (errorText.includes('no results found on Anilist') || errorText.includes('failed to search')) {
      logger.warn(`Anilist detail fetch failed for ${title}, retrying without Anilist...`);
      try {
        const retryResult = await runGetDetail(false);
        return applyModularFallbackToDetail(source, title, retryResult);
      } catch (retryErr) {
        logger.error(`Failed to get manga detail for ${title} even without Anilist. err: ${retryErr}`);
        return undefined;
      }
    }
    logger.error(err);
  }

  return undefined;
};

export const downloadChapter = async (
  title: string,
  source: string,
  chapterIndex: number | string,
  libraryPath: string,
  sourceTitle?: string,
): Promise<string> => {
  try {
    logger.info(`Downloading chapter #${chapterIndex} for ${title} from ${source}`);

    const runSearch = async (exact: boolean, queryText: string) => {
      const args = ['inline', '--source', source, '--query', queryText, '--chapters', 'all', '-j'];
      if (exact) {
        args.push('--manga');
        args.push('exact');
      }
      const { stdout } = await mangalExec(args);
      const data = JSON.parse(stdout);
      return data.result?.[0]?.mangal;
    };

    let usedExact = true;
    let currentQuery = sourceTitle || title;
    let manga = await runSearch(true, currentQuery);

    if (!manga || !manga.chapters || manga.chapters.length === 0) {
      logger.warn(`Exact search for "${currentQuery}" on ${source} returned no chapters. Trying fuzzy search...`);
      manga = await runSearch(false, currentQuery);
      usedExact = false;
    }

    // Super-fallback: If fuzzy search with full title fails, try with just the first 3 words
    if (!manga || !manga.chapters || manga.chapters.length === 0) {
      const words = currentQuery.split(' ');
      if (words.length > 3) {
        const shorterQuery = words.slice(0, 3).join(' ');
        logger.warn(`Fuzzy search for "${currentQuery}" failed. Trying shorter query: "${shorterQuery}"...`);
        manga = await runSearch(false, shorterQuery);
        usedExact = false;
        currentQuery = shorterQuery;
      }
    }

    if (!manga || !manga.chapters || manga.chapters.length === 0) {
      throw new Error(`Manga or chapters not found on source ${source} for "${currentQuery}". Available chapters: 0`);
    }

    // Find the chapter in the list. Mangal chapters are usually 1-indexed in the name/index field
    // but the CLI expects the position in the array (0-indexed) or the string representation.
    const targetIdxStr = String(chapterIndex);

    let chapterPos = manga.chapters.findIndex(
      (c: any) =>
        String(c.index) === targetIdxStr ||
        c.name === targetIdxStr ||
        c.name.includes(`#${targetIdxStr}`) ||
        c.name.includes(` ${targetIdxStr} `) ||
        c.name.endsWith(` ${targetIdxStr}`) ||
        c.name.startsWith(`${targetIdxStr} `),
    );

    // Fallback: Try removing leading zeros if search failed (e.g. searching for "05" instead of "5")
    if (chapterPos === -1 && targetIdxStr.startsWith('0')) {
      const strippedIdx = targetIdxStr.replace(/^0+/, '');
      logger.debug(`Chapter #${targetIdxStr} not found. Trying stripped version: #${strippedIdx}`);
      chapterPos = manga.chapters.findIndex(
        (c: any) =>
          String(c.index) === strippedIdx ||
          c.name.includes(`#${strippedIdx}`) ||
          c.name.includes(` ${strippedIdx} `) ||
          c.name.endsWith(` ${strippedIdx}`),
      );
    }

    // Fallback: If chapter #0 is requested but not found, check if chapter #1 exists instead (common 1-based indexing mismatch)
    if (chapterPos === -1 && targetIdxStr === '0') {
      logger.warn(`Chapter #0 requested but not found on ${source}. Falling back to check for chapter #1...`);
      chapterPos = manga.chapters.findIndex(
        (c: any) => String(c.index) === '1' || c.name.includes('#1') || c.name.includes(' 1 ') || c.name.endsWith(' 1'),
      );
      // If even chapter #1 isn't explicitly found but chapters exist, take the last element (mangal sorts newest first, so oldest is at the end)
      if (chapterPos === -1 && manga.chapters.length > 0) {
        logger.warn(`Taking the oldest available chapter as base chapter fallback.`);
        chapterPos = manga.chapters.length - 1;
      }
    }

    if (chapterPos === -1) {
      const availableIndices = manga.chapters
        .slice(0, 10)
        .map((c: any) => c.index)
        .join(', ');
      throw new Error(
        `Chapter #${chapterIndex} not found in the list returned by ${source}. Total chapters: ${manga.chapters.length}. First 10 indices: ${availableIndices}`,
      );
    }

    const downloadArgs = ['inline', '--source', source, '--query', currentQuery];

    // CRITICAL: Always include --manga flag to prevent "required flag(s) 'manga' not set"
    if (usedExact) {
      downloadArgs.push('--manga', 'exact');
    } else {
      // For fuzzy/fallback searches, select the first returned match (index 1) from the results
      downloadArgs.push('--manga', '1');
    }

    // Append chapters selector and download flag
    downloadArgs.push('--chapters', `${chapterPos}`, '-d');

    const { stdout, stderr, escapedCommand } = await mangalExec(downloadArgs, {
      cwd: libraryPath,
    });

    logger.info(`Download chapter with following command: ${escapedCommand}`);

    const result = stdout.trim();

    if (!result) {
      if (stderr.includes('invalid chapter filter pattern')) {
        throw new Error(`The source "${source}" does not support the chapter selection pattern used.`);
      }
      throw new Error(
        `Mangal finished but no file was downloaded. This usually means the chapter #${chapterIndex} was not found in the source "${source}".`,
      );
    }

    logger.info(`Downloaded chapter #${chapterIndex} for ${title}. Path: ${result}`);
    return result;
  } catch (err) {
    logger.error(`Failed to download the chapter #${chapterIndex} for ${title}. Err:\n${err}`);
    throw err;
  }
};

export const getChapterIndexFromFile = (chapterFile: string) => {
  const fileName = path.basename(chapterFile);

  // Pattern 1: Mangal default [index]
  const bracketMatch = /.*?\[(\d+)\].*/.exec(fileName);
  if (bracketMatch?.[1]) {
    return parseInt(bracketMatch[1], 10) - 1;
  }

  // Pattern 2: Common vXXcYY or cYY
  const cMatch = /.*[cC](\d+).*/.exec(fileName);
  if (cMatch?.[1]) {
    return parseInt(cMatch[1], 10) - 1;
  }

  // Pattern 3: Any trailing number before extension
  const trailingMatch = /.*?(\d+)\.\w+$/.exec(fileName);
  if (trailingMatch?.[1]) {
    return parseInt(trailingMatch[1], 10) - 1;
  }

  return undefined;
};

const shouldIncludeFile = (chapterFile: string) => {
  return path.extname(chapterFile) === '.cbz' && getChapterIndexFromFile(chapterFile) !== undefined;
};

export const getChapterFromLocal = async (chapterFile: string) => {
  try {
    const stat = await fs.stat(chapterFile);
    let createdAt = new Date();

    if (stat.birthtime.getTime() !== 0) {
      createdAt = stat.birthtime;
    } else if (stat.ctime.getTime() !== 0) {
      createdAt = stat.ctime;
    } else if (stat.mtime.getTime() !== 0) {
      createdAt = stat.mtime;
    }

    return {
      index: getChapterIndexFromFile(chapterFile)!,
      size: stat.size,
      createdAt,
      fileName: path.basename(chapterFile),
    };
  } catch (err) {
    logger.error(`Error occurred while getting stat from ${chapterFile}: ${err}`);
    throw err;
  }
};

export const getChaptersFromLocal = async (mangaDir: string): Promise<ChapterFile[]> => {
  await fs.mkdir(mangaDir, { recursive: true });
  const chapters = await fs.readdir(mangaDir);

  return Promise.all(
    chapters.filter(shouldIncludeFile).map((chapter) => getChapterFromLocal(path.resolve(mangaDir, chapter))),
  );
};

export const findMissingChapterFiles = async (mangaDir: string, source: string, title: string) => {
  const sources = await getAvailableSources();
  if (sources.indexOf(source) < 0) {
    logger.error(`Specified source: ${source} is not installed.`);
    throw new Error();
  }
  await fs.mkdir(mangaDir, { recursive: true });

  const localFiles = await fs.readdir(mangaDir);
  const localChapters = localFiles.filter(shouldIncludeFile);

  // Create a set of sanitized local names to detect duplicates regardless of index
  const localNames = new Set(localChapters.map((f) => sanitizer(f.replace(/\[\d+\]_/, '').replace('.cbz', ''))));
  const localIndices = new Set(localChapters.map(getChapterIndexFromFile));

  const remoteChapters = await getChaptersFromRemote(source, title);

  return remoteChapters
    .filter((remote) => {
      const remoteName = sanitizer(remote.name);
      // It's missing if:
      // 1. We don't have the index AND
      // 2. We don't have a file with a similar name
      const hasIndex = localIndices.has(remote.index);
      const hasName = localNames.has(remoteName);

      return !hasIndex && !hasName;
    })
    .map((r) => r.index);
};

export const createLibrary = async (libraryPath: string) => {
  await fs.mkdir(libraryPath, { recursive: true });
};

export const removeManga = async (mangaDir: string) => {
  await fs.rm(mangaDir, { recursive: true, force: true });
};

export const removeChapter = async (mangaDir: string, chapterFileName: string) => {
  await fs.rm(path.join(mangaDir, chapterFileName), { force: true });
};

export const clearCache = async () => {
  try {
    const { stdout, escapedCommand } = await mangalExec(['where', '--cache']);
    logger.info(`Getting mangal cache path with following command: ${escapedCommand}`);
    const cachedFiles = await fs.readdir(stdout);
    await Promise.all(
      cachedFiles
        .filter((cachedFile) => cachedFile.endsWith('json') && cachedFile.indexOf('anilist') < 0)
        .map(async (cachedJson) => fs.rm(path.join(stdout, cachedJson), { force: true })),
    );
  } catch (err) {
    logger.error(`Failed to remove mangal cache. err: ${err}`);
  }
};

export const getOutOfSyncChapters = async (mangaDir: string, source: string, title: string) => {
  const localChapters = await getChaptersFromLocal(mangaDir);
  const remoteChapters = await getChaptersFromRemote(source, title);
  if (remoteChapters.length === 0) {
    logger.info('Source may not be available. I will not mark any chapter for removal.');
    return [];
  }
  const remoteChaptersWithIndexSet = new Set(
    remoteChapters.map((r) => `${`[${String(r.index + 1).padStart(4, '0')}]_${sanitizer(r.name)}.cbz`}-${r.index + 1}`),
  );

  return localChapters.filter((l) => !remoteChaptersWithIndexSet.has(`${l.fileName}-${l.index + 1}`));
};
