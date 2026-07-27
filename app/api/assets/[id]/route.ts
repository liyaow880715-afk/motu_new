import { deleteAssetRecord } from "@/lib/storage/asset-manager";
import { authorizeAssetRequest } from "@/lib/utils/api-auth";
import { handleRouteError, ok } from "@/lib/utils/route";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await authorizeAssetRequest(request, (await context.params).id);
    if (denied) return denied;
    const asset = await deleteAssetRecord((await context.params).id);
    return ok(asset);
  } catch (error) {
    return handleRouteError(error);
  }
}
