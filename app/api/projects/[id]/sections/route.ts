import { NextRequest } from "next/server";

import { createSection } from "@/lib/services/planner-service";
import { sectionInputSchema } from "@/lib/validations/section";
import { handleRouteError, ok } from "@/lib/utils/route";
import { authorizeProjectRequest } from "@/lib/utils/api-auth";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await authorizeProjectRequest(request, (await context.params).id);
    if (denied) return denied;
    const input = sectionInputSchema.parse(await request.json());
    const section = await createSection((await context.params).id, input);
    return ok(section, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
