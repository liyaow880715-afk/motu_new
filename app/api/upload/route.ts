import { NextRequest } from "next/server";
import { z } from "zod";

import { findDuplicateUploadAsset, saveUploadAsset } from "@/lib/storage/asset-manager";
import { handleRouteError, ok } from "@/lib/utils/route";
import { authorizeProjectRequest } from "@/lib/utils/api-auth";
import { assertImageUploadContentLength, validateImageUpload } from "@/lib/validations/image-upload";

const assetTypeSchema = z.enum(["MAIN", "ANGLE", "DETAIL", "REFERENCE", "PACKAGING", "NUTRITION", "INGREDIENT"]);

export async function POST(request: NextRequest) {
  try {
    assertImageUploadContentLength(request);
    const formData = await request.formData();
    const file = formData.get("file");
    const projectId = z.string().min(1).parse(formData.get("projectId"));
    const type = assetTypeSchema.parse(formData.get("type") ?? "REFERENCE");

    const denied = await authorizeProjectRequest(request, projectId);
    if (denied) return denied;

    if (!(file instanceof File)) {
      throw new Error("file is required");
    }

    const validated = await validateImageUpload(Buffer.from(await file.arrayBuffer()), file.type);
    const duplicate = await findDuplicateUploadAsset({ projectId, type, sha256: validated.sha256 });
    if (duplicate) return ok({ ...duplicate, deduplicated: true });

    const asset = await saveUploadAsset({
      projectId,
      type,
      fileName: file.name,
      mimeType: validated.mimeType,
      fileBuffer: validated.buffer,
      sortOrder: 0,
      isMain: false,
      uploadMetadata: validated,
    });

    return ok({ ...asset, deduplicated: false }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
