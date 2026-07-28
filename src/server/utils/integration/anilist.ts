import { getCachedSettings } from '../settings-cache';
import { logger } from '../../../utils/logging';

export interface AniListViewer {
  id: number;
  name: string;
  avatar?: {
    medium?: string;
  };
}

export interface AniListTestConnectionResult {
  status: 'healthy' | 'unhealthy' | 'disabled';
  username?: string;
  avatarUrl?: string;
  message: string;
}

const ANILIST_GRAPHQL_ENDPOINT = 'https://graphql.anilist.co';

const VIEWER_QUERY = `
  query {
    Viewer {
      id
      name
      avatar {
        medium
      }
    }
  }
`;

export const getUserAniListCredentials = async (userId?: number) => {
  const { prisma } = await import('../../db/client');
  const { ensureUserColumnsExist } = await import('../settings-cache');

  if (userId) {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (user && user.anilistToken) {
        return {
          enabled: user.anilistEnabled,
          token: user.anilistToken,
          username: user.anilistUsername,
          autoSync: user.anilistAutoSync,
          userIdentifier: `@${user.username} (ID: ${user.id})`,
        };
      }
    } catch (err: any) {
      if (err?.code === 'P2022' || err?.message?.includes('does not exist')) {
        await ensureUserColumnsExist();
      }
    }
  }

  // Fallback to global settings
  const settings = await getCachedSettings();
  return {
    enabled: settings.anilistEnabled,
    token: settings.anilistToken,
    username: settings.anilistUsername,
    autoSync: settings.anilistAutoSync,
    userIdentifier: `Global Settings`,
  };
};

/**
 * Tests connection to AniList GraphQL API using a provided token or configured user/settings token.
 */
export const testConnection = async (customToken?: string, userId?: number): Promise<AniListTestConnectionResult> => {
  try {
    const creds = await getUserAniListCredentials(userId);
    const rawToken = customToken || creds.token;

    if (!rawToken || !rawToken.trim()) {
      return {
        status: 'unhealthy',
        message: 'AniList Personal Access Token is missing',
      };
    }

    const cleanToken = rawToken.replace(/\s+/g, '');

    const response = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${cleanToken}`,
      },
      body: JSON.stringify({ query: VIEWER_QUERY }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.warn(`[AniList Integration] [${creds.userIdentifier}] Test connection failed HTTP ${response.status}: ${errorText}`);
      return {
        status: 'unhealthy',
        message: `AniList API returned HTTP ${response.status}`,
      };
    }

    const json = await response.json();

    if (json.errors && json.errors.length > 0) {
      const msg = json.errors[0]?.message || 'GraphQL query error';
      logger.warn(`[AniList Integration] [${creds.userIdentifier}] GraphQL error: ${msg}`);
      return {
        status: 'unhealthy',
        message: msg,
      };
    }

    const viewer: AniListViewer | undefined = json.data?.Viewer;

    if (!viewer || !viewer.name) {
      return {
        status: 'unhealthy',
        message: 'Failed to retrieve Viewer profile from AniList',
      };
    }

    logger.info(`[AniList Integration] [${creds.userIdentifier}] Successfully authenticated as @${viewer.name}`);
    return {
      status: 'healthy',
      username: viewer.name,
      avatarUrl: viewer.avatar?.medium,
      message: `Successfully connected as @${viewer.name}`,
    };
  } catch (err: any) {
    logger.error(`[AniList Integration] Connection test error: ${err?.message || err}`);
    return {
      status: 'unhealthy',
      message: err?.message || 'Failed to connect to AniList',
    };
  }
};

/**
 * Helper to fetch a user's manga reading list collection from AniList
 */
export const getUserMangaCollection = async (username: string, token?: string) => {
  const query = `
    query ($username: String) {
      MediaListCollection(userName: $username, type: MANGA) {
        lists {
          name
          isCustomList
          entries {
            id
            mediaId
            status
            progress
            media {
              id
              title {
                romaji
                english
                native
              }
              chapters
              status
              coverImage {
                medium
              }
            }
          }
        }
      }
    }
  `;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }

  const response = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query,
      variables: { username },
    }),
  });

  if (!response.ok) {
    throw new Error(`AniList returned HTTP ${response.status}`);
  }

  const json = await response.json();
  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors[0]?.message || 'Failed to fetch AniList collection');
  }

  return json.data?.MediaListCollection;
};

/**
 * Helper to update reading progress for a media on AniList
 */
export const updateMediaProgress = async (token: string, mediaId: number, progress: number, status?: string) => {
  const mutation = `
    mutation ($mediaId: Int, $progress: Int, $status: MediaListStatus) {
      SaveMediaListEntry (mediaId: $mediaId, progress: $progress, status: $status) {
        id
        mediaId
        progress
        status
      }
    }
  `;

  const response = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token.trim()}`,
    },
    body: JSON.stringify({
      query: mutation,
      variables: { mediaId, progress, status },
    }),
  });

  if (!response.ok) {
    throw new Error(`AniList returned HTTP ${response.status}`);
  }

  const json = await response.json();
  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors[0]?.message || 'Failed to update AniList media progress');
  }

  return json.data?.SaveMediaListEntry;
};

