import execa, { Options } from 'execa';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '../../utils/logging';
import { sanitizer } from '../../utils';
/* eslint-disable no-await-in-loop, @typescript-eslint/no-loop-func, no-promise-executor-return, no-continue */
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

export const getMangaPath = (libraryPath: string, title: string): string => {
  const sanitized = path.resolve(libraryPath, sanitizer(title));
  if (fsSync.existsSync(sanitized)) {
    return sanitized;
  }
  const raw = path.resolve(libraryPath, title);
  if (fsSync.existsSync(raw)) {
    return raw;
  }
  if (fsSync.existsSync(libraryPath)) {
    try {
      const subdirs = fsSync.readdirSync(libraryPath);
      const targetSanitized = sanitizer(title).toLowerCase();
      const targetTitle = title.toLowerCase();
      const matched = subdirs.find(
        (d) => d.toLowerCase() === targetTitle || sanitizer(d).toLowerCase() === targetSanitized,
      );
      if (matched) {
        return path.resolve(libraryPath, matched);
      }
    } catch {
      // ignore
    }
  }
  return sanitized;
};

const mangalActivePromises = new Map<string, Promise<any>>();
const mangalCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes TTL

export const clearMangalCache = () => {
  mangalCache.clear();
  mangalActivePromises.clear();
  logger.info('[Cache] In-memory mangalCache cleared.');
};


class ConcurrencyQueue {
  private concurrency: number;
  private running = 0;
  private queue: Array<{ resolve: () => void; reject: (err: any) => void }> = [];

  constructor(concurrency = 3) {
    this.concurrency = concurrency;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= this.concurrency) {
      await new Promise<void>((resolve, reject) => {
        this.queue.push({ resolve, reject });
      });
    }
    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      const next = this.queue.shift();
      if (next) {
        next.resolve();
      }
    }
  }
}

const mangalQueue = new ConcurrencyQueue(3);

export type ScraperCore = 'mangal' | 'kaizen-mangal';

let runtimeDefaultScraperCore: ScraperCore | null = null;

export const setRuntimeDefaultScraperCore = (core: ScraperCore) => {
  runtimeDefaultScraperCore = core;
};

export const resolveScraperBin = (binOverride?: ScraperCore | string | null): ScraperCore => {
  const candidate = (
    binOverride ||
    process.env.KAIZEN_SCRAPER_BIN ||
    runtimeDefaultScraperCore ||
    'kaizen-mangal'
  ).trim();
  return candidate === 'mangal' ? 'mangal' : 'kaizen-mangal';
};

