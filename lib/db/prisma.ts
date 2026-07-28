import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// In-process AI requests cannot survive a server restart. Compare task start time
// with the actual process boot time so even a recently-started image task is reset.
const PROCESS_STARTED_AT = new Date(Date.now() - Math.ceil(process.uptime() * 1000));
const hasRecovered = (globalThis as unknown as { __stuckTasksRecovered?: boolean }).__stuckTasksRecovered;

if (!hasRecovered) {
  (globalThis as unknown as { __stuckTasksRecovered?: boolean }).__stuckTasksRecovered = true;

  prisma.generationTask
    .findMany({
      where: {
        status: "RUNNING",
        startedAt: { lt: PROCESS_STARTED_AT },
      },
      select: { id: true, sectionId: true },
    })
    .then(async (stuckTasks) => {
      if (stuckTasks.length === 0) return;

      const sectionIds = stuckTasks
        .map((t) => t.sectionId)
        .filter((id): id is string => !!id);

      await prisma.generationTask.updateMany({
        where: { id: { in: stuckTasks.map((t) => t.id) } },
        data: {
          status: "FAILED",
          errorMessage: "任务因客户端或服务重启而中断，请重新发起。",
          completedAt: new Date(),
        },
      });

      if (sectionIds.length > 0) {
        await prisma.pageSection.updateMany({
          where: {
            id: { in: sectionIds },
            status: "GENERATING",
          },
          data: { status: "IDLE" },
        });
      }

      console.log(`[Recovery] Reset ${stuckTasks.length} interrupted tasks to FAILED`);
    })
    .catch((err) => {
      console.error("[Recovery] Failed to recover stuck tasks:", err);
    });
}
