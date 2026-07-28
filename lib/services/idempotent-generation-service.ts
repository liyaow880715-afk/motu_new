import { randomUUID } from "crypto";

import { prisma } from "@/lib/db/prisma";
import {
  findTaskByIdempotencyKey,
  IdempotencyConflictError,
  recoverInterruptedGenerationTask,
} from "@/lib/services/task-service";
import { fail, ok } from "@/lib/utils/route";

type GenerationResult = {
  imageAsset: unknown;
  version?: unknown;
  usedModel: string;
  generationMode: string;
};

function resolveIdempotencyKey(request: Request, bodyKey?: string) {
  const headerKey = request.headers.get("idempotency-key")?.trim();
  return bodyKey?.trim() || headerKey || randomUUID();
}

async function responseForExistingTask(projectId: string, idempotencyKey: string) {
  const existingTask = await findTaskByIdempotencyKey(projectId, idempotencyKey);
  if (!existingTask) return null;
  const task = await recoverInterruptedGenerationTask(existingTask);

  if (task.status === "RUNNING" || task.status === "PENDING") {
    return ok(
      {
        idempotencyKey,
        reused: true,
        task: { id: task.id, status: task.status, startedAt: task.startedAt },
      },
      { status: 202 },
    );
  }

  if (task.status === "FAILED") {
    return fail(
      "IDEMPOTENT_TASK_FAILED",
      "该幂等请求此前已经失败；请先检查失败原因，确认需要重试后使用新的幂等键。",
      { taskId: task.id, idempotencyKey, errorMessage: task.errorMessage },
      409,
    );
  }

  const output = (task.outputPayload ?? {}) as Record<string, unknown>;
  const imageAssetId = typeof output.imageAssetId === "string" ? output.imageAssetId : null;
  if (!imageAssetId) {
    return fail(
      "IDEMPOTENT_RESULT_MISSING",
      "任务已成功但结果资产记录不完整，请人工检查任务。",
      { taskId: task.id, idempotencyKey },
      409,
    );
  }

  const [imageAsset, version] = await Promise.all([
    prisma.productAsset.findUnique({ where: { id: imageAssetId } }),
    typeof output.versionId === "string"
      ? prisma.sectionVersion.findUnique({ where: { id: output.versionId } })
      : Promise.resolve(null),
  ]);
  if (!imageAsset) {
    return fail(
      "IDEMPOTENT_RESULT_MISSING",
      "任务对应的生成资产已经不存在。",
      { taskId: task.id, idempotencyKey, imageAssetId },
      410,
    );
  }

  return ok({
    imageAsset,
    version,
    usedModel: typeof output.usedModel === "string" ? output.usedModel : "unknown",
    generationMode: typeof output.generationMode === "string" ? output.generationMode : "image_api",
    idempotencyKey,
    reused: true,
    taskId: task.id,
  });
}

export async function executeIdempotentGeneration(
  request: Request,
  projectId: string,
  bodyKey: string | undefined,
  execute: (idempotencyKey: string) => Promise<GenerationResult>,
) {
  const idempotencyKey = resolveIdempotencyKey(request, bodyKey);
  const replay = await responseForExistingTask(projectId, idempotencyKey);
  if (replay) return replay;

  try {
    const result = await execute(idempotencyKey);
    return ok({ ...result, idempotencyKey, reused: false });
  } catch (error) {
    if (error instanceof IdempotencyConflictError) {
      return (
        (await responseForExistingTask(projectId, idempotencyKey)) ??
        fail("IDEMPOTENCY_CONFLICT", error.message, { taskId: error.taskId, idempotencyKey }, 409)
      );
    }
    throw error;
  }
}
