-- AlterTable Settings
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "serverLanguage" TEXT NOT NULL DEFAULT 'es';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "notificationDigestMode" TEXT NOT NULL DEFAULT 'HOURLY';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "notificationDigestHour" INTEGER NOT NULL DEFAULT 20;

-- AlterTable User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'es';

-- CreateTable NotificationDigestItem
CREATE TABLE IF NOT EXISTS "NotificationDigestItem" (
    "id" SERIAL NOT NULL,
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
    "sent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "NotificationDigestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable NotificationLog
CREATE TABLE IF NOT EXISTS "NotificationLog" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "recipient" TEXT,
    "error" TEXT,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "NotificationDigestItem_sent_createdAt_idx" ON "NotificationDigestItem"("sent", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "NotificationLog_createdAt_idx" ON "NotificationLog"("createdAt");
