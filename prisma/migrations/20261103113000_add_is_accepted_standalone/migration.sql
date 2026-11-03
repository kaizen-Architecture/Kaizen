-- AlterTable
ALTER TABLE "Manga" ADD COLUMN IF NOT EXISTS "isAcceptedStandalone" BOOLEAN NOT NULL DEFAULT false;
