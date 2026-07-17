import { NextRequest } from "next/server";

import { regeneratePaletteOptions } from "@/lib/services/color-palette-service";
import { handleRouteError, ok } from "@/lib/utils/route";

export async function POST(
  request: NextRequest,
  context: { params: { id: string } },
) {
  try {
    const result = await regeneratePaletteOptions(context.params.id);
    return ok({
      paletteOptions: result.paletteOptions,
      selectedPaletteId: result.selectedPalette?.id ?? null,
      styleGuide: result.styleGuide,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
