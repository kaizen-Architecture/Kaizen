import { prisma } from '../../db/client';
import { getCachedSettings } from '../settings-cache';
import { getUserMangaCollection } from './anilist';
import { logger } from '../../../utils/logging';

export type TrackerProviderName = 'anilist' | 'mangabaka' | 'myanimelist' | 'kitsu';

export interface ExternalMangaItem {
  id: string | number;
  title: string;
  synonyms?: string[];
  coverUrl?: string;
  progress?: number;
  totalChapters?: number;
  status: 'READING' | 'PLAN_TO_READ' | 'COMPLETED' | 'PAUSED' | 'DROPPED';
  provider: TrackerProviderName;
  providerUrl?: string;
}

export interface ITrackerProvider {
  name: TrackerProviderName;
  getReadingList(): Promise<ExternalMangaItem[]>;
}

const normalizeTitle = (str: string): string => {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
};

/**
 * AniList Tracker Adapter implementing ITrackerProvider
 */
export class AniListTrackerAdapter implements ITrackerProvider {
  name: TrackerProviderName = 'anilist';

  async getReadingList(): Promise<ExternalMangaItem[]> {
    const settings = await getCachedSettings();
    if (!settings.anilistEnabled || !settings.anilistToken || !settings.anilistUsername) {
      return [];
    }

    const cleanToken = settings.anilistToken.replace(/\s+/g, '');
    const collection = await getUserMangaCollection(settings.anilistUsername, cleanToken);

    if (!collection || !collection.lists) return [];

    const items: ExternalMangaItem[] = [];

    for (const list of collection.lists) {
      if (!list.entries) continue;
      for (const entry of list.entries) {
        const media = entry.media;
        if (!media) continue;

        const mainTitle = media.title?.romaji || media.title?.english || media.title?.native || 'Unknown Title';
        const synonyms = media.synonyms || [];
        if (media.title?.english && media.title.english !== mainTitle) {
          synonyms.push(media.title.english);
        }

        const mapStatus = (s: string): ExternalMangaItem['status'] => {
          if (s === 'CURRENT') return 'READING';
          if (s === 'PLANNING') return 'PLAN_TO_READ';
          if (s === 'COMPLETED') return 'COMPLETED';
          if (s === 'PAUSED') return 'PAUSED';
          return 'DROPPED';
        };

        items.push({
          id: entry.id || media.id,
          title: mainTitle,
          synonyms,
          coverUrl: media.coverImage?.medium,
          progress: entry.progress || 0,
          totalChapters: media.chapters || undefined,
          status: mapStatus(entry.status),
          provider: 'anilist',
          providerUrl: `https://anilist.co/manga/${media.id}`,
        });
      }
    }

    return items;
  }
}

/**
 * Returns all configured active tracker adapters
 */
export const getActiveTrackerAdapters = async (): Promise<ITrackerProvider[]> => {
  const settings = await getCachedSettings();
  const adapters: ITrackerProvider[] = [];

  if (settings.anilistEnabled && settings.anilistToken && settings.anilistUsername) {
    adapters.push(new AniListTrackerAdapter());
  }

  // Future trackers (MangaBaka, MAL, Kitsu) will register their adapters here!

  return adapters;
};

/**
 * Aggregates reading lists from all active external trackers,
 * cross-references with local Kaizen library, and returns items that are NOT YET in Kaizen.
 */
export const getUnaddedExternalTrackerMangas = async (): Promise<ExternalMangaItem[]> => {
  const adapters = await getActiveTrackerAdapters();
  if (adapters.length === 0) return [];

  // Fetch all external items concurrently
  const allExternalLists = await Promise.all(
    adapters.map(async (adapter) => {
      try {
        return await adapter.getReadingList();
      } catch (err: any) {
        logger.warn(`[Tracker Engine] Failed to fetch list from ${adapter.name}: ${err?.message || err}`);
        return [];
      }
    }),
  );

  const flatExternalItems = allExternalLists.flat();
  if (flatExternalItems.length === 0) return [];

  // Fetch all local mangas from Kaizen database
  const localMangas = await prisma.manga.findMany({
    include: {
      metadata: true,
    },
  });

  const localNormTitles = new Set<string>();
  const localUrls = new Set<string>();

  for (const m of localMangas) {
    localNormTitles.add(normalizeTitle(m.title));
    if (m.metadata?.synonyms) {
      for (const s of m.metadata.synonyms) {
        localNormTitles.add(normalizeTitle(s));
      }
    }
    if (m.metadata?.urls) {
      for (const u of m.metadata.urls) {
        localUrls.add(u.toLowerCase());
      }
    }
  }

  // Filter out items that already exist in Kaizen
  const unaddedItems = flatExternalItems.filter((ext) => {
    // Check URL match
    if (ext.providerUrl && localUrls.has(ext.providerUrl.toLowerCase())) {
      return false;
    }

    // Check title match
    const normExtTitle = normalizeTitle(ext.title);
    if (localNormTitles.has(normExtTitle)) {
      return false;
    }

    // Check synonyms match
    if (ext.synonyms) {
      for (const syn of ext.synonyms) {
        if (localNormTitles.has(normalizeTitle(syn))) {
          return false;
        }
      }
    }

    return true;
  });

  // Deduplicate by title/providerUrl
  const seen = new Set<string>();
  const uniqueUnadded = unaddedItems.filter((item) => {
    const key = `${item.provider}:${normalizeTitle(item.title)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return uniqueUnadded;
};
