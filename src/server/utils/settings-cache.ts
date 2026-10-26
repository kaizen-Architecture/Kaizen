import { Settings } from '@prisma/client';
import { prisma } from '../db/client';
import { logger } from '../../utils/logging';

let cachedSettings: Settings | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60000; // 60 seconds

async function executeSqlStatements(statements: string[], context: string) {
  for (const sql of statements) {
    const trimmed = sql.trim();
    if (!trimmed) continue;
    try {
      await prisma.$executeRawUnsafe(trimmed);
    } catch (err: any) {
      logger.warn(`[${context}] SQL execution warning: ${err?.message || err}`);
    }
  }
}

export async function ensureSettingsColumnsExist() {
  try {
    await executeSqlStatements(
      [
        `ALTER TABLE "Settings" 
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
          ADD COLUMN IF NOT EXISTS "aiOllamaUrl" TEXT,
          ADD COLUMN IF NOT EXISTS "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
          ADD COLUMN IF NOT EXISTS "whatsappPhone" TEXT,
          ADD COLUMN IF NOT EXISTS "whatsappApiKey" TEXT,
          ADD COLUMN IF NOT EXISTS "discordEnabled" BOOLEAN NOT NULL DEFAULT false,
          ADD COLUMN IF NOT EXISTS "discordWebhookUrl" TEXT,
          ADD COLUMN IF NOT EXISTS "serverLanguage" TEXT NOT NULL DEFAULT 'es',
          ADD COLUMN IF NOT EXISTS "notificationDigestMode" TEXT NOT NULL DEFAULT 'HOURLY',
          ADD COLUMN IF NOT EXISTS "notificationDigestHour" INTEGER NOT NULL DEFAULT 20,
          ADD COLUMN IF NOT EXISTS "serverBaseUrl" TEXT`,
        `DELETE FROM "Settings" WHERE id NOT IN (SELECT id FROM "Settings" ORDER BY id ASC LIMIT 1)`,
        `CREATE TABLE IF NOT EXISTS "NotificationDigestItem" (
          "id" SERIAL PRIMARY KEY,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "event" TEXT NOT NULL,
          "mangaId" INTEGER,
          "mangaTitle" TEXT,
          "chapterIndex" INTEGER,
          "source" TEXT,
          "errorText" TEXT,
          "severity" TEXT DEFAULT 'info',
          "targetUserId" INTEGER,
          "channel" TEXT,
          "sent" BOOLEAN NOT NULL DEFAULT false
        )`,
        `CREATE TABLE IF NOT EXISTS "NotificationLog" (
          "id" SERIAL PRIMARY KEY,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "channel" TEXT NOT NULL,
          "event" TEXT NOT NULL,
          "success" BOOLEAN NOT NULL DEFAULT true,
          "recipient" TEXT,
          "error" TEXT
        )`,
        `CREATE INDEX IF NOT EXISTS "NotificationDigestItem_sent_createdAt_idx" ON "NotificationDigestItem"("sent", "createdAt")`,
        `CREATE INDEX IF NOT EXISTS "NotificationLog_createdAt_idx" ON "NotificationLog"("createdAt")`,
        `CREATE TABLE IF NOT EXISTS "BlockedSite" (
          "id" SERIAL PRIMARY KEY,
          "domain" TEXT UNIQUE NOT NULL,
          "reason" TEXT,
          "failedCount" INT NOT NULL DEFAULT 1,
          "consecutiveFailures" INT NOT NULL DEFAULT 1,
          "lastTestedAt" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS "FailedDownload" (
          "id" SERIAL PRIMARY KEY,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "mangaId" INTEGER NOT NULL REFERENCES "Manga"("id") ON DELETE CASCADE,
          "chapterIndex" INTEGER NOT NULL,
          "source" TEXT NOT NULL,
          "attempts" INTEGER NOT NULL DEFAULT 1,
          "lastError" TEXT,
          "failedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "isPaused" BOOLEAN NOT NULL DEFAULT false,
          "pausedUntil" TIMESTAMP(3),
          CONSTRAINT "FailedDownload_mangaId_chapterIndex_source_key" UNIQUE ("mangaId", "chapterIndex", "source")
        )`,
        `CREATE INDEX IF NOT EXISTS "FailedDownload_mangaId_idx" ON "FailedDownload"("mangaId")`,
        `CREATE INDEX IF NOT EXISTS "FailedDownload_isPaused_idx" ON "FailedDownload"("isPaused")`,
      ],
      'Settings Schema Auto-Healing'
    );

    await ensureLuaSourceColumnsExist();
  } catch (err: any) {
    logger.warn(`[Settings Cache] Column check warning: ${err?.message || err}`);
  }
}

