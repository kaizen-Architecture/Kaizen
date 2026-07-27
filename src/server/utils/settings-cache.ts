import { Settings } from '@prisma/client';
import { prisma } from '../db/client';
import { logger } from '../../utils/logging';

let cachedSettings: Settings | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60000; // 60 seconds

export async function ensureSettingsColumnsExist() {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Settings" 
      ADD COLUMN IF NOT EXISTS "anilistEnabled" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "anilistClientId" TEXT,
      ADD COLUMN IF NOT EXISTS "anilistToken" TEXT,
      ADD COLUMN IF NOT EXISTS "anilistUsername" TEXT,
      ADD COLUMN IF NOT EXISTS "anilistAutoSync" BOOLEAN NOT NULL DEFAULT false;
    `);
  } catch (err: any) {
    logger.warn(`[Settings Cache] Column check warning: ${err?.message || err}`);
  }
}

export async function getCachedSettings(): Promise<Settings> {
  const now = Date.now();
  if (cachedSettings && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedSettings;
  }

  try {
    cachedSettings = await prisma.settings.findFirstOrThrow();
  } catch (err: any) {
    if (err?.code === 'P2022' || err?.message?.includes('does not exist')) {
      await ensureSettingsColumnsExist();
      cachedSettings = await prisma.settings.findFirstOrThrow();
    } else {
      throw err;
    }
  }

  lastFetchTime = now;
  return cachedSettings;
}

export function invalidateSettingsCache() {
  cachedSettings = null;
  lastFetchTime = 0;
}
