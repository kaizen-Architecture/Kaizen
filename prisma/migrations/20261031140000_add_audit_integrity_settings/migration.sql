-- AlterTable Settings
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "auditIntegrityInterval" TEXT NOT NULL DEFAULT 'weekly';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "auditIntegrityHour" INTEGER NOT NULL DEFAULT 14;
