import { NextRequest } from "next/server";
import { z } from "zod";

import {
  deletePalettePreset,
  updatePalettePreset,
} from "@/lib/services/palette-preset-service";
import { handleRouteError, ok } from "@/lib/utils/route";
import { env } from "@/lib/utils/env";

function getAccessKeyFromHeader(request: NextRequest): string | undefined {
  if (env.APP_RUNTIME === "desktop") return undefined;
  return request.headers.get("x-access-key") ?? undefined;
}

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
  context: { params: { id: string } },
) {
  try {
    const accessKey = getAccessKeyFromHeader(request);
    const input = updateSchema.parse(await request.json());
    const preset = await updatePalettePreset(context.params.id, input, accessKey);
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
  context: { params: { id: string } },
) {
  try {
    const accessKey = getAccessKeyFromHeader(request);
    const result = await deletePalettePreset(context.params.id, accessKey);
    if (!result) {
      return handleRouteError(new Error("预设不存在或无权删除"));
    }
    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
