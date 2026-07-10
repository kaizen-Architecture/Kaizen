-- AlterTable: add lastUserAgent to User
ALTER TABLE "User" ADD COLUMN "lastUserAgent" TEXT;

-- CreateTable: ApiCallLog
CREATE TABLE "ApiCallLog" (
    "id"        SERIAL       NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId"    INTEGER      NOT NULL,
    "method"    TEXT         NOT NULL,
    "path"      TEXT         NOT NULL,
    "userAgent" TEXT,

    CONSTRAINT "ApiCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApiCallLog_userId_idx" ON "ApiCallLog"("userId");
CREATE INDEX "ApiCallLog_createdAt_idx" ON "ApiCallLog"("createdAt");

-- AddForeignKey
ALTER TABLE "ApiCallLog" ADD CONSTRAINT "ApiCallLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
