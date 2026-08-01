-- AlterTable Settings
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "aiProvider" TEXT DEFAULT 'openai';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "aiModel" TEXT DEFAULT 'gpt-4o';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "aiGatewayUrl" TEXT;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "aiOpenAiKey" TEXT;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "aiAnthropicKey" TEXT;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "aiDeepseekKey" TEXT;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "aiGeminiKey" TEXT;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "aiAzureKey" TEXT;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "aiAzureEndpoint" TEXT;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "aiAzureDeployment" TEXT;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "aiAwsAccessKey" TEXT;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "aiAwsSecretKey" TEXT;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "aiAwsRegion" TEXT;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "aiOllamaUrl" TEXT;

-- CreateTable BlockedSite
CREATE TABLE IF NOT EXISTS "BlockedSite" (
    "id" SERIAL NOT NULL,
    "domain" TEXT NOT NULL,
    "reason" TEXT,
    "failedCount" INTEGER NOT NULL DEFAULT 1,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 1,
    "lastTestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockedSite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BlockedSite_domain_key" ON "BlockedSite"("domain");
