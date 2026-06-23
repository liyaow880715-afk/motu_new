import { getProjectImageQualityScores } from "@/lib/services/image-quality-service";
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

    const scores = await getProjectImageQualityScores(context.params.id);
    return ok({ scores });
  } catch (error) {
    return handleRouteError(error);
  }
}