const normalizeTitle = (str: string): string => {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
};

/**
 * Searches AniList for a manga title to find its mediaId if not in user list
 */
export const searchAniListMediaId = async (title: string): Promise<number | null> => {
  const query = `
    query ($search: String) {
      Media (search: $search, type: MANGA) {
        id
        title {
          romaji
          english
        }
      }
    }
  `;

  try {
    const response = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { search: title },
      }),
    });

    if (!response.ok) return null;
    const json = await response.json();
    return json.data?.Media?.id || null;
  } catch (err) {
    return null;
  }
};

/**
 * Matches a local Kaizen Manga to an entry from AniList collection
 */
const matchAniListEntry = (mangaTitle: string, metadataUrls: string[], metadataSynonyms: string[], entries: any[]) => {
  // 1. URL match: anilist.co/manga/<id>
  for (const url of metadataUrls) {
    const match = url.match(/anilist\.co\/manga\/(\d+)/i);
    if (match) {
      const mediaId = parseInt(match[1], 10);
      const found = entries.find((e: any) => e.mediaId === mediaId || e.media?.id === mediaId);
      if (found) return found;
    }
  }

  // 2. Title / Synonym match
  const normTitle = normalizeTitle(mangaTitle);
  const synonyms = metadataSynonyms.map(normalizeTitle);

  for (const entry of entries) {
    const mediaTitles = [
      entry.media?.title?.romaji,
      entry.media?.title?.english,
      entry.media?.title?.native,
      ...(entry.media?.synonyms || []),
    ]
      .filter(Boolean)
      .map(normalizeTitle);

    if (mediaTitles.includes(normTitle) || synonyms.some((s: string) => mediaTitles.includes(s))) {
      return entry;
    }
  }

  return null;
};

/**
 * Imports reading progress from AniList into Kaizen database.
 */
export const importAniListProgress = async (userId?: number): Promise<{
  success: boolean;
  updatedMangas: number;
  updatedChapters: number;
  message: string;
}> => {
  const { prisma } = await import('../../db/client');
  const creds = await getUserAniListCredentials(userId);

  if (!creds.enabled || !creds.token || !creds.username) {
    throw new Error(`AniList integration is not enabled or credentials missing for ${creds.userIdentifier}`);
  }

  const cleanToken = creds.token.replace(/\s+/g, '');
  const collection = await getUserMangaCollection(creds.username, cleanToken);

  if (!collection || !collection.lists) {
    return { success: true, updatedMangas: 0, updatedChapters: 0, message: 'No lists found on AniList' };
  }

  const allEntries: any[] = [];
  for (const list of collection.lists) {
    if (list.entries) {
      allEntries.push(...list.entries);
    }
  }

  const mangas = await prisma.manga.findMany({
    include: {
      metadata: true,
      chapters: {
        select: { id: true, index: true, isRead: true },
      },
    },
  });

  let updatedMangasCount = 0;
  let updatedChaptersCount = 0;

  for (const manga of mangas) {
    const urls = manga.metadata?.urls || [];
    const synonyms = manga.metadata?.synonyms || [];
    const entry = matchAniListEntry(manga.title, urls, synonyms, allEntries);

    if (entry && entry.progress && entry.progress > 0) {
      const progress = entry.progress;
      const unreadChapters = manga.chapters.filter((c: any) => c.index <= progress && !c.isRead);

      if (unreadChapters.length > 0) {
        const updateResult = await prisma.chapter.updateMany({
          where: {
            mangaId: manga.id,
            index: { lte: progress },
          },
          data: {
            isRead: true,
            lastReadAt: new Date(),
          },
        });

        updatedMangasCount++;
        updatedChaptersCount += updateResult.count;
        logger.info(
          `[AniList Import] [${creds.userIdentifier}] Updated "${manga.title}": marked ${updateResult.count} chapters as read (up to ch. ${progress})`,
        );
      }
    }
  }

  return {
    success: true,
    updatedMangas: updatedMangasCount,
    updatedChapters: updatedChaptersCount,
    message: `Successfully imported progress for ${updatedMangasCount} manga (${updatedChaptersCount} chapters updated)`,
  };
};

