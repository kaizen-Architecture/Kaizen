-- CreateTable
CREATE TABLE "MangaRequest" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "startChapter" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "userId" INTEGER,

    CONSTRAINT "MangaRequest_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MangaRequest" ADD CONSTRAINT "MangaRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
