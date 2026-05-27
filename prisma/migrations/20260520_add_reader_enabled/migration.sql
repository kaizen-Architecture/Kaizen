-- AlterTable
ALTER TABLE "Chapter" ADD COLUMN "favoritePages" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "Chapter" ADD COLUMN "isFavorite" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Manga" ADD COLUMN "isFavorite" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "readerEnabled" BOOLEAN NOT NULL DEFAULT true;
