import { NextRequest } from "next/server";
import { z } from "zod";

import { analyzeHeroTemplate } from "@/lib/services/hero-template-service";
import { checkAdminOrDesktop } from "@/lib/utils/admin-check";
import { handleRouteError, ok, fail } from "@/lib/utils/route";

const analyzeSchema = z.object({
  productImage: z.string().min(1, "请上传参考主图"),
  description: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    if (!checkAdminOrDesktop(request)) {
      return fail("UNAUTHORIZED", "管理员密码错误", null, 403);
    }
    const parsed = analyzeSchema.parse(await request.json());
    const { structure, rawText } = await analyzeHeroTemplate(parsed.productImage, parsed.description);

    return ok({
      structure,
      styleProfile: {
        overallStyle: structure.overallStyle,
        colorPalette: [
          structure.colorPalette.background,
          structure.colorPalette.primary,
          structure.colorPalette.secondary,
          structure.colorPalette.accent,
          structure.colorPalette.text,
        ],
        typography: structure.typography,
      },
      rawAnalysis: rawText,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
