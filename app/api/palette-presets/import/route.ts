import { NextRequest } from "next/server";
import { z } from "zod";

import { importPalettePresetByShareCode } from "@/lib/services/palette-preset-service";
import { requireAuthenticatedAccessKeyId } from "@/lib/utils/api-auth";
import { handleRouteError, ok } from "@/lib/utils/route";

const importSchema = z.object({
  shareCode: z.string().length(6).toUpperCase(),
});

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuthenticatedAccessKeyId(request);
    if (auth.response) return auth.response;
    const input = importSchema.parse(await request.json());
    const preset = await importPalettePresetByShareCode(input.shareCode, auth.accessKeyId);
    if (!preset) {
      return handleRouteError(new Error("分享码不存在或已失效"));
    }
    return ok({ preset }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
