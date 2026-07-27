import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { fail, handleRouteError, ok } from "@/lib/utils/route";
import { authorizeProjectRequest } from "@/lib/utils/api-auth";

const sectionControlsPatchSchema = z.object({
  controls: z
    .object({
      includePackaging: z.boolean().optional(),
    })
    .optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; sectionId: string }> },
) {
  try {
    const denied = await authorizeProjectRequest(request, (await context.params).id);
    if (denied) return denied;
    const input = sectionControlsPatchSchema.parse(await request.json());
    if (!input.controls) {
      return ok(null);
    }

    const section = await prisma.pageSection.findUnique({
      where: { id: (await context.params).sectionId },
    });

    if (!section || section.projectId !== (await context.params).id) {
      return fail("NOT_FOUND", "Section not found.", null, 404);
    }

    const editableData = (section.editableData as Record<string, unknown> | null) ?? {};
    const currentControls = (editableData.controls as Record<string, unknown> | null) ?? {};

    const nextEditableData: Record<string, unknown> = {
      ...editableData,
      controls: {
        ...currentControls,
        ...input.controls,
      },
    };

    const updated = await prisma.pageSection.update({
      where: { id: (await context.params).sectionId },
      data: {
        editableData: nextEditableData as Prisma.InputJsonValue,
      },
    });

    return ok(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}