export async function mangalExec(
  args: string[],
  options: Options = {},
  retries = 3,
  initialDelay = 5000,
  binOverride?: ScraperCore | string | null,
): Promise<any> {
  const bin = resolveScraperBin(binOverride);
  const isReadOnly = args.includes('-j') && !args.includes('-d') && !args.includes('set') && !args.includes('update');
  const cacheKey = `${bin}::${args.join(' ')}::${options.cwd || ''}`;

  if (isReadOnly) {
    const cached = mangalCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      logger.debug(`[CACHE HIT] Returning cached result for: ${bin} ${args.join(' ')}`);
      return cached.data;
    }

    const activePromise = mangalActivePromises.get(cacheKey);
    if (activePromise) {
      logger.debug(`[COALESCE] Reusing active in-flight promise for: ${bin} ${args.join(' ')}`);
      return activePromise;
    }
  }

  const execute = async () => {
    return mangalQueue.run(async () => {
      let delay = initialDelay;
      const sourceIndex = args.indexOf('--source');
      const source = sourceIndex !== -1 ? args[sourceIndex + 1] : undefined;

      // Create a unique temporary directory for this specific scraper process to avoid concurrency conflicts and "file exists" panics
      const jobTmpDir = path.join(os.tmpdir(), `${bin}-${Math.random().toString(36).slice(2)}`);
      try {
        await fs.mkdir(jobTmpDir, { recursive: true });
      } catch (e) {
        // Ignored
      }

      const jobOptions: Options = {
        ...options,
        env: {
          ...process.env,
          ...options?.env,
          TMPDIR: jobTmpDir,
        },
      };

      for (let i = 0; i < retries; i++) {
        try {
          const result = await execa(bin, args, jobOptions);
          if (source) {
            resetSourceFailure(source);
          }
          // Cleanup the job-specific temp dir after success
          try {
            await fs.rm(jobTmpDir, { recursive: true, force: true });
          } catch (e) {
            // Ignored
          }
          return {
            stdout: result.stdout,
            stderr: result.stderr,
            escapedCommand: result.escapedCommand,
          };
        } catch (err: any) {
          const errorText = `${err.message || ''} ${err.stdout || ''} ${err.stderr || ''}`;

          // RFC 0001 Section 6.F.4: when kaizen-mangal's per-domain circuit breaker is open,
          // do NOT retry and do NOT call trackSourceFailure() (cooling down != dead source).
          const isBreakerOpen =
            errorText.includes('[kaizen-mangal:breaker-open]') || err?.exitCode === 75;
          if (isBreakerOpen) {
            logger.warn(
              `[${bin}] Circuit breaker open for source ${source || 'unknown'} — skipping retries and source failure tracking.`,
            );
            try {
              await fs.rm(jobTmpDir, { recursive: true, force: true });
            } catch (e) {
              // Ignored
            }
            throw err;
          }

          const isRetryable =
            errorText.includes('429') ||
            errorText.toLowerCase().includes('rate limit') ||
            errorText.includes('500') ||
            errorText.includes('502') ||
            errorText.includes('503') ||
            errorText.includes('504') ||
            errorText.includes('522') ||
            errorText.toLowerCase().includes('timeout') ||
            errorText.toLowerCase().includes('connection refused');

          // For 429 rate limits, do not loop retries infinitely to avoid high CPU usage
          const effectiveRetries = errorText.includes('429') ? 1 : retries;

          if (isRetryable && i < effectiveRetries - 1) {
            logger.warn(
              `Transient error hit while running ${bin} ${args.join(' ')}. Retrying in ${delay / 1000}s... (Attempt ${
                i + 1
              }/${effectiveRetries})`,
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay *= 2; // Exponential backoff
            continue;
          }

          if (source && !isRetryable) {
            await trackSourceFailure(source, errorText);
          }

          // Cleanup the job-specific temp dir on failure
          try {
            await fs.rm(jobTmpDir, { recursive: true, force: true });
          } catch (e) {
            // Ignored
          }

          throw err;
        }
      }

      // Final cleanup fallback
      try {
        await fs.rm(jobTmpDir, { recursive: true, force: true });
      } catch (e) {
        // Ignored
      }
      throw new Error(`Failed to execute ${bin} after retries`);
    });
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
  'mangadex.language',
  'mangadex.nsfw',
  'mangadex.show_unavailable_chapters',
  'cli.colored',
  'icons.variant',
  'reader.browser',
  'reader.cbz',
  'reader.folder',
  'reader.pdf',
  'reader.plain',
  'reader.read_in_browser',
  'reader.zip',
  'tui.item_spacing',
  'tui.read_on_enter',
  'tui.reverse_chapters',
  'tui.search_prompt',
  'tui.show_downloaded_path',
  'tui.show_urls',
  'installer.branch',
  'installer.repo',
  'installer.user',
  'gen.author',
  'history.save_on_download',
  'history.save_on_read',
  'search.show_query_suggestions',
  'mini.search_limit',
];

export const getMangalConfig = async (scraperCore?: ScraperCore): Promise<MangalConfig[]> => {
  try {
    const { stdout, escapedCommand } = await mangalExec(['config', 'info', '-j'], {}, 3, 5000, scraperCore);
    logger.info(`Getting mangal config with following command: ${escapedCommand}`);
    const result = JSON.parse(stdout) as MangalConfig[];

    return result.filter((item) => !excludedConfigs.includes(item.key) && item.type !== '[]string');
  } catch (err) {
    logger.error(`Failed to get mangal config. err: ${err}`);
  }

  return [];
};

export const setMangalConfig = async (
  key: string,
  value: string | boolean | number | string[],
  scraperCore?: ScraperCore,
) => {
  try {
    const { escapedCommand } = await mangalExec(
      ['config', 'set', '--key', key, '--value', `${value}`],
      {},
      3,
      5000,
      scraperCore,
    );
    logger.info(`set mangal config with following command: ${escapedCommand}`);
    // Persist configuration to disk file immediately so it survives restarts
    await mangalExec(['config', 'write'], {}, 3, 5000, scraperCore).catch(() => {});
  } catch (err) {
    logger.error(`Failed to set mangal config. err: ${err}`);
    throw err;
  }
};

export const ensureMangalDefaults = async () => {
  try {
    const { stdout } = await mangalExec(['config', 'get', '-k', 'formats.use']).catch(() => ({ stdout: '' }));
    const current = (stdout || '').trim();
    if (!current || current === 'pdf' || current === 'plain') {
      logger.info(`[Mangal Startup] Initializing default formats.use to 'cbz' (current: '${current || 'none'}')`);
      await setMangalConfig('formats.use', 'cbz');
    }
  } catch (err) {
    logger.warn(`[Mangal Startup] Could not verify/initialize Mangal formats default: ${err}`);
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

export const search = async (
  source: string | string[],
  keyword: string,
  scraperCore?: ScraperCore,
): Promise<IOutput> => {
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
      const { stdout, escapedCommand } = await mangalExec(args, {}, 3, 5000, scraperCore);
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

export const getChaptersFromRemote = async (
  source: string,
  title: string,
  scraperCore?: ScraperCore,
): Promise<Chapter[]> => {
  const runGetChapters = async (includeAnilist: boolean, exact: boolean): Promise<Chapter[]> => {
    const args = ['inline', '--source', source, '--query', title, '--chapters', 'all', '-j'];
    if (includeAnilist) {
      args.splice(1, 0, '--include-anilist-manga');
    }
    if (exact) {
      args.push('--manga');
      args.push('exact');
    }
    const { stdout, escapedCommand } = await mangalExec(args, {}, 3, 5000, scraperCore);
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

export const getMangaDetail = async (
  source: string,
  title: string,
  scraperCore?: ScraperCore,
): Promise<Mangal | undefined> => {
  const runGetDetail = async (includeAnilist: boolean): Promise<Mangal | undefined> => {
    const args = ['inline', '--source', source, '--query', title, '--manga', 'exact', '--chapters', 'all', '-j'];
    if (includeAnilist) {
      args.splice(1, 0, '--include-anilist-manga');
    }
    const { stdout, escapedCommand } = await mangalExec(args, {}, 3, 5000, scraperCore);
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
  scraperCore?: ScraperCore,
): Promise<string> => {
  try {
    logger.info(
      `Downloading chapter #${chapterIndex} for ${title} from ${source} [core=${resolveScraperBin(scraperCore)}]`,
    );

    const runSearch = async (exact: boolean, queryText: string) => {
      const args = ['inline', '--source', source, '--query', queryText, '--chapters', 'all', '-j'];
      if (exact) {
        args.push('--manga');
        args.push('exact');
      }
      const { stdout } = await mangalExec(args, {}, 3, 5000, scraperCore);
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
    const targetIdxNum = Number(chapterIndex);

    // Guard against out-of-order fuzzy search mismatches:
    // If fuzzy search matched a completely different series with fewer chapters than requested, abort immediately
    if (!usedExact && manga.chapters.length > 0 && targetIdxNum >= manga.chapters.length) {
      throw new Error(
        `Fuzzy search on ${source} returned "${manga.name || currentQuery}" with only ${manga.chapters.length} chapters, but chapter #${chapterIndex} (index ${targetIdxNum}) was requested. Aborting download to prevent corrupt/mismatched files.`,
      );
    }

    let chapterPos = manga.chapters.findIndex(
      (c: any) =>
        (Number(c.index) - 1) === targetIdxNum ||
        c.name === String(targetIdxNum + 1) ||
        c.name.includes(`#${String(targetIdxNum + 1)}`) ||
        c.name.includes(` ${String(targetIdxNum + 1)} `) ||
        c.name.endsWith(` ${String(targetIdxNum + 1)}`) ||
        c.name.startsWith(`${String(targetIdxNum + 1)} `),
    );

    // Fallback: Try exact match without index subtraction (for legacy or non-standard sources)
    if (chapterPos === -1) {
      chapterPos = manga.chapters.findIndex(
        (c: any) =>
          String(c.index) === targetIdxStr ||
          c.name === targetIdxStr ||
          c.name.includes(`#${targetIdxStr}`) ||
          c.name.includes(` ${targetIdxStr} `) ||
          c.name.endsWith(` ${targetIdxStr}`) ||
          c.name.startsWith(`${targetIdxStr} `),
      );
    }

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
    downloadArgs.push('--chapters', `${chapterPos}`, '-d', '--format', 'cbz');

    const { stdout, stderr, escapedCommand } = await mangalExec(
      downloadArgs,
      {
        cwd: libraryPath,
      },
      3,
      5000,
      scraperCore,
    );

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

export const extractChapterNumberToken = (rawName: string): string | null => {
  const cleaned = rawName
    .replace(/^\[\d+\]_?/, '')
    .replace(/\.cbz$/i, '')
    .trim();

  const match =
    /(?:chapter|cap[ií]tulo|ch\.?|ep(?:isode)?\.?)[\s_#-]*(\d+(?:[._]\d+)?)/i.exec(cleaned) ||
    /^(\d+(?:[._]\d+)?)(?:[\s_:-]|$)/.exec(cleaned);

  if (!match?.[1]) {
    return null;
  }

  const normalized = match[1].replace('_', '.');
  const parts = normalized.split('.');
  const whole = String(parseInt(parts[0]!, 10));
  if (Number.isNaN(Number(whole))) {
    return null;
  }
  return parts.length > 1 ? `${whole}.${parts.slice(1).join('.')}` : whole;
};

/**
 * Computes the real highest whole chapter number from a list of chapters (e.g. 254 from "Chapter 254"),
 * avoiding inflation from split .1/.2 sub-chapters (where chapters.length may be 270 while the latest chapter is 254).
 */
export const getEffectiveMaxChapter = (chapters: Array<{ name?: string; fileName?: string; index?: number }>): number => {
  if (!chapters || chapters.length === 0) return 0;
  let maxWhole = 0;
  for (const ch of chapters) {
    const raw = ch.name || ch.fileName || '';
    const token = extractChapterNumberToken(raw);
    if (token) {
      const whole = parseInt(token.split('.')[0]!, 10);
      if (!Number.isNaN(whole) && whole > maxWhole) {
        maxWhole = whole;
      }
    }
  }
  return maxWhole > 0 ? maxWhole : chapters.length;
};

/**
 * Normalizes shifted positional prefixes so chapter indices stay strictly contiguous without gaps:
 * - Removes duplicate shifted downloads (e.g. `[0179]_Chapter_160.cbz` when `[0160]_Chapter_160_(RESUMED).cbz` already exists).
 * - Compacts any positional jump between consecutive whole chapters (`prevBracket + (currChapterNum - prevChapterNum)`),
 *   fixing both 0-to-shifted jumps (Dungeon Odyssey: `[0167]_Chapter_167` -> `[0187]_Chapter_168` becomes `[0168]_Chapter_168`)
 *   and shifted-to-more-shifted jumps (Murim Login: `[0265]_Chapter_250` -> `[0267]_Chapter_251` becomes `[0266]_Chapter_251`).
 */
export const normalizeShiftedChaptersInDir = async (mangaDir: string) => {
  try {
    await fs.mkdir(mangaDir, { recursive: true });
    const files = (await fs.readdir(mangaDir)).filter((f) => path.extname(f) === '.cbz');

    interface ParsedFile {
      fileName: string;
      rest: string;
      bracketNum: number;
      token: string | null;
      wholeNum: number | null;
      isWhole: boolean;
    }

    const parsed: ParsedFile[] = [];
    for (const f of files) {
      const m = /^\[(\d+)\]_(.*)$/.exec(f);
      if (!m) continue;
      const bracketNum = parseInt(m[1]!, 10);
      const token = extractChapterNumberToken(f);
      const isWhole = Boolean(token && /^\d+$/.test(token));
      const wholeNum = isWhole ? parseInt(token!, 10) : null;
      parsed.push({
        fileName: f,
        rest: m[2]!,
        bracketNum,
        token,
        wholeNum,
        isWhole,
      });
    }

    // 1. Deduplicate files that share the exact same canonical chapter token (keep the lower/older bracketNum)
    parsed.sort((a, b) => a.bracketNum - b.bracketNum);
    const seenTokens = new Map<string, ParsedFile>();
    const kept: ParsedFile[] = [];

    for (const item of parsed) {
      if (item.token) {
        const existing = seenTokens.get(item.token);
        if (existing) {
          logger.info(
            `[Canonical Index Normalizer] Removing duplicate chapter "${item.fileName}" (chapter ${item.token} already present as "${existing.fileName}")`,
          );
          await fs.unlink(path.join(mangaDir, item.fileName)).catch(() => {});
          continue;
        }
        seenTokens.set(item.token, item);
      }
      kept.push(item);
    }

    // 2. Compact unexpected positional gaps between consecutive whole chapters
    kept.sort((a, b) => a.bracketNum - b.bracketNum);
    const takenBrackets = new Set<number>(kept.map((k) => k.bracketNum));

    let prevWhole: ParsedFile | null = null;
    for (const item of kept) {
      if (!item.isWhole || item.wholeNum === null) {
        prevWhole = null; // do not compact across decimal sub-chapters
        continue;
      }

      if (prevWhole && prevWhole.wholeNum !== null) {
        const chapterDelta = item.wholeNum - prevWhole.wholeNum;
        const bracketDelta = item.bracketNum - prevWhole.bracketNum;
        // If consecutive chapters (or small gap) jumped by more bracket slots than chapter numbers, compact the gap
        if (chapterDelta > 0 && bracketDelta > chapterDelta) {
          const desiredBracket = prevWhole.bracketNum + chapterDelta;
          if (!takenBrackets.has(desiredBracket)) {
            const desiredPrefix = `[${String(desiredBracket).padStart(4, '0')}]_`;
            const newFileName = `${desiredPrefix}${item.rest}`;
            logger.info(
              `[Canonical Index Normalizer] Compacting gap "${item.fileName}" -> "${newFileName}" (follows "${prevWhole.fileName}")`,
            );
            try {
              await fs.rename(path.join(mangaDir, item.fileName), path.join(mangaDir, newFileName));
              takenBrackets.delete(item.bracketNum);
              takenBrackets.add(desiredBracket);
              item.bracketNum = desiredBracket;
              item.fileName = newFileName;
            } catch (err) {
              logger.warn(`[Canonical Index Normalizer] Could not rename "${item.fileName}": ${err}`);
            }
          }
        }
      }

      prevWhole = item;
    }
  } catch (err) {
    logger.warn(`[Canonical Index Normalizer] Directory scan warning for ${mangaDir}: ${err}`);
  }
};

export const findMissingChapterFiles = async (
  mangaDir: string,
  source: string,
  title: string,
  scraperCore?: ScraperCore,
) => {
  const sources = await getAvailableSources();
  if (sources.indexOf(source) < 0) {
    logger.error(`Specified source: ${source} is not installed.`);
    throw new Error();
  }
  await fs.mkdir(mangaDir, { recursive: true });

  const localFiles = await fs.readdir(mangaDir);
  const localChapters = localFiles.filter(shouldIncludeFile);

  // Create sets of sanitized local names, indices, and canonical chapter numbers (e.g. "160" from "[0160]_Chapter_160_(RESUMED).cbz")
  const localNames = new Set(localChapters.map((f) => sanitizer(f.replace(/\[\d+\]_/, '').replace('.cbz', ''))));
  const localIndices = new Set(localChapters.map(getChapterIndexFromFile));
  const localChapterTokens = new Set<string>();
  let maxLocalWholeChapter = -1;

  for (const f of localChapters) {
    const token = extractChapterNumberToken(f);
    if (token) {
      localChapterTokens.add(token);
      if (/^\d+$/.test(token)) {
        const num = parseInt(token, 10);
        if (num > maxLocalWholeChapter) {
          maxLocalWholeChapter = num;
        }
      }
    }
  }

  const remoteChapters = await getChaptersFromRemote(source, title, scraperCore);

  return remoteChapters
    .filter((remote) => {
      const remoteName = sanitizer(remote.name);
      const remoteToken = extractChapterNumberToken(remote.name);

      // 1. If we already have a local file with the exact sanitized name or the same canonical chapter number (e.g. Chapter 160 vs Chapter 160 (RESUMED)), skip it
      if (localNames.has(remoteName)) {
        return false;
      }
      if (remoteToken && localChapterTokens.has(remoteToken)) {
        return false;
      }

      // 2. If the remote chapter has a whole chapter number strictly greater than our highest local chapter (e.g. 168 > 167), it is definitely missing
      if (remoteToken && /^\d+$/.test(remoteToken) && maxLocalWholeChapter >= 0) {
        const remoteNum = parseInt(remoteToken, 10);
        if (remoteNum > maxLocalWholeChapter) {
          return true;
        }
      }

      // 3. Fallback for non-numbered chapters or earlier sub-chapters: check positional index
      const hasIndex = localIndices.has(remote.index);
      return !hasIndex;
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
  clearMangalCache();
  const clearForBin = async (bin: ScraperCore) => {
    try {
      const { stdout, escapedCommand } = await mangalExec(['where', '--cache'], {}, 1, 1000, bin);
      logger.info(`Getting ${bin} cache path with following command: ${escapedCommand}`);
      const cacheDir = stdout.trim();
      if (!cacheDir) return;
      const cachedFiles = await fs.readdir(cacheDir).catch(() => [] as string[]);
      await Promise.all(
        cachedFiles
          .filter((cachedFile) => cachedFile.indexOf('anilist') < 0)
          .map(async (cachedItem) => fs.rm(path.join(cacheDir, cachedItem), { recursive: true, force: true })),
      );
      logger.info(`[Cache] ${bin} disk cache cleared successfully.`);
    } catch (err) {
      if (bin === 'mangal') {
        logger.error(`Failed to remove mangal cache. err: ${err}`);
      } else {
        logger.debug(`[Cache] Skipping ${bin} cache cleanup (binary unavailable or empty): ${err}`);
      }
    }
  };
  await Promise.all([clearForBin('mangal'), clearForBin('kaizen-mangal')]);
};

export const getOutOfSyncChapters = async (
  mangaDir: string,
  source: string,
  title: string,
  scraperCore?: ScraperCore,
) => {
  const localChapters = await getChaptersFromLocal(mangaDir);
  const remoteChapters = await getChaptersFromRemote(source, title, scraperCore);
  if (remoteChapters.length === 0) {
    logger.info('Source may not be available. I will not mark any chapter for removal.');
    return [];
  }
  const remoteChaptersWithIndexSet = new Set(
    remoteChapters.map((r) => `${`[${String(r.index + 1).padStart(4, '0')}]_${sanitizer(r.name)}.cbz`}-${r.index + 1}`),
  );
  const remoteTokensSet = new Set(
    remoteChapters.map((r) => extractChapterNumberToken(r.name)).filter((t): t is string => !!t),
  );

  return localChapters.filter((l) => {
    if (remoteChaptersWithIndexSet.has(`${l.fileName}-${l.index + 1}`)) {
      return false;
    }
    const localToken = extractChapterNumberToken(l.fileName);
    if (localToken && remoteTokensSet.has(localToken)) {
      return false;
    }
    return true;
  });
};

export interface KaizenMangalValidationResult {
  valid: boolean;
  name: string;
  errors: Array<{ kind: string; message: string; line?: number }>;
  missing_functions: string[];
  uses_headless: boolean;
}

/**
 * Validates a Lua scraper file using `kaizen-mangal sources validate <file> --json`.
 * Returns `null` if `kaizen-mangal` is not installed so callers can fall back to legacy validation.
 */
export const validateLuaSourceWithKaizenMangal = async (
  filePath: string,
): Promise<KaizenMangalValidationResult | null> => {
  try {
    const res = await execa('kaizen-mangal', ['sources', 'validate', filePath, '--json'], {
      reject: false,
      timeout: 15000,
    });
    const raw = (res.stdout || '').trim();
    if (!raw.startsWith('{')) {
      return null;
    }
    return JSON.parse(raw) as KaizenMangalValidationResult;
  } catch {
    return null;
  }
};

export const EXPECTED_CORE_CONTRACT_VERSION = 1;

export interface CoreUpdateCheckResult {
  checkedAt: string;
  installedCoreVersion: string | null;
  installedContractVersion: number | null;
  latestCoreVersion: string | null;
  coreUpdateAvailable: boolean;
  coreReleaseUrl: string | null;
  corePublishedAt: string | null;
  coreChangelog: string | null;
  currentKaizenVersion: string;
  latestKaizenVersion: string | null;
  kaizenUpdateAvailable: boolean;
  kaizenReleaseUrl: string | null;
  expectedContractVersion: number;
  contractCompatible: boolean;
  compatibilityStatus: 'up_to_date' | 'core_update_compatible' | 'kaizen_update_recommended' | 'contract_mismatch';
  compatibilityMessage: string;
}

let cachedCoreUpdateResult: CoreUpdateCheckResult | null = null;
let lastCoreUpdateCheckAt = 0;
const CORE_UPDATE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes cache for UI calls
let lastNotifiedCoreVersion: string | null = null;
let periodicCoreCheckStarted = false;

const isSemverNewer = (current: string | null, latest: string | null): boolean => {
  if (!current || !latest) return false;
  const parse = (v: string) =>
    v
      .replace(/^v/i, '')
      .split('-')[0]!
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const [cMaj = 0, cMin = 0, cPat = 0] = parse(current);
  const [lMaj = 0, lMin = 0, lPat = 0] = parse(latest);
  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPat > cPat;
};

export const checkCoreVersionAndCompatibility = async (force = false): Promise<CoreUpdateCheckResult> => {
  const now = Date.now();
  if (!force && cachedCoreUpdateResult && now - lastCoreUpdateCheckAt < CORE_UPDATE_CACHE_TTL_MS) {
    return cachedCoreUpdateResult;
  }

  /* eslint-disable-next-line @typescript-eslint/no-var-requires, global-require */
  const currentKaizenVersion: string =
    process.env.NEXT_PUBLIC_APP_VERSION ||
    (() => {
      try {
        return require('../../../package.json').version || '1.17.0';
      } catch {
        return '1.17.0';
      }
    })();

  let installedCoreVersion: string | null = null;
  let installedContractVersion: number | null = null;
  try {
    const vRes = await execa('kaizen-mangal', ['version', '--json'], { timeout: 5000 });
    const parsed = JSON.parse(vRes.stdout.trim());
    installedCoreVersion = parsed.version || null;
    installedContractVersion = parsed.contract_version ?? null;
  } catch {
    // kaizen-mangal binary unavailable
  }

  let latestCoreVersion: string | null = installedCoreVersion;
  let coreReleaseUrl: string | null = null;
  let corePublishedAt: string | null = null;
  let coreChangelog: string | null = null;

  let latestKaizenVersion: string | null = currentKaizenVersion;
  let kaizenReleaseUrl: string | null = null;

  const headers = {
    'User-Agent': `Kaizen/${currentKaizenVersion} (kaizen-mangal/${installedCoreVersion || 'unknown'})`,
    Accept: 'application/vnd.github+json',
  };

  try {
    const [coreRes, kaizenRes] = await Promise.all([
      fetch('https://api.github.com/repos/kaizen-Architecture/kaizen-mangal/releases/latest', { headers }).catch(
        () => null,
      ),
      fetch('https://api.github.com/repos/kaizen-Architecture/Kaizen/releases/latest', { headers }).catch(() => null),
    ]);

    if (coreRes && coreRes.ok) {
      const coreData = (await coreRes.json()) as {
        tag_name?: string;
        html_url?: string;
        published_at?: string;
        body?: string;
      };
      if (coreData.tag_name) {
        latestCoreVersion = coreData.tag_name.replace(/^v/i, '');
        coreReleaseUrl = coreData.html_url || null;
        corePublishedAt = coreData.published_at || null;
        coreChangelog = coreData.body || null;
      }
    }

    if (kaizenRes && kaizenRes.ok) {
      const kaizenData = (await kaizenRes.json()) as {
        tag_name?: string;
        html_url?: string;
      };
      if (kaizenData.tag_name) {
        latestKaizenVersion = kaizenData.tag_name.replace(/^v/i, '');
        kaizenReleaseUrl = kaizenData.html_url || null;
      }
    }
  } catch (err) {
    logger.debug(`[Core Update Check] GitHub releases check warning: ${err}`);
  }

  const coreUpdateAvailable = isSemverNewer(installedCoreVersion, latestCoreVersion);
  const kaizenUpdateAvailable = isSemverNewer(currentKaizenVersion, latestKaizenVersion);

  const installedMajor = installedCoreVersion ? parseInt(installedCoreVersion.split('.')[0] || '1', 10) : 1;
  const latestMajor = latestCoreVersion ? parseInt(latestCoreVersion.split('.')[0] || '1', 10) : installedMajor;
  const contractMatchesInstalled =
    installedContractVersion === null || installedContractVersion === EXPECTED_CORE_CONTRACT_VERSION;
  const majorMatchesLatest = latestMajor === installedMajor;
  const contractCompatible = contractMatchesInstalled && majorMatchesLatest;

  let compatibilityStatus: CoreUpdateCheckResult['compatibilityStatus'] = 'up_to_date';
  let compatibilityMessage = `kaizen-mangal v${installedCoreVersion || 'unknown'} (contract v${
    installedContractVersion ?? EXPECTED_CORE_CONTRACT_VERSION
  }) is up to date and 100% compatible with Kaizen v${currentKaizenVersion}.`;

  if (!contractMatchesInstalled) {
    compatibilityStatus = 'contract_mismatch';
    compatibilityMessage = `Installed kaizen-mangal reports contract_version=${installedContractVersion}, while Kaizen v${currentKaizenVersion} expects contract_version=${EXPECTED_CORE_CONTRACT_VERSION}. Please update Kaizen so both share the same contract.`;
  } else if (coreUpdateAvailable && !majorMatchesLatest) {
    compatibilityStatus = ' contract_mismatch' as any;
    compatibilityStatus = 'contract_mismatch';
    compatibilityMessage = `New major core release kaizen-mangal v${latestCoreVersion} is available, which introduces a new major contract. Please update Kaizen (latest: v${
      latestKaizenVersion || currentKaizenVersion
    }) together with kaizen-mangal.`;
  } else if (coreUpdateAvailable && kaizenUpdateAvailable) {
    compatibilityStatus = 'kaizen_update_recommended';
    compatibilityMessage = `kaizen-mangal v${latestCoreVersion} and Kaizen v${latestKaizenVersion} are available. Core v${latestCoreVersion} is backwards-compatible with Kaizen v${currentKaizenVersion} (contract v${EXPECTED_CORE_CONTRACT_VERSION}), and updating the Kaizen container image will upgrade both.`;
  } else if (coreUpdateAvailable) {
    compatibilityStatus = 'core_update_compatible';
    compatibilityMessage = `New core release kaizen-mangal v${latestCoreVersion} is available (installed: v${installedCoreVersion}) and is 100% compatible with your current Kaizen v${currentKaizenVersion} (contract v${EXPECTED_CORE_CONTRACT_VERSION}).`;
  } else if (kaizenUpdateAvailable) {
    compatibilityStatus = 'kaizen_update_recommended';
    compatibilityMessage = `kaizen-mangal v${installedCoreVersion} is on the latest version, and a newer Kaizen release (v${latestKaizenVersion}) is available.`;
  }

  const result: CoreUpdateCheckResult = {
    checkedAt: new Date().toISOString(),
    installedCoreVersion,
    installedContractVersion,
    latestCoreVersion,
    coreUpdateAvailable,
    coreReleaseUrl,
    corePublishedAt,
    coreChangelog,
    currentKaizenVersion,
    latestKaizenVersion,
    kaizenUpdateAvailable,
    kaizenReleaseUrl,
    expectedContractVersion: EXPECTED_CORE_CONTRACT_VERSION,
    contractCompatible,
    compatibilityStatus,
    compatibilityMessage,
  };

  cachedCoreUpdateResult = result;
  lastCoreUpdateCheckAt = now;

  if (coreUpdateAvailable || !contractCompatible) {
    logger.info(`[Core Version Check] ${compatibilityMessage}`);
    if (latestCoreVersion && lastNotifiedCoreVersion !== latestCoreVersion) {
      lastNotifiedCoreVersion = latestCoreVersion;
    }
  } else {
    logger.debug(`[Core Version Check] ${compatibilityMessage}`);
  }

  return result;
};

export const startPeriodicCoreVersionCheck = () => {
  if (periodicCoreCheckStarted) return;
  periodicCoreCheckStarted = true;

  // Initial non-blocking check 15s after server boot
  setTimeout(() => {
    checkCoreVersionAndCompatibility(true).catch((err) => {
      logger.debug(`[Core Version Check] Startup check error: ${err}`);
    });
  }, 15000);

  // Periodic check every 12 hours
  const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
  setInterval(() => {
    checkCoreVersionAndCompatibility(true).catch((err) => {
      logger.debug(`[Core Version Check] Periodic check error: ${err}`);
    });
  }, TWELVE_HOURS_MS);
};

export interface CoreDiagnostics {
  mangal: {
    available: boolean;
    version: string | null;
  };
  kaizenMangal: {
    available: boolean;
    version: string | null;
    contractVersion: number | null;
    doctor: {
      ok: boolean;
      tls_profile?: { configured: string; resolved: string; chrome_major: number };
      browser?: { available: boolean; mode: string; target?: string; error?: string };
      solver?: { configured: boolean; reachable: boolean; fallback_enabled: boolean; error?: string };
      warnings: string[];
    } | null;
  };
  versionCheck?: CoreUpdateCheckResult | null;
}

export const getCoreDiagnostics = async (): Promise<CoreDiagnostics> => {
  const result: CoreDiagnostics = {
    mangal: { available: false, version: null },
    kaizenMangal: { available: false, version: null, contractVersion: null, doctor: null },
    versionCheck: null,
  };

  try {
    const r = await execa('mangal', ['version', '--short'], { timeout: 5000 });
    result.mangal = { available: true, version: r.stdout.trim() || '4.0.6' };
  } catch {
    // mangal unavailable
  }

  try {
    const vRes = await execa('kaizen-mangal', ['version', '--json'], { timeout: 5000 });
    const parsed = JSON.parse(vRes.stdout.trim());
    result.kaizenMangal.available = true;
    result.kaizenMangal.version = parsed.version || null;
    result.kaizenMangal.contractVersion = parsed.contract_version ?? null;
  } catch {
    return result;
  }

  try {
    const [dRes, versionCheck] = await Promise.all([
      execa('kaizen-mangal', ['doctor', '--json'], { timeout: 8000 }).catch(() => null),
      checkCoreVersionAndCompatibility(false).catch(() => null),
    ]);
    if (dRes?.stdout) {
      result.kaizenMangal.doctor = JSON.parse(dRes.stdout.trim());
    }
    result.versionCheck = versionCheck;
  } catch {
    // ignore doctor error
  }

  return result;
};
