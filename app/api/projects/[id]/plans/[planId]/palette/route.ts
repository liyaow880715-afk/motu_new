import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { applyPaletteToStyleGuide } from "@/lib/services/color-palette-service";
import { handleRouteError, ok } from "@/lib/utils/route";
import type { PaletteOption } from "@/types/domain";

const selectPaletteSchema = z.object({
  paletteId: z.string().min(1),
});

async function getProjectPaletteContext(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      modelSnapshot: true,
      paletteOptions: true,
      selectedPaletteId: true,
    },
  });

  if (!project) {
    throw new Error("Project not found.");
  }

  const paletteOptions = (project.paletteOptions ?? []) as unknown as PaletteOption[];
  const snapshot = (project.modelSnapshot as Record<string, unknown> | null) ?? {};

  return {
    projectId: project.id,
    snapshot,
    paletteOptions,
    selectedPaletteId: project.selectedPaletteId,
  };
}

export async function GET(_request: NextRequest, context: { params: { id: string; planId: string } }) {
  try {
    const { projectId, paletteOptions, selectedPaletteId } = await getProjectPaletteContext(context.params.id);

    return ok({
      projectId,
      planId: context.params.planId,
      paletteOptions,
      selectedPaletteId,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: NextRequest, context: { params: { id: string; planId: string } }) {
  try {
    const body = await request.json().catch(() => ({}));
    const input = selectPaletteSchema.parse(body);

    const { projectId, snapshot, paletteOptions } = await getProjectPaletteContext(context.params.id);

    const selectedPalette = paletteOptions.find((option) => option.id === input.paletteId);
    if (!selectedPalette) {
      return handleRouteError(new Error("调色板选项不存在，请重新规划页面。"));
    }

    const styleGuide = (snapshot.styleGuide ?? {}) as Record<string, unknown>;
    const updatedStyleGuide = applyPaletteToStyleGuide(styleGuide, selectedPalette);

    await prisma.project.update({
      where: { id: projectId },
      data: {
        selectedPaletteId: selectedPalette.id,
        modelSnapshot: {
          ...snapshot,
          styleGuide: updatedStyleGuide as unknown as Prisma.InputJsonValue,
          selectedPaletteId: selectedPalette.id,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return ok({
      projectId,
      planId: context.params.planId,
      selectedPaletteId: selectedPalette.id,
      selectedPalette,
      styleGuide: updatedStyleGuide,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest, context: { params: { id: string; planId: string } }) {
  return PATCH(request, context);
}
