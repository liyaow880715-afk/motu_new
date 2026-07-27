import { NextRequest } from "next/server";

import { editSectionImage } from "@/lib/services/generation-service";
import { generationRequestSchema } from "@/lib/validations/generation";
import { handleRouteError, ok } from "@/lib/utils/route";
import { authorizeProjectRequest } from "@/lib/utils/api-auth";
import { executeIdempotentGeneration } from "@/lib/services/idempotent-generation-service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; sectionId: string }> },
) {
  try {
    const { id, sectionId } = await context.params;
    const denied = await authorizeProjectRequest(request, id);
    if (denied) return denied;
    const input = generationRequestSchema.parse(await request.json().catch(() => ({})));
    return executeIdempotentGeneration(
      request,
      id,
      input.idempotencyKey,
      (idempotencyKey) =>
        editSectionImage(id, sectionId, {
          preferredModelId: input.modelId,
          referenceAssetIds: input.referenceAssetIds,
          editMode: input.editMode,
          idempotencyKey,
        }),
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
