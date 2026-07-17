-- CreateTable
CREATE TABLE "HeroWhiteBgImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productName" TEXT NOT NULL,
    "sourceImageUrl" TEXT NOT NULL,
    "sourceHash" TEXT,
    "imageUrl" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "HeroProductAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "contentJson" JSONB,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- AlterTable
ALTER TABLE "HeroSceneExport" ADD COLUMN "storeConfig" JSONB;

-- AlterTable
ALTER TABLE "HeroSceneExport" ADD COLUMN "assetIds" JSONB;

-- CreateIndex
CREATE INDEX "HeroWhiteBgImage_productName_idx" ON "HeroWhiteBgImage"("productName");

-- CreateIndex
CREATE INDEX "HeroWhiteBgImage_sourceHash_idx" ON "HeroWhiteBgImage"("sourceHash");

-- CreateIndex
CREATE INDEX "HeroProductAsset_productName_type_idx" ON "HeroProductAsset"("productName", "type");
