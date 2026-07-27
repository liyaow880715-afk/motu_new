import { NextRequest } from "next/server";

import { reorderSections } from "@/lib/services/planner-service";
import { sectionReorderSchema } from "@/lib/validations/section";
import { handleRouteError, ok } from "@/lib/utils/route";
import { authorizeProjectRequest } from "@/lib/utils/api-auth";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await authorizeProjectRequest(request, (await context.params).id);
    if (denied) return denied;
    const input = sectionReorderSchema.parse(await request.json());
    const sections = await reorderSections((await context.params).id, input.orderedSectionIds);
    return ok(sections);
  } catch (error) {
    return handleRouteError(error);
  }
}
