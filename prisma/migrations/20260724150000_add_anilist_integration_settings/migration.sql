-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "anilistEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "anilistToken" TEXT,
ADD COLUMN "anilistUsername" TEXT,
ADD COLUMN "anilistAutoSync" BOOLEAN NOT NULL DEFAULT false;
