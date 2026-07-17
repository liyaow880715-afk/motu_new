import { NextRequest } from "next/server";
import { z } from "zod";

import {
  createPalettePreset,
  listPalettePresets,
} from "@/lib/services/palette-preset-service";
import { handleRouteError, ok } from "@/lib/utils/route";
import { env } from "@/lib/utils/env";

function getAccessKeyFromHeader(request: NextRequest): string | undefined {
  if (env.APP_RUNTIME === "desktop") return undefined;
  return request.headers.get("x-access-key") ?? undefined;
}

const createSchema = z.object({
  name: z.string().min(1, "预设名称不能为空"),
  description: z.string().optional().nullable(),
  colorTokens: z.object({
    primary: z.string(),
    secondary: z.string(),
    accent: z.string(),
    background: z.string(),
    surface: z.string(),
    text: z.string(),
  }),
  tags: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const accessKey = getAccessKeyFromHeader(request);
    const presets = await listPalettePresets(accessKey);
    return ok({ presets });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const accessKey = getAccessKeyFromHeader(request);
    const input = createSchema.parse(await request.json());
    const preset = await createPalettePreset({
      name: input.name,
      description: input.description,
      colorTokens: input.colorTokens,
      tags: input.tags,
      category: input.category,
      accessKeyId: accessKey,
      projectId: input.projectId,
    });
    return ok({ preset }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
