-- CreateTable
CREATE TABLE "HeroTemplateScene" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "heroTemplateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "stylePrompt" TEXT NOT NULL,
    "layoutOverrides" JSONB,
    "referenceHeroImage" TEXT,
    "aspectRatio" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HeroTemplateScene_heroTemplateId_fkey" FOREIGN KEY ("heroTemplateId") REFERENCES "HeroTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "HeroTemplateScene_heroTemplateId_sortOrder_idx" ON "HeroTemplateScene"("heroTemplateId", "sortOrder");
