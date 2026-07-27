type ApiEnvelope<T = Record<string, unknown>> = {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string; details?: unknown };
};

const STORAGE_PREFIX = "motu:generation-idempotency:";

function storageKey(scope: string) {
  return `${STORAGE_PREFIX}${scope}`;
}

function newIdempotencyKey() {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `generation:${uuid}`;
}

export function getOrCreateGenerationIdempotencyKey(scope: string) {
  if (typeof window === "undefined") return newIdempotencyKey();
  const key = window.localStorage.getItem(storageKey(scope));
  if (key) return key;
  const created = newIdempotencyKey();
  window.localStorage.setItem(storageKey(scope), created);
  return created;
}

export function clearGenerationIdempotencyKey(scope: string, expectedKey?: string) {
  if (typeof window === "undefined") return;
  const key = storageKey(scope);
  if (!expectedKey || window.localStorage.getItem(key) === expectedKey) {
    window.localStorage.removeItem(key);
  }
}

async function waitForTask(taskId: string, timeoutMs = 20 * 60 * 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, { cache: "no-store" });
    const payload = (await response.json()) as ApiEnvelope<{ status?: string; errorMessage?: string }>;
    if (!payload.success) return payload;
    const status = payload.data?.status;
    if (status === "SUCCESS") return payload;
    if (status === "FAILED") {
      return {
        success: false,
        error: {
          code: "GENERATION_TASK_FAILED",
          message: payload.data?.errorMessage ?? "图片生成任务失败。",
        },
      } satisfies ApiEnvelope;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 3000));
  }
  throw new Error(`生成任务 ${taskId} 在等待窗口内未完成；保留幂等键以便稍后恢复。`);
}

export async function postIdempotentGeneration<T extends Record<string, unknown>>(
  url: string,
  scope: string,
  body: Record<string, unknown>,
) {
  const idempotencyKey = getOrCreateGenerationIdempotencyKey(scope);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ ...body, idempotencyKey }),
    });
    let payload = (await response.json()) as ApiEnvelope<T & { task?: { id?: string } }>;
    const taskId = payload.data?.task?.id;
    if (response.status === 202 && taskId) {
      const taskResult = await waitForTask(taskId);
      if (!taskResult.success) payload = taskResult as ApiEnvelope<T & { task?: { id?: string } }>;
      else payload = { ...payload, data: { ...(payload.data as T), recoveredTaskId: taskId } };
    }

    if (payload.success || response.status === 409) {
      clearGenerationIdempotencyKey(scope, idempotencyKey);
    }
    return payload;
  } catch (error) {
    // A transport timeout is ambiguous: retain the key so the next click queries
    // the already-reserved task instead of creating another billable request.
    throw error;
  }
}
