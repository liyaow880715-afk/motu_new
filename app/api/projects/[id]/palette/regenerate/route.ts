import { NextRequest } from "next/server";

import { regeneratePaletteOptions } from "@/lib/services/color-palette-service";
import { handleRouteError, ok } from "@/lib/utils/route";

export async function POST(
  request: NextRequest,
  context: { params: { id: string } },
) {
  try {
    const body = await request.json().catch(() => ({}));
    const style = body.style === "bold" || body.style === "contrast" ? body.style : "safe";
    const result = await regeneratePaletteOptions(context.params.id, { style });
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
