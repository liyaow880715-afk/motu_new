import { NextRequest } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { authorizeAssetRequest } from "@/lib/utils/api-auth";
import { handleRouteError, ok } from "@/lib/utils/route";

const reorderSchema = z.object({
  sortOrder: z.number().int().min(0),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await authorizeAssetRequest(request, (await context.params).id);
    if (denied) return denied;
    const input = reorderSchema.parse(await request.json());
    const asset = await prisma.productAsset.update({
      where: { id: (await context.params).id },
      data: { sortOrder: input.sortOrder },
    });
    return ok(asset);
  } catch (error) {
    return handleRouteError(error);
  }
}
