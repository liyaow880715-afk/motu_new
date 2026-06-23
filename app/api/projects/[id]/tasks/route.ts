import { prisma } from "@/lib/db/prisma";
import { handleRouteError, ok } from "@/lib/utils/route";

export async function GET(_request: Request, context: { params: { id: string } }) {
  try {
    const project = await prisma.project.findUnique({
      where: { id: context.params.id },
      select: { id: true },
    });
    if (!project) {
      return handleRouteError(new Error("Project not found."));
    }

    const since = new Date(Date.now() - 30 * 60 * 1000);
    const tasks = await prisma.generationTask.findMany({
      where: {
        projectId: context.params.id,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
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
