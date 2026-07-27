import { NextRequest } from "next/server";

import { deleteSection, updateSection } from "@/lib/services/planner-service";
import { sectionPatchSchema } from "@/lib/validations/section";
import { handleRouteError, ok } from "@/lib/utils/route";
import { authorizeProjectRequest } from "@/lib/utils/api-auth";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; sectionId: string }> },
) {
  try {
    const denied = await authorizeProjectRequest(request, (await context.params).id);
    if (denied) return denied;
    const input = sectionPatchSchema.parse(await request.json());
    const payload: Record<string, unknown> = { ...input };
    if (input.type) {
      payload.type = input.type.toUpperCase();
    }
    if (input.editableData) {
      payload.editableData = input.editableData;
    }
    const section = await updateSection((await context.params).sectionId, payload);
    return ok(section);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; sectionId: string }> },
) {
  try {
    const denied = await authorizeProjectRequest(request, (await context.params).id);
    if (denied) return denied;
    const section = await deleteSection((await context.params).sectionId);
    return ok(section);
  } catch (error) {
    return handleRouteError(error);
  }
}
