import { listSectionVersions } from "@/lib/services/generation-service";
import { handleRouteError, ok } from "@/lib/utils/route";
import { authorizeProjectRequest } from "@/lib/utils/api-auth";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; sectionId: string }> },
) {
  try {
    const denied = await authorizeProjectRequest(request, (await context.params).id);
    if (denied) return denied;
    const versions = await listSectionVersions((await context.params).sectionId);
    return ok(versions);
  } catch (error) {
    return handleRouteError(error);
  }
}
