import { NextRequest } from "next/server";
import { z } from "zod";

import { createTemplate, getAllTemplates } from "@/lib/services/hero-template-service";
import { checkAdminOrDesktop } from "@/lib/utils/admin-check";
import { handleRouteError, ok, fail } from "@/lib/utils/route";

const sceneCreateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "场景名称不能为空"),
  sortOrder: z.number().default(0),
  stylePrompt: z.string().min(1, "场景风格描述不能为空"),
  layoutOverrides: z.record(z.string(), z.unknown()).optional(),
  referenceHeroImage: z.string().nullable().optional(),
  aspectRatio: z.string().nullable().optional(),
});

const createSchema = z.object({
  name: z.string().min(1, "请输入模板名称"),
  referenceImageUrl: z.string().min(1, "请上传参考主图"),
  structureJson: z.record(z.string(), z.unknown()),
  styleProfile: z.record(z.string(), z.unknown()),
  category: z.string().optional(),
  description: z.string().optional(),
  rawAnalysis: z.string().optional(),
  scenes: z.array(sceneCreateSchema).optional(),
});

export async function GET(request: NextRequest) {
  try {
    if (!checkAdminOrDesktop(request)) {
      return fail("UNAUTHORIZED", "管理员密码错误", null, 403);
    }
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") ?? undefined;
    const templates = await getAllTemplates(category);
    return ok(templates);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!checkAdminOrDesktop(request)) {
      return fail("UNAUTHORIZED", "管理员密码错误", null, 403);
    }
    const parsed = createSchema.parse(await request.json());
    const template = await createTemplate({
      name: parsed.name,
      referenceImageUrl: parsed.referenceImageUrl,
      structureJson: parsed.structureJson as any,
      styleProfile: parsed.styleProfile as any,
      category: parsed.category,
      description: parsed.description,
      rawAnalysis: parsed.rawAnalysis,
      scenes: parsed.scenes,
    });
    return ok(template);
  } catch (error) {
    return handleRouteError(error);
  }
}
