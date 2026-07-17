-- CreateTable
CREATE TABLE "HeroWorkflow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productName" TEXT NOT NULL,
    "sourceImageUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "currentStage" TEXT NOT NULL DEFAULT 'EXTRACT',
    "stageData" JSONB,
    "config" JSONB,
    "reviewResult" JSONB,
    "exportRecordId" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "HeroWorkflow_status_createdAt_idx" ON "HeroWorkflow"("status", "createdAt");

-- CreateIndex
CREATE INDEX "HeroWorkflow_currentStage_idx" ON "HeroWorkflow"("currentStage");
