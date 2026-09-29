-- CreateEnum
CREATE TYPE "ResearchStatus" AS ENUM ('PENDING', 'SEARCHING', 'RETRIEVING', 'ANSWERING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ResearchSourceStatus" AS ENUM ('PENDING', 'FETCHED', 'REJECTED', 'FAILED');

-- CreateTable
CREATE TABLE "ResearchSession" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "status" "ResearchStatus" NOT NULL DEFAULT 'PENDING',
    "answer" TEXT,
    "error" TEXT,
    "retrieval" TEXT NOT NULL DEFAULT 'none',
    "queries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "provider" TEXT,
    "model" TEXT,
    "searchedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" INTEGER NOT NULL,
    "projectId" INTEGER,

    CONSTRAINT "ResearchSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchSource" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "host" TEXT,
    "status" "ResearchSourceStatus" NOT NULL DEFAULT 'PENDING',
    "detail" TEXT,
    "httpStatus" INTEGER,
    "content" TEXT NOT NULL DEFAULT '',
    "characters" INTEGER NOT NULL DEFAULT 0,
    "origin" TEXT NOT NULL DEFAULT 'supplied',
    "fetchedAt" TIMESTAMP(3),
    "sessionId" TEXT NOT NULL,

    CONSTRAINT "ResearchSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchCitation" (
    "id" TEXT NOT NULL,
    "marker" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "sessionId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,

    CONSTRAINT "ResearchCitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResearchSession_userId_createdAt_idx" ON "ResearchSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ResearchSession_projectId_createdAt_idx" ON "ResearchSession"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ResearchSession_status_idx" ON "ResearchSession"("status");

-- CreateIndex
CREATE INDEX "ResearchSource_sessionId_status_idx" ON "ResearchSource"("sessionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchSource_sessionId_url_key" ON "ResearchSource"("sessionId", "url");

-- CreateIndex
CREATE INDEX "ResearchCitation_sourceId_idx" ON "ResearchCitation"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchCitation_sessionId_marker_key" ON "ResearchCitation"("sessionId", "marker");

-- AddForeignKey
ALTER TABLE "ResearchSession" ADD CONSTRAINT "ResearchSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchSession" ADD CONSTRAINT "ResearchSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchSource" ADD CONSTRAINT "ResearchSource_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ResearchSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchCitation" ADD CONSTRAINT "ResearchCitation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ResearchSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchCitation" ADD CONSTRAINT "ResearchCitation_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ResearchSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
