import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { getImageQualityScore, scoreGeneratedImage } from "@/lib/services/image-quality-service";
import { handleRouteError, ok } from "@/lib/utils/route";

export async function GET(_request: NextRequest, context: { params: { id: string } }) {
  try {
    const asset = await prisma.productAsset.findUnique({
      where: { id: context.params.id },
      select: { id: true },
    });
    if (!asset) {
      return handleRouteError(new Error("Asset not found."));
    }

    const score = await getImageQualityScore(context.params.id);
    return ok({ score });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  try {
    const asset = await prisma.productAsset.findUnique({
      where: { id: context.params.id },
      select: { id: true, projectId: true },
    });
    if (!asset) {
      return handleRouteError(new Error("Asset not found."));
    }

    const project = await prisma.project.findUnique({
      where: { id: asset.projectId },
      select: { id: true },
    });
    if (!project) {
      return handleRouteError(new Error("Project not found."));
    }

    const force = request.nextUrl.searchParams.get("force") === "1";
    const score = await scoreGeneratedImage(context.params.id, { force });
    return ok({ score });
  } catch (error) {
    return handleRouteError(error);
  }
}
