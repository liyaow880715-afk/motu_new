import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { extractVariantAnalysisFromAssets } from "@/lib/services/variant-asset-extraction-service";
import { handleRouteError, ok } from "@/lib/utils/route";

export async function POST(
  _request: NextRequest,
  context: { params: { id: string; variantId: string } },
) {
  try {
    const { id: projectId, variantId } = context.params;

    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
    });
    if (!variant || variant.projectId !== projectId) {
      return handleRouteError(new Error("规格变体不存在"));
    }

    const extracted = await extractVariantAnalysisFromAssets(projectId, variantId);

    const metadata = (variant.metadata ?? {}) as Record<string, unknown>;
    const existingAnalysis =
      typeof metadata.analysis === "object" && metadata.analysis !== null
        ? (metadata.analysis as Record<string, unknown>)
        : {};

    const nextAnalysis = {
      ...existingAnalysis,
      ...extracted,
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
