-- CreateTable
CREATE TABLE "ImageQualityScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL DEFAULT 0,
    "colorConsistencyScore" INTEGER NOT NULL DEFAULT 0,
    "promptAlignmentScore" INTEGER NOT NULL DEFAULT 0,
    "copyAlignmentScore" INTEGER NOT NULL DEFAULT 0,
    "compositionScore" INTEGER NOT NULL DEFAULT 0,
    "typographyScore" INTEGER NOT NULL DEFAULT 0,
    "analysis" TEXT,
    "scoredByModel" TEXT,
    "errorMessage" TEXT,
    "scoredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ImageQualityScore_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "ProductAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ImageQualityScore_assetId_idx" ON "ImageQualityScore"("assetId");

-- CreateIndex
CREATE INDEX "ImageQualityScore_overallScore_idx" ON "ImageQualityScore"("overallScore");

-- CreateIndex
CREATE INDEX "ImageQualityScore_scoredAt_idx" ON "ImageQualityScore"("scoredAt");
