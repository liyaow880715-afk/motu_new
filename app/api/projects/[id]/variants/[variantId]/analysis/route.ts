import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { handleRouteError, ok } from "@/lib/utils/route";

const patchSchema = z.object({
  normalizedResult: z.record(z.string(), z.any()),
});

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string; variantId: string } },
) {
  try {
    const { id: projectId, variantId } = context.params;
    const input = patchSchema.parse(await request.json());

    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
    });
    if (!variant || variant.projectId !== projectId) {
      return handleRouteError(new Error("规格变体不存在"));
    }

    const metadata = (variant.metadata ?? {}) as Record<string, unknown>;
    const existingAnalysis =
      typeof metadata.analysis === "object" && metadata.analysis !== null
        ? (metadata.analysis as Record<string, unknown>)
        : {};

    const nextAnalysis = {
      ...existingAnalysis,
      ...input.normalizedResult,
    };

    const updated = await prisma.productVariant.update({
      where: { id: variantId },
      data: {
        metadata: {
          ...metadata,
          analysis: nextAnalysis,
        } as Prisma.InputJsonValue,
      },
    });

    return ok(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}
