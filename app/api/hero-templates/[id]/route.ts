import { NextRequest } from "next/server";
import { z } from "zod";

import { deleteTemplate, getTemplateById, updateTemplate } from "@/lib/services/hero-template-service";
import { checkAdminOrDesktop } from "@/lib/utils/admin-check";
import { handleRouteError, ok, fail } from "@/lib/utils/route";

const sceneUpdateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  sortOrder: z.number().default(0),
  stylePrompt: z.string().min(1),
  layoutOverrides: z.record(z.string(), z.unknown()).optional(),
  referenceHeroImage: z.string().nullable().optional(),
  aspectRatio: z.string().nullable().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  structureJson: z.record(z.string(), z.unknown()).optional(),
  styleProfile: z.record(z.string(), z.unknown()).optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  scenes: z.array(sceneUpdateSchema).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!checkAdminOrDesktop(request)) {
      return fail("UNAUTHORIZED", "管理员密码错误", null, 403);
    }
    const { id } = await params;
    const template = await getTemplateById(id);
    if (!template) {
      return handleRouteError(new Error("模板不存在"));
    }
    return ok(template);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!checkAdminOrDesktop(request)) {
      return fail("UNAUTHORIZED", "管理员密码错误", null, 403);
    }
    const { id } = await params;
    const parsed = updateSchema.parse(await request.json());
    const template = await updateTemplate(id, {
      name: parsed.name,
      structureJson: parsed.structureJson as any,
      styleProfile: parsed.styleProfile as any,
      category: parsed.category,
      description: parsed.description,
      scenes: parsed.scenes,
    });
    return ok(template);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!checkAdminOrDesktop(request)) {
      return fail("UNAUTHORIZED", "管理员密码错误", null, 403);
    }
    const { id } = await params;
    await deleteTemplate(id);
    return ok({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
