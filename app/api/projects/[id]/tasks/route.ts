import { prisma } from "@/lib/db/prisma";
import { handleRouteError, ok } from "@/lib/utils/route";
import { authorizeProjectRequest } from "@/lib/utils/api-auth";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await authorizeProjectRequest(request, (await context.params).id);
    if (denied) return denied;
    const project = await prisma.project.findUnique({
      where: { id: (await context.params).id },
      select: { id: true },
    });
    if (!project) {
      return handleRouteError(new Error("Project not found."));
    }

    const since = new Date(Date.now() - 30 * 60 * 1000);
    const tasks = await prisma.generationTask.findMany({
      where: {
        projectId: (await context.params).id,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        idempotencyKey: true,
        taskType: true,
        status: true,
        sectionId: true,
        inputPayload: true,
        outputPayload: true,
        errorMessage: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
      },
    });

    return ok({ tasks });
  } catch (error) {
    return handleRouteError(error);
  }
}
