-- AlterTable
ALTER TABLE "Chapter" ADD COLUMN "lastReadPage" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Manga" ADD COLUMN "minChaptersForDownload" INTEGER NOT NULL DEFAULT 0;
