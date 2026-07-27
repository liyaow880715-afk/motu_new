import { buildProjectJson } from "@/lib/services/export-service";
import { handleRouteError } from "@/lib/utils/route";
import { authorizeProjectRequest } from "@/lib/utils/api-auth";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await authorizeProjectRequest(request, (await context.params).id);
    if (denied) return denied;
    const payload = await buildProjectJson((await context.params).id);
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${(await context.params).id}.json"`,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
