import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { assetPublicUrl, findDuplicateUploadAsset, saveUploadAsset } from "@/lib/storage/asset-manager";
import { handleRouteError, ok } from "@/lib/utils/route";
import { authorizeProjectRequest } from "@/lib/utils/api-auth";
import { assertImageUploadContentLength, decodeAndValidateBase64Image } from "@/lib/validations/image-upload";

const fileSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(["image/jpeg", "image/jpg", "image/png", "image/webp"]),
  base64Data: z.string().min(1),
});

const uploadSchema = z.union([
  fileSchema,
  z.object({ files: z.array(fileSchema).min(1).max(10) }),
]);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; sectionId: string }> },
) {
  try {
    assertImageUploadContentLength(request);
    const denied = await authorizeProjectRequest(request, (await context.params).id);
    if (denied) return denied;
    const body = await request.json();
    const parsed = uploadSchema.parse(body);
    const files = "files" in parsed ? parsed.files : [parsed];
    const { id: projectId, sectionId } = (await context.params);

    const section = await prisma.pageSection.findUnique({
      where: { id: sectionId },
    });
    if (!section || section.projectId !== projectId) {
      return handleRouteError(new Error("Section not found"));
    }

    const editableData = (section.editableData ?? {}) as Record<string, unknown>;
    const currentRefs = (editableData.referenceAssetIds as string[] | undefined) ?? [];
    const validatedFiles = await Promise.all(
      files.map(async (file) => ({
        file,
        validated: await decodeAndValidateBase64Image(file.base64Data, file.mimeType),
      })),
    );

    let existingCount = await prisma.productAsset.count({
      where: { projectId },
    });

    const createdAssets: { id: string; fileName: string; url: string | null; deduplicated: boolean }[] = [];
    for (const { file, validated } of validatedFiles) {
      const existing = await findDuplicateUploadAsset({
        projectId,
        type: "REFERENCE",
        sha256: validated.sha256,
      });
      const asset = existing ?? (await saveUploadAsset({
          projectId,
          type: "REFERENCE",
          fileName: file.fileName,
          mimeType: validated.mimeType,
          fileBuffer: validated.buffer,
          sortOrder: existingCount++,
          isMain: false,
          uploadMetadata: validated,
        }));
      createdAssets.push({
        id: asset.id,
        fileName: asset.fileName,
        url: assetPublicUrl(asset),
        deduplicated: Boolean(existing),
      });
      if (!currentRefs.includes(asset.id)) currentRefs.push(asset.id);
    }

    await prisma.pageSection.update({
      where: { id: sectionId },
      data: {
        editableData: {
          ...editableData,
          referenceAssetIds: currentRefs,
        } as Prisma.InputJsonValue,
      },
    });

    return ok({ assets: createdAssets, referenceAssetIds: currentRefs }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
