import { prisma } from "@/lib/db/prisma";
import { recoverInterruptedGenerationTask } from "@/lib/services/task-service";
import { handleRouteError, ok } from "@/lib/utils/route";
import { authorizeProjectRequest } from "@/lib/utils/api-auth";

export async function GET(request: Request, context: { params: Promise<{ taskId: string }> }) {
  try {
    const existingTask = await prisma.generationTask.findUnique({
      where: { id: (await context.params).taskId },
      include: { section: { select: { status: true, currentImageAssetId: true } } },
    });
    if (!existingTask) return handleRouteError(new Error("Task not found."));
    const task = await recoverInterruptedGenerationTask(existingTask);
    const denied = await authorizeProjectRequest(request, task.projectId);
    if (denied) return denied;
    const startedAt = task.startedAt ?? task.createdAt;
    return ok({
      ...task,
      elapsedMs: Math.max(0, Date.now() - startedAt.getTime()),
      phase:
        task.status === "FAILED"
          ? "failed"
          : existingTask.section?.currentImageAssetId
            ? "quality_review"
            : "image_generation",
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
