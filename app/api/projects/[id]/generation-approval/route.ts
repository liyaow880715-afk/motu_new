import { NextRequest } from "next/server";
import { z } from "zod";

import {
  approveProjectBlueprint,
  getGenerationApprovalView,
} from "@/lib/services/generation-approval-service";
import { authorizeProjectRequest } from "@/lib/utils/api-auth";
import { handleRouteError, ok } from "@/lib/utils/route";

const actionSchema = z.object({
  action: z.literal("approve_blueprint"),
});

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const denied = await authorizeProjectRequest(request, id);
    if (denied) return denied;
    return ok(await getGenerationApprovalView(id));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const denied = await authorizeProjectRequest(request, id);
    if (denied) return denied;
    actionSchema.parse(await request.json());
    return ok(await approveProjectBlueprint(id));
  } catch (error) {
    return handleRouteError(error);
  }
}
