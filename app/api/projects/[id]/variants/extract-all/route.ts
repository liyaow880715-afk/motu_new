import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { extractAllVariantAnalyses } from "@/lib/services/variant-asset-extraction-service";
import { handleRouteError, ok } from "@/lib/utils/route";

export async function POST(
  _request: NextRequest,
  context: { params: { id: string } },
) {
  try {
    const projectId = context.params.id;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { variants: true },
    });
    if (!project) {
      return handleRouteError(new Error("项目不存在"));
    }

    const results = await extractAllVariantAnalyses(projectId);

    await prisma.$transaction(
      project.variants.map((variant) => {
        const metadata = (variant.metadata ?? {}) as Record<string, unknown>;
        const existingAnalysis =
          typeof metadata.analysis === "object" && metadata.analysis !== null
            ? (metadata.analysis as Record<string, unknown>)
            : {};
        const extracted = results[variant.id] ?? {};

        return prisma.productVariant.update({
          where: { id: variant.id },
          data: {
            metadata: {
              ...metadata,
              analysis: {
                ...existingAnalysis,
                ...extracted,
              },
            } as Prisma.InputJsonValue,
          },
        });
      }),
    );

    const updatedVariants = await prisma.productVariant.findMany({
      where: { projectId },
      orderBy: { sortOrder: "asc" },
    });

    return ok(updatedVariants);
  } catch (error) {
    return handleRouteError(error);
  }
}
