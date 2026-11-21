-- Idempotent migration for Stage 2 gradual core migration (mangal <-> kaizen-mangal)
ALTER TABLE "Manga" ADD COLUMN IF NOT EXISTS "scraperCore" TEXT NOT NULL DEFAULT 'kaizen-mangal';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "defaultScraperCore" TEXT NOT NULL DEFAULT 'kaizen-mangal';
ALTER TABLE "Manga" ALTER COLUMN "scraperCore" SET DEFAULT 'kaizen-mangal';
ALTER TABLE "Settings" ALTER COLUMN "defaultScraperCore" SET DEFAULT 'kaizen-mangal';
