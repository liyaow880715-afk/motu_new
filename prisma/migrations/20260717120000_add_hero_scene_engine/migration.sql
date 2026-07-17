-- CreateTable
CREATE TABLE "HeroSceneLibrary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "scenePrompt" TEXT NOT NULL,
    "aspectRatio" TEXT NOT NULL DEFAULT '1:1',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "HeroCopyLibrary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "copies" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "HeroSceneGeneration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productName" TEXT NOT NULL,
    "productDescription" TEXT,
    "sourceImageUrl" TEXT NOT NULL,
    "sceneLibraryId" TEXT NOT NULL,
    "generatedImageUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HeroSceneGeneration_sceneLibraryId_fkey" FOREIGN KEY ("sceneLibraryId") REFERENCES "HeroSceneLibrary" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HeroSceneVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "generationId" TEXT NOT NULL,
    "copyText" TEXT NOT NULL,
    "subCopyText" TEXT,
    "layoutStyle" TEXT NOT NULL,
    "tags" JSONB NOT NULL,
    "variantImageUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HeroSceneVariant_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "HeroSceneGeneration" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HeroSceneExport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productName" TEXT NOT NULL,
    "zipFilePath" TEXT NOT NULL,
    "variantCount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "HeroSceneExportItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exportId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    CONSTRAINT "HeroSceneExportItem_exportId_fkey" FOREIGN KEY ("exportId") REFERENCES "HeroSceneExport" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HeroSceneExportItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "HeroSceneVariant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "HeroSceneLibrary_category_idx" ON "HeroSceneLibrary"("category");

-- CreateIndex
CREATE INDEX "HeroSceneLibrary_sortOrder_idx" ON "HeroSceneLibrary"("sortOrder");

-- CreateIndex
CREATE INDEX "HeroCopyLibrary_category_idx" ON "HeroCopyLibrary"("category");

-- CreateIndex
CREATE INDEX "HeroSceneGeneration_status_createdAt_idx" ON "HeroSceneGeneration"("status", "createdAt");

-- CreateIndex
CREATE INDEX "HeroSceneGeneration_sceneLibraryId_idx" ON "HeroSceneGeneration"("sceneLibraryId");

-- CreateIndex
CREATE INDEX "HeroSceneVariant_generationId_status_idx" ON "HeroSceneVariant"("generationId", "status");
