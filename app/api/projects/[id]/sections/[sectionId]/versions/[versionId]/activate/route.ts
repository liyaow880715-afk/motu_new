import { activateSectionVersion } from "@/lib/services/generation-service";
import { handleRouteError, ok } from "@/lib/utils/route";
import { authorizeProjectRequest } from "@/lib/utils/api-auth";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; sectionId: string; versionId: string }> },
) {
  try {
    const denied = await authorizeProjectRequest(request, (await context.params).id);
    if (denied) return denied;
    const version = await activateSectionVersion((await context.params).sectionId, (await context.params).versionId);
    return ok(version);
  } catch (error) {
    return handleRouteError(error);
  }
}
