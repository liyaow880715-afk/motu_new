import { NextRequest } from "next/server";

import { approveSectionImage } from "@/lib/services/generation-service";
import { handleRouteError, ok } from "@/lib/utils/route";
import { authorizeProjectRequest } from "@/lib/utils/api-auth";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; sectionId: string }> },
) {
  try {
    const { id, sectionId } = await context.params;
    const denied = await authorizeProjectRequest(request, id);
    if (denied) return denied;
    return ok(await approveSectionImage(id, sectionId));
  } catch (error) {
    return handleRouteError(error);
  }
}