/**
 * Exports reading progress from Kaizen to AniList.
 */
export const exportAniListProgress = async (userId?: number): Promise<{
  success: boolean;
  updatedMangas: number;
  message: string;
}> => {
  const { prisma } = await import('../../db/client');
  const creds = await getUserAniListCredentials(userId);

  if (!creds.enabled || !creds.token || !creds.username) {
    throw new Error(`AniList integration is not enabled or credentials missing for ${creds.userIdentifier}`);
  }

  const cleanToken = creds.token.replace(/\s+/g, '');
  const collection = await getUserMangaCollection(creds.username, cleanToken);

  const allEntries: any[] = [];
  if (collection?.lists) {
    for (const list of collection.lists) {
      if (list.entries) allEntries.push(...list.entries);
    }
  }

  const mangas = await prisma.manga.findMany({
    include: {
      metadata: true,
      chapters: {
        select: { index: true, isRead: true },
      },
    },
  });

  let updatedCount = 0;

  for (const manga of mangas) {
    const readChapters = manga.chapters.filter((c: any) => c.isRead);
    if (readChapters.length === 0) continue;

    const maxReadIndex = Math.max(...readChapters.map((c: any) => c.index));
    const urls = manga.metadata?.urls || [];
    const synonyms = manga.metadata?.synonyms || [];
    let entry = matchAniListEntry(manga.title, urls, synonyms, allEntries);

    let mediaId: number | null = entry?.mediaId || entry?.media?.id || null;

    if (!mediaId) {
      mediaId = await searchAniListMediaId(manga.title);
    }

    if (mediaId && (!entry || entry.progress !== maxReadIndex)) {
      try {
        await updateMediaProgress(cleanToken, mediaId, maxReadIndex, 'CURRENT');
        updatedCount++;
        logger.info(`[AniList Export] [${creds.userIdentifier}] Synced "${manga.title}" to AniList (ch. ${maxReadIndex})`);
      } catch (err: any) {
        logger.warn(`[AniList Export] [${creds.userIdentifier}] Failed to update "${manga.title}" on AniList: ${err?.message || err}`);
      }
    }
  }

  return {
    success: true,
    updatedMangas: updatedCount,
    message: `Successfully exported progress for ${updatedCount} manga to AniList`,
  };
};

/**
 * Background auto-scrobbler called when a chapter is read in Kaizen
 */
export const scrobbleChapterToAniList = async (mangaId: number, chapterIndex: number, userId?: number) => {
  try {
    const creds = await getUserAniListCredentials(userId);
    if (!creds.enabled || !creds.autoSync || !creds.token) {
      return;
    }

    const { prisma } = await import('../../db/client');
    const manga = await prisma.manga.findUnique({
      where: { id: mangaId },
      include: { metadata: true },
    });

    if (!manga) return;

    const urls = manga.metadata?.urls || [];
    let mediaId: number | null = null;

    for (const url of urls) {
      const match = url.match(/anilist\.co\/manga\/(\d+)/i);
      if (match) {
        mediaId = parseInt(match[1], 10);
        break;
      }
    }

    if (!mediaId) {
      mediaId = await searchAniListMediaId(manga.title);
    }

    if (mediaId) {
      const cleanToken = creds.token.replace(/\s+/g, '');
      await updateMediaProgress(cleanToken, mediaId, chapterIndex, 'CURRENT');
      logger.info(`[AniList Scrobble] [${creds.userIdentifier}] Auto-scrobbled "${manga.title}" ch. ${chapterIndex} to AniList`);
    }
  } catch (err: any) {
    logger.warn(`[AniList Scrobble] Auto-scrobble failed for mangaId ${mangaId}: ${err?.message || err}`);
  }
};
