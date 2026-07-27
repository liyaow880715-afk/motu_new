import { randomUUID } from "crypto";
import type { GenerationTask } from "@prisma/client";

import { findTaskByIdempotencyKey, IdempotencyConflictError } from "@/lib/services/task-service";
import { fail, ok } from "@/lib/utils/route";

function resolveKey(request: Request, bodyKey?: string) {
  return bodyKey?.trim() || request.headers.get("idempotency-key")?.trim() || randomUUID();
}

async function replayTask<T extends Record<string, unknown>>(
  projectId: string,
  idempotencyKey: string,
  recover: (task: GenerationTask) => Promise<T | null>,
) {
  const task = await findTaskByIdempotencyKey(projectId, idempotencyKey);
  if (!task) return null;
  if (task.status === "RUNNING" || task.status === "PENDING") {
    return ok({ idempotencyKey, reused: true, task: { id: task.id, status: task.status } }, { status: 202 });
  }
  if (task.status === "FAILED") {
    return fail(
      "IDEMPOTENT_TASK_FAILED",
      "该幂等请求此前已经失败；确认需要重试后请使用新的幂等键。",
      { taskId: task.id, idempotencyKey, errorMessage: task.errorMessage },
      409,
    );
  }
  const result = await recover(task);
  if (!result) {
    return fail(
      "IDEMPOTENT_RESULT_MISSING",
      "任务已成功，但无法恢复对应的持久化结果。",
      { taskId: task.id, idempotencyKey },
      409,
    );
  }
  return ok({ ...result, idempotencyKey, reused: true, taskId: task.id });
}

export async function executeIdempotentTask<T extends Record<string, unknown>>(
  request: Request,
  projectId: string,
  bodyKey: string | undefined,
  handlers: {
    execute: (idempotencyKey: string) => Promise<T>;
    recover: (task: GenerationTask) => Promise<T | null>;
  },
) {
  const idempotencyKey = resolveKey(request, bodyKey);
  const replay = await replayTask(projectId, idempotencyKey, handlers.recover);
  if (replay) return replay;
  try {
    const result = await handlers.execute(idempotencyKey);
    return ok({ ...result, idempotencyKey, reused: false });
  } catch (error) {
    if (error instanceof IdempotencyConflictError) {
      return (
        (await replayTask(projectId, idempotencyKey, handlers.recover)) ??
        fail("IDEMPOTENCY_CONFLICT", error.message, { taskId: error.taskId, idempotencyKey }, 409)
      );
    }
    throw error;
  }
}
