ALTER TABLE "HeroSceneGeneration" ADD COLUMN "accessKeyId" TEXT;
ALTER TABLE "HeroWhiteBgImage" ADD COLUMN "accessKeyId" TEXT;
ALTER TABLE "HeroProductAsset" ADD COLUMN "accessKeyId" TEXT;
ALTER TABLE "HeroSceneExport" ADD COLUMN "accessKeyId" TEXT;
ALTER TABLE "HeroWorkflow" ADD COLUMN "accessKeyId" TEXT;
ALTER TABLE "HeroSceneLibrary" ADD COLUMN "accessKeyId" TEXT;
ALTER TABLE "HeroCopyLibrary" ADD COLUMN "accessKeyId" TEXT;

CREATE INDEX "HeroSceneGeneration_accessKeyId_createdAt_idx"
ON "HeroSceneGeneration"("accessKeyId", "createdAt");
CREATE INDEX "HeroWhiteBgImage_accessKeyId_createdAt_idx"
ON "HeroWhiteBgImage"("accessKeyId", "createdAt");
CREATE INDEX "HeroProductAsset_accessKeyId_createdAt_idx"
ON "HeroProductAsset"("accessKeyId", "createdAt");
CREATE INDEX "HeroSceneExport_accessKeyId_createdAt_idx"
ON "HeroSceneExport"("accessKeyId", "createdAt");
CREATE INDEX "HeroWorkflow_accessKeyId_createdAt_idx"
ON "HeroWorkflow"("accessKeyId", "createdAt");
CREATE INDEX "HeroSceneLibrary_accessKeyId_createdAt_idx"
ON "HeroSceneLibrary"("accessKeyId", "createdAt");
CREATE INDEX "HeroCopyLibrary_accessKeyId_createdAt_idx"
ON "HeroCopyLibrary"("accessKeyId", "createdAt");
