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

/**
 * Tests connection to AniList GraphQL API using a provided token or configured settings token.
 * Decoupled integration function.
 */
export const testConnection = async (customToken?: string): Promise<AniListTestConnectionResult> => {
  try {
    const settings = await getCachedSettings();
    const rawToken = customToken || settings.anilistToken;

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
      logger.warn(`[AniList Integration] Test connection failed HTTP ${response.status}: ${errorText}`);
      return {
        status: 'unhealthy',
        message: `AniList API returned HTTP ${response.status}`,
      };
    }

    const json = await response.json();

    if (json.errors && json.errors.length > 0) {
      const msg = json.errors[0]?.message || 'GraphQL query error';
      logger.warn(`[AniList Integration] GraphQL error: ${msg}`);
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

    logger.info(`[AniList Integration] Successfully authenticated as @${viewer.name}`);
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
