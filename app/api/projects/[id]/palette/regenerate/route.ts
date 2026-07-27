import { NextRequest } from "next/server";

import { regeneratePaletteOptions } from "@/lib/services/color-palette-service";
import { handleRouteError, ok } from "@/lib/utils/route";
import { authorizeProjectRequest } from "@/lib/utils/api-auth";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await authorizeProjectRequest(request, (await context.params).id);
    if (denied) return denied;
    const body = await request.json().catch(() => ({}));
    const style = body.style === "bold" || body.style === "contrast" ? body.style : "safe";
    const result = await regeneratePaletteOptions((await context.params).id, { style });
    return ok({
      paletteOptions: result.paletteOptions,
      selectedPaletteId: result.selectedPalette?.id ?? null,
      styleGuide: result.styleGuide,
      paletteStyle: result.paletteStyle,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
