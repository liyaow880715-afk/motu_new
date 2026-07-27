import { NextRequest } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { findDuplicateUploadAsset, saveUploadAsset } from "@/lib/storage/asset-manager";
import { handleRouteError, ok } from "@/lib/utils/route";
import { authorizeProjectRequest } from "@/lib/utils/api-auth";
import { assertImageUploadContentLength, decodeAndValidateBase64Image } from "@/lib/validations/image-upload";

const uploadAssetSchema = z.object({
  type: z.enum(["MAIN", "ANGLE", "DETAIL", "REFERENCE", "PACKAGING", "NUTRITION", "INGREDIENT"]),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(["image/jpeg", "image/jpg", "image/png", "image/webp"]),
  base64Data: z.string().min(1),
  variantId: z.string().optional().nullable(),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertImageUploadContentLength(request);
    const denied = await authorizeProjectRequest(request, (await context.params).id);
    if (denied) return denied;
    const input = uploadAssetSchema.parse(await request.json());
    const validated = await decodeAndValidateBase64Image(input.base64Data, input.mimeType);
    if (input.variantId) {
      const variant = await prisma.productVariant.findFirst({
        where: { id: input.variantId, projectId: (await context.params).id },
        select: { id: true },
      });
      if (!variant) throw new Error("Variant not found.");
    }

    const duplicate = await findDuplicateUploadAsset({
      projectId: (await context.params).id,
      type: input.type,
      sha256: validated.sha256,
      variantId: input.variantId,
    });
    if (duplicate) return ok({ ...duplicate, deduplicated: true });

    const existingCount = await prisma.productAsset.count({
      where: { projectId: (await context.params).id },
    });

    const asset = await saveUploadAsset({
      projectId: (await context.params).id,
      type: input.type,
      fileName: input.fileName,
      mimeType: validated.mimeType,
      fileBuffer: validated.buffer,
      sortOrder: existingCount,
      isMain: input.type === "MAIN" && !input.variantId,
      variantId: input.variantId ?? undefined,
      uploadMetadata: validated,
    });

    return ok({ ...asset, deduplicated: false }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
