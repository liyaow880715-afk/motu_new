import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { regenerateProjectStyleGuide } from "@/lib/services/color-palette-service";
import { handleRouteError, ok } from "@/lib/utils/route";
import { authorizeProjectRequest } from "@/lib/utils/api-auth";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await authorizeProjectRequest(request, (await context.params).id);
    if (denied) return denied;
    const project = await prisma.project.findUnique({
      where: { id: (await context.params).id },
      select: { modelSnapshot: true },
    });

    if (!project) {
      return handleRouteError(new Error("Project not found."));
    }

    const snapshot = (project.modelSnapshot as Record<string, unknown> | null) ?? {};
    return ok({ styleGuide: snapshot.styleGuide ?? null });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await authorizeProjectRequest(request, (await context.params).id);
    if (denied) return denied;
    const project = await prisma.project.findUnique({
      where: { id: (await context.params).id },
      select: { id: true },
    });

    if (!project) {
      return handleRouteError(new Error("Project not found."));
    }

    const styleGuide = await regenerateProjectStyleGuide((await context.params).id);
    return ok({ styleGuide });
  } catch (error) {
    return handleRouteError(error);
  }
}
