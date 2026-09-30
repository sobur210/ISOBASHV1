-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "hasAudio" BOOLEAN,
ADD COLUMN     "videoGenerationId" TEXT;

-- CreateTable
CREATE TABLE "VideoGeneration" (
    "id" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "aspectRatio" TEXT,
    "requestedSeconds" INTEGER NOT NULL DEFAULT 4,
    "status" "MediaGenerationStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "errorCode" TEXT,
    "warning" TEXT,
    "finishReason" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "cancelRequestedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" INTEGER NOT NULL,
    "projectId" INTEGER,
    "sourceAssetId" TEXT,

    CONSTRAINT "VideoGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoGeneration_userId_createdAt_idx" ON "VideoGeneration"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "VideoGeneration_projectId_createdAt_idx" ON "VideoGeneration"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "VideoGeneration_status_idx" ON "VideoGeneration"("status");

-- CreateIndex
CREATE INDEX "MediaAsset_videoGenerationId_idx" ON "MediaAsset"("videoGenerationId");

-- AddForeignKey
ALTER TABLE "VideoGeneration" ADD CONSTRAINT "VideoGeneration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoGeneration" ADD CONSTRAINT "VideoGeneration_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoGeneration" ADD CONSTRAINT "VideoGeneration_sourceAssetId_fkey" FOREIGN KEY ("sourceAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_videoGenerationId_fkey" FOREIGN KEY ("videoGenerationId") REFERENCES "VideoGeneration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
