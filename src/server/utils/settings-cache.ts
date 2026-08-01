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
      ADD COLUMN IF NOT EXISTS "anilistAutoSync" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "aiProvider" TEXT DEFAULT 'openai',
      ADD COLUMN IF NOT EXISTS "aiModel" TEXT DEFAULT 'gpt-4o',
      ADD COLUMN IF NOT EXISTS "aiGatewayUrl" TEXT,
      ADD COLUMN IF NOT EXISTS "aiOpenAiKey" TEXT,
      ADD COLUMN IF NOT EXISTS "aiAnthropicKey" TEXT,
      ADD COLUMN IF NOT EXISTS "aiDeepseekKey" TEXT,
      ADD COLUMN IF NOT EXISTS "aiGeminiKey" TEXT,
      ADD COLUMN IF NOT EXISTS "aiAzureKey" TEXT,
      ADD COLUMN IF NOT EXISTS "aiAzureEndpoint" TEXT,
      ADD COLUMN IF NOT EXISTS "aiAzureDeployment" TEXT,
      ADD COLUMN IF NOT EXISTS "aiAwsAccessKey" TEXT,
      ADD COLUMN IF NOT EXISTS "aiAwsSecretKey" TEXT,
      ADD COLUMN IF NOT EXISTS "aiAwsRegion" TEXT,
      ADD COLUMN IF NOT EXISTS "aiOllamaUrl" TEXT;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "BlockedSite" (
        "id" SERIAL PRIMARY KEY,
        "domain" TEXT UNIQUE NOT NULL,
        "reason" TEXT,
        "failedCount" INT NOT NULL DEFAULT 1,
        "consecutiveFailures" INT NOT NULL DEFAULT 1,
        "lastTestedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (err: any) {
    logger.warn(`[Settings Cache] Column check warning: ${err?.message || err}`);
  }
}

export async function ensureUserColumnsExist() {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "User" 
      ADD COLUMN IF NOT EXISTS "anilistEnabled" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "anilistClientId" TEXT,
      ADD COLUMN IF NOT EXISTS "anilistToken" TEXT,
      ADD COLUMN IF NOT EXISTS "anilistUsername" TEXT,
      ADD COLUMN IF NOT EXISTS "anilistAutoSync" BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS "readerDefaults" JSONB;
    `);
  } catch (err: any) {
    logger.warn(`[User Columns] Column check warning: ${err?.message || err}`);
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
