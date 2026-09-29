-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "extension" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'unknown',
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "status" "FileStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "warning" TEXT,
    "extractable" BOOLEAN NOT NULL DEFAULT false,
    "extractedText" TEXT NOT NULL DEFAULT '',
    "characters" INTEGER NOT NULL DEFAULT 0,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "embeddingModel" TEXT,
    "embeddedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" INTEGER NOT NULL,
    "projectId" INTEGER,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileChunk" (
    "id" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "characters" INTEGER NOT NULL,
    "tokenEstimate" INTEGER NOT NULL,
    "embedding" JSONB,
    "embeddingModel" TEXT,
    "embeddedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileId" TEXT NOT NULL,

    CONSTRAINT "FileChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoredFile_userId_createdAt_idx" ON "StoredFile"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "StoredFile_userId_status_idx" ON "StoredFile"("userId", "status");

-- CreateIndex
CREATE INDEX "StoredFile_projectId_createdAt_idx" ON "StoredFile"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "StoredFile_kind_idx" ON "StoredFile"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "StoredFile_userId_sha256_key" ON "StoredFile"("userId", "sha256");

-- CreateIndex
CREATE INDEX "FileChunk_fileId_idx" ON "FileChunk"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "FileChunk_fileId_ordinal_key" ON "FileChunk"("fileId", "ordinal");

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileChunk" ADD CONSTRAINT "FileChunk_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
