import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { applyPaletteToStyleGuide } from "@/lib/services/color-palette-service";
import { handleRouteError, ok } from "@/lib/utils/route";
import type { ColorTokens, PaletteOption } from "@/types/domain";
import { authorizeProjectRequest, getAuthenticatedAccessKeyId } from "@/lib/utils/api-auth";

const colorTokensSchema = z.object({
  primary: z.string(),
  secondary: z.string(),
  accent: z.string(),
  background: z.string(),
  surface: z.string(),
  text: z.string(),
});

const selectPaletteSchema = z.object({
  paletteId: z.string().min(1).optional(),
  colorTokens: colorTokensSchema.optional(),
  paletteStyle: z.enum(["safe", "contrast", "bold"]).optional(),
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

export async function GET(request: NextRequest, context: { params: Promise<{ id: string; planId: string }> }) {
  try {
    const denied = await authorizeProjectRequest(request, (await context.params).id);
    if (denied) return denied;
    const { projectId, snapshot, paletteOptions, selectedPaletteId } = await getProjectPaletteContext((await context.params).id);

    return ok({
      projectId,
      planId: (await context.params).planId,
      paletteOptions,
      selectedPaletteId,
      paletteStyle: (snapshot.paletteStyle as "safe" | "contrast" | "bold") ?? "safe",
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; planId: string }> }) {
  try {
    const denied = await authorizeProjectRequest(request, (await context.params).id);
    if (denied) return denied;
    const accessKey = getAuthenticatedAccessKeyId(request) ?? undefined;
    const body = await request.json().catch(() => ({}));
    const input = selectPaletteSchema.parse(body);

    const { projectId, snapshot, paletteOptions, selectedPaletteId } = await getProjectPaletteContext((await context.params).id);

    if (input.paletteStyle && !input.paletteId) {
      await prisma.project.update({
        where: { id: projectId },
        data: {
          modelSnapshot: {
            ...snapshot,
            paletteStyle: input.paletteStyle,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      return ok({
        projectId,
        planId: (await context.params).planId,
        selectedPaletteId,
        paletteStyle: input.paletteStyle,
      });
    }

    if (!input.paletteId) {
      return handleRouteError(new Error("缺少 paletteId 或 paletteStyle。"));
    }

    let selectedPalette: PaletteOption | undefined;

    if (input.paletteId.startsWith("preset-")) {
      const presetId = input.paletteId.replace("preset-", "");
      const preset = await prisma.palettePreset.findFirst({
        where: {
          id: presetId,
          OR: [
            { accessKeyId: accessKey ?? "" },
            { shareCode: { not: null } },
          ],
        },
      });
      if (!preset) {
        return handleRouteError(new Error("配色预设不存在或无权使用。"));
      }
      const tokens = (input.colorTokens ?? preset.colorTokens ?? {}) as ColorTokens;
      selectedPalette = {
        id: input.paletteId,
        name: (preset.name as string) ?? "自定义预设",
        description: (preset.description as string) ?? "",
        colorTokens: tokens,
      };
    } else {
      selectedPalette = paletteOptions.find((option) => option.id === input.paletteId);
    }

    if (!selectedPalette) {
      return handleRouteError(new Error("调色板选项不存在，请重新规划页面。"));
    }

    const styleGuide = (snapshot.styleGuide ?? {}) as Record<string, unknown>;
    const updatedStyleGuide = {
      ...applyPaletteToStyleGuide(styleGuide, selectedPalette),
      paletteStyle: input.paletteStyle ?? snapshot.paletteStyle ?? "safe",
    };

    await prisma.project.update({
      where: { id: projectId },
      data: {
        selectedPaletteId: selectedPalette.id,
        modelSnapshot: {
          ...snapshot,
          styleGuide: updatedStyleGuide as unknown as Prisma.InputJsonValue,
          selectedPaletteId: selectedPalette.id,
          paletteStyle: input.paletteStyle ?? snapshot.paletteStyle ?? "safe",
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return ok({
      projectId,
      planId: (await context.params).planId,
      selectedPaletteId: selectedPalette.id,
      selectedPalette,
      styleGuide: updatedStyleGuide,
      paletteStyle: input.paletteStyle ?? (snapshot.paletteStyle as "safe" | "contrast" | "bold") ?? "safe",
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; planId: string }> }) {
  return PATCH(request, context);
}
