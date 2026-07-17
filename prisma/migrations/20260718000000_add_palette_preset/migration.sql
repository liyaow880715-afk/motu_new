-- CreateTable
CREATE TABLE "PalettePreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "colorTokens" JSONB,
    "tags" TEXT,
    "category" TEXT,
    "shareCode" TEXT,
    "accessKeyId" TEXT,
    "projectId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PalettePreset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PalettePreset_shareCode_key" ON "PalettePreset"("shareCode");

-- CreateIndex
CREATE INDEX "PalettePreset_accessKeyId_createdAt_idx" ON "PalettePreset"("accessKeyId", "createdAt");

-- CreateIndex
CREATE INDEX "PalettePreset_shareCode_idx" ON "PalettePreset"("shareCode");
