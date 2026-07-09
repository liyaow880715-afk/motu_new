-- CreateTable
CREATE TABLE "HeroTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "referenceImageUrl" TEXT NOT NULL,
    "structureJson" JSONB NOT NULL,
    "styleProfile" JSONB NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "description" TEXT,
    "rawAnalysis" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ModelTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "characterPrompt" TEXT NOT NULL,
    "frontViewPath" TEXT NOT NULL,
    "backViewPath" TEXT NOT NULL,
    "sideViewPath" TEXT NOT NULL,
    "bodyType" TEXT,
    "heightCm" INTEGER,
    "styleTags" JSONB,
    "seed" TEXT,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OutfitShoot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "modelTemplateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clothingType" TEXT NOT NULL,
    "clothingAssets" JSONB NOT NULL,
    "resultImages" JSONB,
    "sceneStyle" TEXT,
    "accessories" JSONB,
    "background" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OutfitShoot_modelTemplateId_fkey" FOREIGN KEY ("modelTemplateId") REFERENCES "ModelTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "HeroTemplate_category_idx" ON "HeroTemplate"("category");

-- CreateIndex
CREATE INDEX "HeroTemplate_createdAt_idx" ON "HeroTemplate"("createdAt");

-- CreateIndex
CREATE INDEX "ModelTemplate_bodyType_idx" ON "ModelTemplate"("bodyType");

-- CreateIndex
CREATE INDEX "ModelTemplate_createdAt_idx" ON "ModelTemplate"("createdAt");

-- CreateIndex
CREATE INDEX "OutfitShoot_modelTemplateId_idx" ON "OutfitShoot"("modelTemplateId");

-- CreateIndex
CREATE INDEX "OutfitShoot_status_idx" ON "OutfitShoot"("status");

-- CreateIndex
CREATE INDEX "OutfitShoot_createdAt_idx" ON "OutfitShoot"("createdAt");
