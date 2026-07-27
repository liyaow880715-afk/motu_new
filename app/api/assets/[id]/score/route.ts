import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import {
  getImageQualityScore,
  scoreAndReconcileGeneratedImage,
} from "@/lib/services/image-quality-service";
import { authorizeAssetRequest } from "@/lib/utils/api-auth";
import { handleRouteError, ok } from "@/lib/utils/route";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await authorizeAssetRequest(request, (await context.params).id);
    if (denied) return denied;
    const asset = await prisma.productAsset.findUnique({
      where: { id: (await context.params).id },
      select: { id: true },
    });
    if (!asset) {
      return handleRouteError(new Error("Asset not found."));
    }

    const score = await getImageQualityScore((await context.params).id);
    return ok({ score });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await authorizeAssetRequest(request, (await context.params).id);
    if (denied) return denied;
    const asset = await prisma.productAsset.findUnique({
      where: { id: (await context.params).id },
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
    const result = await scoreAndReconcileGeneratedImage((await context.params).id, { force });
    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
