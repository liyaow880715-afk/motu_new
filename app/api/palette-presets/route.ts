import { NextRequest } from "next/server";
import { z } from "zod";

import {
  createPalettePreset,
  listPalettePresets,
} from "@/lib/services/palette-preset-service";
import {
  authorizeProjectRequest,
  requireAuthenticatedAccessKeyId,
} from "@/lib/utils/api-auth";
import { handleRouteError, ok } from "@/lib/utils/route";

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
  shareCode: z.string().length(6).optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuthenticatedAccessKeyId(request);
    if (auth.response) return auth.response;
    const presets = await listPalettePresets(auth.accessKeyId);
    return ok({ presets });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuthenticatedAccessKeyId(request);
    if (auth.response) return auth.response;
    const input = createSchema.parse(await request.json());
    if (input.projectId) {
      const denied = await authorizeProjectRequest(request, input.projectId);
      if (denied) return denied;
    }
    const preset = await createPalettePreset({
      name: input.name,
      description: input.description,
      colorTokens: input.colorTokens,
      tags: input.tags,
      category: input.category,
      accessKeyId: auth.accessKeyId,
      projectId: input.projectId,
      shareCode: input.shareCode,
    });
    return ok({ preset }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
