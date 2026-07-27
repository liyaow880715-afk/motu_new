import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export async function createTask(input: {
  projectId: string;
  sectionId?: string | null;
  taskType: "ANALYZE" | "PLAN" | "GENERATE" | "REGENERATE" | "EXPORT";
  inputPayload?: unknown;
  idempotencyKey?: string | null;
}) {
  try {
    return await prisma.generationTask.create({
      data: {
        projectId: input.projectId,
        sectionId: input.sectionId ?? null,
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
  maxAgeMinutes?: number;
}) {
  const maxAgeMinutes = input.maxAgeMinutes ?? 10;
  const startedAfter = new Date(Date.now() - maxAgeMinutes * 60 * 1000);

  return prisma.generationTask.findFirst({
    where: {
      projectId: input.projectId,
      sectionId: input.sectionId ?? null,
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
