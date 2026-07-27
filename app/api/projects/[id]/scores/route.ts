import { getProjectImageQualityScores } from "@/lib/services/image-quality-service";
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

    const scores = await getProjectImageQualityScores((await context.params).id);
    return ok({ scores });
  } catch (error) {
    return handleRouteError(error);
  }
}
