import { NextRequest } from "next/server";

import { updateAnalysis } from "@/lib/services/analysis-service";
import { analysisPatchSchema } from "@/lib/validations/analysis";
import { handleRouteError, ok } from "@/lib/utils/route";
import { authorizeProjectRequest } from "@/lib/utils/api-auth";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await authorizeProjectRequest(request, (await context.params).id);
    if (denied) return denied;
    const input = analysisPatchSchema.parse(await request.json());
    const analysis = await updateAnalysis((await context.params).id, input.normalizedResult);
    return ok(analysis);
  } catch (error) {
    return handleRouteError(error);
  }
}
