import { NextRequest } from "next/server";
import { z } from "zod";

import {
  deletePalettePreset,
  updatePalettePreset,
} from "@/lib/services/palette-preset-service";
import { requireAuthenticatedAccessKeyId } from "@/lib/utils/api-auth";
import { handleRouteError, ok } from "@/lib/utils/route";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  colorTokens: z
    .object({
      primary: z.string(),
      secondary: z.string(),
      accent: z.string(),
      background: z.string(),
      surface: z.string(),
      text: z.string(),
    })
    .optional(),
  tags: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = requireAuthenticatedAccessKeyId(request);
    if (auth.response) return auth.response;
    const input = updateSchema.parse(await request.json());
    const preset = await updatePalettePreset((await context.params).id, input, auth.accessKeyId);
    if (!preset) {
      return handleRouteError(new Error("预设不存在或无权修改"));
    }
    return ok({ preset });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = requireAuthenticatedAccessKeyId(request);
    if (auth.response) return auth.response;
    const result = await deletePalettePreset((await context.params).id, auth.accessKeyId);
    if (!result) {
      return handleRouteError(new Error("预设不存在或无权删除"));
    }
    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
