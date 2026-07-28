type ApiEnvelope<T = Record<string, unknown>> = {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string; details?: unknown };
};

const STORAGE_PREFIX = "motu:generation-idempotency:";

export type GenerationTaskProgress = {
  status?: string;
  phase?: "image_generation" | "quality_review" | "failed";
  elapsedMs?: number;
};

async function readApiEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  const raw = await response.text();
  if (!raw.trim()) {
    return {
      success: false,
      error: {
        code: "EMPTY_RESPONSE",
        message: `请求失败（HTTP ${response.status}），服务端未返回错误详情。`,
      },
    };
  }

  try {
    return JSON.parse(raw) as ApiEnvelope<T>;
  } catch {
    const summary = raw.replace(/\s+/g, " ").trim().slice(0, 300);
    return {
      success: false,
      error: {
        code: "INVALID_JSON_RESPONSE",
        message: `服务端返回了无法解析的响应（HTTP ${response.status}）：${summary}`,
      },
    };
  }
}

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

async function waitForTask(
  taskId: string,
  onProgress?: (progress: GenerationTaskProgress) => void,
  timeoutMs = 20 * 60 * 1000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, { cache: "no-store" });
    const payload = await readApiEnvelope<{
      status?: string;
      errorMessage?: string;
      phase?: "image_generation" | "quality_review" | "failed";
      elapsedMs?: number;
    }>(response);
    if (!payload.success) return payload;
    onProgress?.(payload.data ?? {});
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
  onProgress?: (progress: GenerationTaskProgress) => void,
) {
  let idempotencyKey = getOrCreateGenerationIdempotencyKey(scope);
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ ...body, idempotencyKey }),
      });
      let payload = await readApiEnvelope<T & { task?: { id?: string } }>(response);
      const taskId = payload.data?.task?.id;
      if (response.status === 202 && taskId) {
        const taskResult = await waitForTask(taskId, onProgress);
        if (!taskResult.success) payload = taskResult as ApiEnvelope<T & { task?: { id?: string } }>;
        else payload = { ...payload, data: { ...(payload.data as T), recoveredTaskId: taskId } };
      }

      if (
        attempt === 0 &&
        response.status === 409 &&
        payload.error?.code === "IDEMPOTENT_TASK_FAILED"
      ) {
        clearGenerationIdempotencyKey(scope, idempotencyKey);
        idempotencyKey = getOrCreateGenerationIdempotencyKey(scope);
        continue;
      }

      if (
        payload.success ||
        response.status === 409 ||
        payload.error?.code === "GENERATION_TASK_FAILED"
      ) {
        clearGenerationIdempotencyKey(scope, idempotencyKey);
      }
      return payload;
    }

    return {
      success: false,
      error: { code: "GENERATION_RETRY_EXHAUSTED", message: "请求重试后仍未完成。" },
    } as ApiEnvelope<T>;
  } catch (error) {
    // A transport timeout is ambiguous: retain the key so the next click queries
    // the already-reserved task instead of creating another billable request.
    throw error;
  }
}
