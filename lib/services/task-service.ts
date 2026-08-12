import { Prisma, type GenerationTask } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

const PROCESS_STARTED_AT = new Date(Date.now() - Math.ceil(process.uptime() * 1000));
export const GENERATION_TASK_STALE_MS = 12 * 60 * 1000;
const INTERRUPTED_TASK_MESSAGE = "任务因客户端或服务重启而中断，请重新发起。";
const STALE_TASK_MESSAGE = "图片生成任务等待超过 12 分钟，已自动结束。请检查生图接口后重新发起。";

export async function recoverInterruptedGenerationTask(task: GenerationTask) {
  if (task.status !== "RUNNING" && task.status !== "PENDING") return task;

  const startedAt = task.startedAt ?? task.createdAt;
  const interruptedByRestart = startedAt.getTime() < PROCESS_STARTED_AT.getTime();
  const exceededRuntime = Date.now() - startedAt.getTime() > GENERATION_TASK_STALE_MS;
  if (!interruptedByRestart && !exceededRuntime) return task;

  const errorMessage = interruptedByRestart ? INTERRUPTED_TASK_MESSAGE : STALE_TASK_MESSAGE;
  const completedAt = new Date();
  const updated = await prisma.generationTask.updateMany({
    where: { id: task.id, status: { in: ["RUNNING", "PENDING"] } },
    data: { status: "FAILED", errorMessage, completedAt },
  });
  if (updated.count === 0) {
    return (await prisma.generationTask.findUnique({ where: { id: task.id } })) ?? task;
  }

  if (task.sectionId) {
    await prisma.pageSection.updateMany({
      where: { id: task.sectionId, status: "GENERATING" },
      data: { status: "IDLE" },
    });
  }

  return { ...task, status: "FAILED" as const, errorMessage, completedAt, updatedAt: completedAt };
}

export async function createTask(input: {
  projectId: string;
  sectionId?: string | null;
  pageNodeIdentityId?: string | null;
  pageRevisionId?: string | null;
  pageNodeStableId?: string | null;
  taskType: "ANALYZE" | "PLAN" | "GENERATE" | "REGENERATE" | "EXPORT";
  inputPayload?: unknown;
  idempotencyKey?: string | null;
}) {
  try {
    return await prisma.generationTask.create({
      data: {
        projectId: input.projectId,
        sectionId: input.sectionId ?? null,
        pageNodeIdentityId: input.pageNodeIdentityId ?? null,
        pageRevisionId: input.pageRevisionId ?? null,
        pageNodeStableId: input.pageNodeStableId ?? null,
        taskType: input.taskType,
        status: "RUNNING",
        startedAt: new Date(),
        inputPayload: (input.inputPayload ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });
  } catch (error) {
    if (input.idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await findTaskByIdempotencyKey(input.projectId, input.idempotencyKey);
      throw new IdempotencyConflictError(existing?.id ?? null, existing?.status ?? "UNKNOWN");
    }
    throw error;
  }
}

export class IdempotencyConflictError extends Error {
  constructor(
    public readonly taskId: string | null,
    public readonly taskStatus: string,
  ) {
    super(`Idempotency key is already reserved by task ${taskId ?? "unknown"} (${taskStatus}).`);
    this.name = "IdempotencyConflictError";
  }
}

export function findTaskByIdempotencyKey(projectId: string, idempotencyKey: string) {
  return prisma.generationTask.findUnique({
    where: { projectId_idempotencyKey: { projectId, idempotencyKey } },
  });
}

export async function findRecentRunningTask(input: {
  projectId: string;
  taskType: "ANALYZE" | "PLAN" | "GENERATE" | "REGENERATE" | "EXPORT";
  sectionId?: string | null;
  pageNodeIdentityId?: string | null;
  maxAgeMinutes?: number;
}) {
  const maxAgeMinutes = input.maxAgeMinutes ?? 10;
  const startedAfter = new Date(Date.now() - maxAgeMinutes * 60 * 1000);

  return prisma.generationTask.findFirst({
    where: {
      projectId: input.projectId,
      ...(input.pageNodeIdentityId
        ? {
            OR: [
              { pageNodeIdentityId: input.pageNodeIdentityId },
              { sectionId: input.sectionId ?? null },
            ],
          }
        : { sectionId: input.sectionId ?? null }),
      taskType: input.taskType,
      status: "RUNNING",
      startedAt: {
        gte: startedAfter,
      },
    },
    orderBy: {
      startedAt: "desc",
    },
  });
}

export async function completeTask(taskId: string, outputPayload?: unknown) {
  return prisma.generationTask.update({
    where: { id: taskId },
    data: {
      status: "SUCCESS",
      completedAt: new Date(),
      outputPayload: (outputPayload ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    },
  });
}

export async function failTask(taskId: string, errorMessage: string) {
  return prisma.generationTask.update({
    where: { id: taskId },
    data: {
      status: "FAILED",
      completedAt: new Date(),
      errorMessage,
    },
  });
}
