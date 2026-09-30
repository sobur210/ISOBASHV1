-- CreateEnum
CREATE TYPE "ProviderCreditState" AS ENUM ('RESERVED', 'CHARGED', 'REFUNDED', 'RELEASED');

-- CreateTable
CREATE TABLE "ProviderCreditEntry" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "state" "ProviderCreditState" NOT NULL DEFAULT 'RESERVED',
    "estimatedCredits" INTEGER NOT NULL,
    "chargedCredits" INTEGER,
    "refundedCredits" INTEGER,
    "model" TEXT,
    "providerProjectId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "videoGenerationId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "ProviderCreditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderCreditSnapshot" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "balance" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'provider',

    CONSTRAINT "ProviderCreditSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderCreditEntry_videoGenerationId_key" ON "ProviderCreditEntry"("videoGenerationId");

-- CreateIndex
CREATE INDEX "ProviderCreditEntry_provider_month_state_idx" ON "ProviderCreditEntry"("provider", "month", "state");

-- CreateIndex
CREATE INDEX "ProviderCreditEntry_userId_createdAt_idx" ON "ProviderCreditEntry"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderCreditSnapshot_provider_month_key" ON "ProviderCreditSnapshot"("provider", "month");

-- AddForeignKey
ALTER TABLE "ProviderCreditEntry" ADD CONSTRAINT "ProviderCreditEntry_videoGenerationId_fkey" FOREIGN KEY ("videoGenerationId") REFERENCES "VideoGeneration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderCreditEntry" ADD CONSTRAINT "ProviderCreditEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
