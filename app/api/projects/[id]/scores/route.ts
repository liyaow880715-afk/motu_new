import { getProjectImageQualityScores } from "@/lib/services/image-quality-service";
import { handleRouteError, ok } from "@/lib/utils/route";

export async function GET(_request: Request, context: { params: { id: string } }) {
  try {
    const scores = await getProjectImageQualityScores(context.params.id);
    return ok({ scores });
  } catch (error) {
    return handleRouteError(error);
  }
}
