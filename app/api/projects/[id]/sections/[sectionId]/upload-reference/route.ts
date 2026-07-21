import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { saveUploadAsset } from "@/lib/storage/asset-manager";
import { handleRouteError, ok } from "@/lib/utils/route";

const fileSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  base64Data: z.string().min(1),
});

const uploadSchema = z.union([
  fileSchema,
  z.object({ files: z.array(fileSchema) }),
]);

export async function POST(
  request: NextRequest,
  context: { params: { id: string; sectionId: string } },
) {
  try {
    const body = await request.json();
    const parsed = uploadSchema.parse(body);
    const files = "files" in parsed ? parsed.files : [parsed];
    const { id: projectId, sectionId } = context.params;

    const section = await prisma.pageSection.findUnique({
      where: { id: sectionId },
    });
    if (!section || section.projectId !== projectId) {
      return handleRouteError(new Error("Section not found"));
    }

    const editableData = (section.editableData ?? {}) as Record<string, unknown>;
    const currentRefs = (editableData.referenceAssetIds as string[] | undefined) ?? [];

    let existingCount = await prisma.productAsset.count({
      where: { projectId },
    });

    const createdAssets: { id: string; fileName: string; url: string }[] = [];
    for (const file of files) {
      const asset = await saveUploadAsset({
        projectId,
        type: "REFERENCE",
        fileName: file.fileName,
        mimeType: file.mimeType,
        fileBuffer: Buffer.from(file.base64Data, "base64"),
        sortOrder: existingCount++,
        isMain: false,
      });
      createdAssets.push({
        id: asset.id,
        fileName: asset.fileName,
        url: "",
      });
      currentRefs.push(asset.id);
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
