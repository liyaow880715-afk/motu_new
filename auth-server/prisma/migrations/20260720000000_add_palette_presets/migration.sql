-- CreateTable
CREATE TABLE "PalettePreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "colorTokens" TEXT NOT NULL,
    "tags" TEXT,
    "category" TEXT,
    "shareCode" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PalettePreset_shareCode_key" ON "PalettePreset"("shareCode");
