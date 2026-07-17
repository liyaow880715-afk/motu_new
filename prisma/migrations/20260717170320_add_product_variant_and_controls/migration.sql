/*
  Warnings:

  - Made the column `assetIds` on table `HeroSceneExport` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductVariant_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_HeroSceneExport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productName" TEXT NOT NULL,
    "zipFilePath" TEXT NOT NULL,
    "variantCount" INTEGER NOT NULL,
    "storeConfig" JSONB,
    "assetIds" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_HeroSceneExport" ("assetIds", "createdAt", "id", "productName", "storeConfig", "variantCount", "zipFilePath") SELECT "assetIds", "createdAt", "id", "productName", "storeConfig", "variantCount", "zipFilePath" FROM "HeroSceneExport";
DROP TABLE "HeroSceneExport";
ALTER TABLE "new_HeroSceneExport" RENAME TO "HeroSceneExport";
CREATE TABLE "new_ProductAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "variantId" TEXT,
    "sectionId" TEXT,
    "type" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductAsset_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProductAsset_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "PageSection" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ProductAsset" ("createdAt", "fileName", "filePath", "id", "isMain", "metadata", "mimeType", "projectId", "sectionId", "sortOrder", "type") SELECT "createdAt", "fileName", "filePath", "id", "isMain", "metadata", "mimeType", "projectId", "sectionId", "sortOrder", "type" FROM "ProductAsset";
DROP TABLE "ProductAsset";
ALTER TABLE "new_ProductAsset" RENAME TO "ProductAsset";
CREATE INDEX "ProductAsset_projectId_sortOrder_idx" ON "ProductAsset"("projectId", "sortOrder");
CREATE INDEX "ProductAsset_variantId_idx" ON "ProductAsset"("variantId");
CREATE INDEX "ProductAsset_sectionId_idx" ON "ProductAsset"("sectionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ProductVariant_projectId_sortOrder_idx" ON "ProductVariant"("projectId", "sortOrder");
