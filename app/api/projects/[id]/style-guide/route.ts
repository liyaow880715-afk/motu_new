import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { regenerateProjectStyleGuide } from "@/lib/services/color-palette-service";
import { handleRouteError, ok } from "@/lib/utils/route";

export async function GET(_request: NextRequest, context: { params: { id: string } }) {
  try {
    const project = await prisma.project.findUnique({
      where: { id: context.params.id },
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

export async function POST(_request: NextRequest, context: { params: { id: string } }) {
  try {
    const project = await prisma.project.findUnique({
      where: { id: context.params.id },
      select: { id: true },
    });

    if (!project) {
      return handleRouteError(new Error("Project not found."));
    }

    const styleGuide = await regenerateProjectStyleGuide(context.params.id);
    return ok({ styleGuide });
  } catch (error) {
    return handleRouteError(error);
  }
}
