-- AlterTable Settings
ALTER TABLE "Settings" 
ADD COLUMN IF NOT EXISTS "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "whatsappPhone" TEXT,
ADD COLUMN IF NOT EXISTS "whatsappApiKey" TEXT,
ADD COLUMN IF NOT EXISTS "discordEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "discordWebhookUrl" TEXT;

-- AlterTable User
ALTER TABLE "User" 
ADD COLUMN IF NOT EXISTS "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "whatsappPhone" TEXT,
ADD COLUMN IF NOT EXISTS "whatsappApiKey" TEXT,
ADD COLUMN IF NOT EXISTS "discordEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "discordWebhookUrl" TEXT,
ADD COLUMN IF NOT EXISTS "telegramEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "telegramChatId" TEXT,
ADD COLUMN IF NOT EXISTS "notifyEvents" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable UserChapterProgress
CREATE TABLE IF NOT EXISTS "UserChapterProgress" (
    "id" SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "chapterId" INTEGER NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "lastReadPage" INTEGER NOT NULL DEFAULT 0,
    "lastReadAt" TIMESTAMP(3),
    "favoritePages" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    CONSTRAINT "UserChapterProgress_userId_chapterId_key" UNIQUE ("userId", "chapterId"),
    CONSTRAINT "UserChapterProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserChapterProgress_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "UserChapterProgress_userId_idx" ON "UserChapterProgress"("userId");
CREATE INDEX IF NOT EXISTS "UserChapterProgress_chapterId_idx" ON "UserChapterProgress"("chapterId");

-- CreateTable UserFavoriteManga
CREATE TABLE IF NOT EXISTS "UserFavoriteManga" (
    "id" SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "mangaId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserFavoriteManga_userId_mangaId_key" UNIQUE ("userId", "mangaId"),
    CONSTRAINT "UserFavoriteManga_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserFavoriteManga_mangaId_fkey" FOREIGN KEY ("mangaId") REFERENCES "Manga"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "UserFavoriteManga_userId_idx" ON "UserFavoriteManga"("userId");
CREATE INDEX IF NOT EXISTS "UserFavoriteManga_mangaId_idx" ON "UserFavoriteManga"("mangaId");

-- Seed initial admin progress & favorites from legacy global columns if admin exists
DO $$
DECLARE
    admin_id INTEGER;
BEGIN
    SELECT id INTO admin_id FROM "User" WHERE role = 'SUPERADMIN' ORDER BY id ASC LIMIT 1;
    IF admin_id IS NOT NULL THEN
        -- Seed chapter progress for admin
        INSERT INTO "UserChapterProgress" ("userId", "chapterId", "isRead", "lastReadPage", "lastReadAt", "favoritePages")
        SELECT admin_id, c.id, c."isRead", c."lastReadPage", c."lastReadAt", c."favoritePages"
        FROM "Chapter" c
        WHERE c."isRead" = true OR c."lastReadPage" > 0 OR cardinality(c."favoritePages") > 0
        ON CONFLICT ("userId", "chapterId") DO NOTHING;

        -- Seed manga favorites for admin
        INSERT INTO "UserFavoriteManga" ("userId", "mangaId")
        SELECT admin_id, m.id
        FROM "Manga" m
        WHERE m."isFavorite" = true
        ON CONFLICT ("userId", "mangaId") DO NOTHING;
    END IF;
END $$;
