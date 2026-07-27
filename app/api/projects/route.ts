import { NextRequest } from "next/server";

import { createProject, listProjects } from "@/lib/services/project-service";
import { projectCreateSchema } from "@/lib/validations/project";
import { handleRouteError, ok } from "@/lib/utils/route";
import { requireAuthenticatedAccessKeyId } from "@/lib/utils/api-auth";

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuthenticatedAccessKeyId(request);
    if (auth.response) return auth.response;
    const projects = await listProjects(auth.accessKeyId);
    return ok(projects);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = projectCreateSchema.parse(await request.json());
    const auth = requireAuthenticatedAccessKeyId(request);
    if (auth.response) return auth.response;
    const project = await createProject(input, auth.accessKeyId);
    return ok(project, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
