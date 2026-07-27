import { NextRequest } from "next/server";

import { deleteProject, getProjectDetail, updateProject } from "@/lib/services/project-service";
import { projectUpdateSchema } from "@/lib/validations/project";
import { fail, handleRouteError, ok } from "@/lib/utils/route";
import { authorizeProjectRequest } from "@/lib/utils/api-auth";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await authorizeProjectRequest(request, (await context.params).id);
    if (denied) return denied;

    const project = await getProjectDetail((await context.params).id);
    if (!project) {
      return fail("NOT_FOUND", "Project not found.", null, 404);
    }
    return ok(project);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await authorizeProjectRequest(request, (await context.params).id);
    if (denied) return denied;

    const input = projectUpdateSchema.parse(await request.json());
    const project = await updateProject((await context.params).id, input);
    return ok(project);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await authorizeProjectRequest(request, (await context.params).id);
    if (denied) return denied;

    const project = await deleteProject((await context.params).id);
    if (!project) {
      return fail("NOT_FOUND", "Project not found.", null, 404);
    }
    return ok(project);
  } catch (error) {
    return handleRouteError(error);
  }
}
