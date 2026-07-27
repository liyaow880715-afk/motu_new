import { buildImageArchive } from "@/lib/services/export-service";
import { handleRouteError } from "@/lib/utils/route";
import { authorizeProjectRequest } from "@/lib/utils/api-auth";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await authorizeProjectRequest(request, (await context.params).id);
    if (denied) return denied;
    const stream = await buildImageArchive((await context.params).id);
    return new Response(stream as never, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${(await context.params).id}-detail-page-images.zip"`,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
