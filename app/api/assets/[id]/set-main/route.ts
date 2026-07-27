import { prisma } from "@/lib/db/prisma";
import { authorizeAssetRequest } from "@/lib/utils/api-auth";
import { handleRouteError, ok } from "@/lib/utils/route";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await authorizeAssetRequest(request, (await context.params).id);
    if (denied) return denied;
    const asset = await prisma.productAsset.findUnique({
      where: { id: (await context.params).id },
    });

    if (!asset) {
      throw new Error("Asset not found.");
    }

    await prisma.productAsset.updateMany({
      where: {
        projectId: asset.projectId,
        type: "MAIN",
      },
      data: { isMain: false, type: "ANGLE" },
    });

    const updated = await prisma.productAsset.update({
      where: { id: (await context.params).id },
      data: {
        isMain: true,
        type: "MAIN",
      },
    });

    return ok(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}
