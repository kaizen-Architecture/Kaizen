-- CreateTable
CREATE TABLE IF NOT EXISTS "FailedDownload" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mangaId" INTEGER NOT NULL,
    "chapterIndex" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "lastError" TEXT,
    "failedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "pausedUntil" TIMESTAMP(3),

    CONSTRAINT "FailedDownload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FailedDownload_mangaId_chapterIndex_source_key" ON "FailedDownload"("mangaId", "chapterIndex", "source");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FailedDownload_mangaId_idx" ON "FailedDownload"("mangaId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FailedDownload_isPaused_idx" ON "FailedDownload"("isPaused");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'FailedDownload_mangaId_fkey'
    ) THEN
        ALTER TABLE "FailedDownload" ADD CONSTRAINT "FailedDownload_mangaId_fkey" FOREIGN KEY ("mangaId") REFERENCES "Manga"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
