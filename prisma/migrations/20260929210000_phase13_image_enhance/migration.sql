-- Prompt enhancement provenance and style preset, Phase 13 image follow-up.
--
-- `prompt` keeps holding exactly what the caller typed, so an existing row stays
-- readable. The expanded prompt that was really sent to the renderer is recorded
-- separately, and the style preset id that produced it is recorded alongside.
-- Every column is nullable: a run that expanded nothing keeps NULLs rather than an
-- empty string that would claim something was sent.

-- AlterTable
ALTER TABLE "ImageGeneration" ADD COLUMN     "enhancedPrompt" TEXT,
ADD COLUMN     "style" TEXT;

-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "enhancedPrompt" TEXT,
ADD COLUMN     "style" TEXT;
