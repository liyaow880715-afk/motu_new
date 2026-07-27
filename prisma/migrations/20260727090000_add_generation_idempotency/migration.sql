ALTER TABLE "GenerationTask" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "GenerationTask_projectId_idempotencyKey_key"
ON "GenerationTask"("projectId", "idempotencyKey");
