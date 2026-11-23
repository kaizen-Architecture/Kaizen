-- Idempotent migration to record which source downloaded each chapter
ALTER TABLE "Chapter" ADD COLUMN IF NOT EXISTS "source" TEXT;