export async function ensureLuaSourceColumnsExist() {
  try {
    await executeSqlStatements(
      [
        `ALTER TABLE "LuaSource" 
          ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE',
          ADD COLUMN IF NOT EXISTS "failedCount" INTEGER NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS "lastTestedAt" TIMESTAMP(3)`,
      ],
      'LuaSource Columns Auto-Healing'
    );
  } catch (err: any) {
    logger.warn(`[LuaSource Columns] Column check warning: ${err?.message || err}`);
  }
}

export async function ensureUserColumnsExist() {
  try {
    await executeSqlStatements(
      [
        `ALTER TABLE "User" 
          ADD COLUMN IF NOT EXISTS "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
          ADD COLUMN IF NOT EXISTS "anilistEnabled" BOOLEAN NOT NULL DEFAULT false,
          ADD COLUMN IF NOT EXISTS "anilistClientId" TEXT,
          ADD COLUMN IF NOT EXISTS "anilistToken" TEXT,
          ADD COLUMN IF NOT EXISTS "anilistUsername" TEXT,
          ADD COLUMN IF NOT EXISTS "anilistAutoSync" BOOLEAN NOT NULL DEFAULT true,
          ADD COLUMN IF NOT EXISTS "readerDefaults" JSONB,
          ADD COLUMN IF NOT EXISTS "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
          ADD COLUMN IF NOT EXISTS "whatsappPhone" TEXT,
          ADD COLUMN IF NOT EXISTS "whatsappApiKey" TEXT,
          ADD COLUMN IF NOT EXISTS "discordEnabled" BOOLEAN NOT NULL DEFAULT false,
          ADD COLUMN IF NOT EXISTS "discordWebhookUrl" TEXT,
          ADD COLUMN IF NOT EXISTS "telegramEnabled" BOOLEAN NOT NULL DEFAULT false,
          ADD COLUMN IF NOT EXISTS "telegramChatId" TEXT,
          ADD COLUMN IF NOT EXISTS "notifyEvents" TEXT[] DEFAULT ARRAY[]::TEXT[],
          ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'es'`,
        `CREATE TABLE IF NOT EXISTS "UserChapterProgress" (
          "id" SERIAL PRIMARY KEY,
          "userId" INTEGER NOT NULL,
          "chapterId" INTEGER NOT NULL,
          "isRead" BOOLEAN NOT NULL DEFAULT false,
          "lastReadPage" INTEGER NOT NULL DEFAULT 0,
          "lastReadAt" TIMESTAMP(3),
          "favoritePages" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
          CONSTRAINT "UserChapterProgress_userId_chapterId_key" UNIQUE ("userId", "chapterId")
        )`,
        `CREATE TABLE IF NOT EXISTS "UserFavoriteManga" (
          "id" SERIAL PRIMARY KEY,
          "userId" INTEGER NOT NULL,
          "mangaId" INTEGER NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "UserFavoriteManga_userId_mangaId_key" UNIQUE ("userId", "mangaId")
        )`,
      ],
      'User Columns Auto-Healing'
    );
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
    cachedSettings = await prisma.settings.findFirstOrThrow({ orderBy: { id: 'asc' } });
  } catch (err: any) {
    if (err?.code === 'P2022' || err?.message?.includes('does not exist')) {
      await ensureSettingsColumnsExist();
      cachedSettings = await prisma.settings.findFirstOrThrow({ orderBy: { id: 'asc' } });
    } else {
      throw err;
    }
  }

  if (cachedSettings) {
    if (!cachedSettings.aiAzureKey && process.env.AI_AZURE_KEY) {
      cachedSettings.aiAzureKey = process.env.AI_AZURE_KEY;
    }
    if (!cachedSettings.aiAzureEndpoint && process.env.AI_AZURE_ENDPOINT) {
      cachedSettings.aiAzureEndpoint = process.env.AI_AZURE_ENDPOINT;
    }
    if (!cachedSettings.aiAzureDeployment && process.env.AI_AZURE_DEPLOYMENT) {
      cachedSettings.aiAzureDeployment = process.env.AI_AZURE_DEPLOYMENT;
    }
  }

  lastFetchTime = now;
  return cachedSettings;
}

export function invalidateSettingsCache() {
  cachedSettings = null;
  lastFetchTime = 0;
}
