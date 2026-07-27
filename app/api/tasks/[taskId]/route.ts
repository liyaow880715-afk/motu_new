import { prisma } from "@/lib/db/prisma";
import { handleRouteError, ok } from "@/lib/utils/route";
import { authorizeProjectRequest } from "@/lib/utils/api-auth";

export async function GET(request: Request, context: { params: Promise<{ taskId: string }> }) {
  try {
    const task = await prisma.generationTask.findUnique({
      where: { id: (await context.params).taskId },
    });
    if (!task) return handleRouteError(new Error("Task not found."));
    const denied = await authorizeProjectRequest(request, task.projectId);
    if (denied) return denied;
    return ok(task);
  } catch (error) {
    return handleRouteError(error);
  }
}
